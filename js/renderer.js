import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import ffmpegPath from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".json": "application/json",
};

function parseArgs(argv) {
    const opts = {
        out: path.join(ROOT_DIR, "output", "reel.mp4"),
        duration: null,
        chromePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    };

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--out" && argv[i + 1]) {
            opts.out = path.resolve(ROOT_DIR, argv[++i]);
        } else if (argv[i] === "--duration" && argv[i + 1]) {
            opts.duration = parseFloat(argv[++i]);
        } else if (argv[i] === "--chrome" && argv[i + 1]) {
            opts.chromePath = argv[++i];
        }
    }
    return opts;
}

function startStaticServer(rootDir) {
    const server = http.createServer((req, res) => {
        const cleanUrl = (req.url || "/").split("?")[0];
        const relPath = cleanUrl === "/" ? "index.html" : cleanUrl.replace(/^\/+/, "");
        const filePath = path.resolve(rootDir, relPath);

        if (!filePath.startsWith(rootDir)) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end("Not found");
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
            res.end(data);
        });
    });

    return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            resolve({ server, port: addr.port });
        });
    });
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (!ffmpegPath) {
        throw new Error("ffmpeg-static binary not found. Run npm install first.");
    }
    if (!fs.existsSync(opts.chromePath)) {
        throw new Error(`Chrome binary not found at "${opts.chromePath}". Set CHROME_PATH or pass --chrome.`);
    }
    if (!fs.existsSync(path.join(ROOT_DIR, "assets", "favicon.svg"))) {
        console.warn("[warn] assets/favicon.svg not found — AI avatar will appear blank until you add it.");
    }

    fs.mkdirSync(path.dirname(opts.out), { recursive: true });

    const { server, port } = await startStaticServer(ROOT_DIR);
    let browser;

    try {
        browser = await chromium.launch({
            executablePath: opts.chromePath,
            headless: true,
            args: ["--no-sandbox", "--disable-gpu"],
        });

        const page = await browser.newPage({
            viewport: { width: 1080, height: 1920 },
            deviceScaleFactor: 1,
        });

        await page.goto(`http://127.0.0.1:${port}/?render=1`, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__REEL_READY__ || window.__REEL_ERROR__, null, { timeout: 15000 });

        const initError = await page.evaluate(() => window.__REEL_ERROR__ || null);
        if (initError) {
            throw new Error(`Page initialization failed: ${initError}`);
        }

        const meta = await page.evaluate(() => window.__REEL_META__);
        const renderDuration = opts.duration && opts.duration > 0
            ? Math.min(opts.duration, meta.totalDuration)
            : meta.totalDuration;
        const totalFrames = Math.ceil(renderDuration * meta.fps);
        const audioInputPath = path.resolve(ROOT_DIR, meta.audioFile);
        const delayMs = Math.max(0, Math.round(meta.audioStartOffset * 1000));
        const ringInputPath = meta.ringFile ? path.resolve(ROOT_DIR, meta.ringFile) : null;
        const hasRing = Boolean(ringInputPath && fs.existsSync(ringInputPath) && meta.audioStartOffset > 0);

        console.log(`Rendering ${totalFrames} frames (${renderDuration.toFixed(2)}s @ ${meta.fps}fps) -> ${opts.out}`);

        const ffmpegArgs = [
            "-y",
            "-f", "image2pipe",
            "-vcodec", "png",
            "-framerate", String(meta.fps),
            "-i", "-",
            "-i", audioInputPath,
            ...(hasRing ? ["-i", ringInputPath] : []),
            "-filter_complex",
            hasRing
                ? `[1:a]adelay=${delayMs}|${delayMs},apad[call];[2:a]atrim=0:${meta.audioStartOffset.toFixed(3)},volume=${meta.ringVolume ?? 0.6}[ring];[ring][call]amix=inputs=2:duration=longest:normalize=0[a]`
                : `[1:a]adelay=${delayMs}|${delayMs},apad[a]`,
            "-map", "0:v:0",
            "-map", "[a]",
            "-t", renderDuration.toFixed(3),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            opts.out,
        ];

        const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ["pipe", "inherit", "pipe"] });
        let ffmpegStderr = "";
        ffmpeg.stderr.on("data", (chunk) => {
            ffmpegStderr += chunk.toString();
        });

        const ffmpegDone = new Promise((resolve, reject) => {
            ffmpeg.on("error", reject);
            ffmpeg.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg exited with code ${code}:\n${ffmpegStderr.slice(-1000)}`));
            });
        });

        for (let frame = 0; frame < totalFrames; frame++) {
            const t = frame / meta.fps;
            await page.evaluate((time) => window.renderAtTime(time), t);
            const pngBuffer = await page.screenshot({ type: "png" });
            if (!ffmpeg.stdin.write(pngBuffer)) {
                await new Promise((r) => ffmpeg.stdin.once("drain", r));
            }
            if ((frame + 1) % 30 === 0 || frame + 1 === totalFrames) {
                process.stdout.write(`\rProgress: ${frame + 1}/${totalFrames} frames`);
            }
        }
        process.stdout.write("\n");
        ffmpeg.stdin.end();
        await ffmpegDone;

        console.log(`Done! Saved ${opts.out}`);
    } finally {
        if (browser) await browser.close();
        server.close();
    }
}

main().catch((err) => {
    console.error("Render failed:", err.message);
    process.exit(1);
});
