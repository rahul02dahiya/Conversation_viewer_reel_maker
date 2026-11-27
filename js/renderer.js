import http from "node:http";
import fs from "node:fs";
import os from "node:os";
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
    ".mp4": "video/mp4",
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
        const cleanUrl = decodeURIComponent((req.url || "/").split("?")[0]);
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

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "inherit", "pipe"] });
        let stderr = "";
        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.slice(-1200)}`));
        });
    });
}

async function renderFramesToClip(page, { startTime, frameCount, fps, outPath, label }) {
    const args = [
        "-y",
        "-f", "image2pipe",
        "-vcodec", "png",
        "-framerate", String(fps),
        "-i", "-",
        "-r", String(fps),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "12",
        outPath,
    ];

    const ffmpeg = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });

    const done = new Promise((resolve, reject) => {
        ffmpeg.on("error", reject);
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg (${label}) exited with code ${code}:\n${stderr.slice(-1000)}`));
        });
    });

    for (let i = 0; i < frameCount; i++) {
        const t = startTime + i / fps;
        await page.evaluate((time) => window.renderAtTime(time), t);
        const pngBuffer = await page.screenshot({ type: "png" });
        if (!ffmpeg.stdin.write(pngBuffer)) {
            await new Promise((r) => ffmpeg.stdin.once("drain", r));
        }
        if ((i + 1) % 30 === 0 || i + 1 === frameCount) {
            process.stdout.write(`\r[${label}] ${i + 1}/${frameCount} frames`);
        }
    }
    process.stdout.write("\n");
    ffmpeg.stdin.end();
    await done;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (!ffmpegPath) {
        throw new Error("ffmpeg-static binary not found. Run npm install first.");
    }
    if (!fs.existsSync(opts.chromePath)) {
        throw new Error(`Chrome binary not found at "${opts.chromePath}". Set CHROME_PATH or pass --chrome.`);
    }

    const requiredAssets = [
        "call.mp3",
        "assets/background.mp4",
        "assets/bg-first.png",
        "assets/bg-last.png",
        "assets/Glossy Blue User Badge.png",
        "assets/Glossy Orange Meditating Monk Badge.png",
    ];
    for (const rel of requiredAssets) {
        if (!fs.existsSync(path.join(ROOT_DIR, rel))) {
            throw new Error(`Required asset missing: "${rel}"`);
        }
    }

    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-reel-"));

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

        await page.goto(`http://127.0.0.1:${port}/?render=1`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__REEL_READY__ || window.__REEL_ERROR__, null, { timeout: 15000 });

        const initError = await page.evaluate(() => window.__REEL_ERROR__ || null);
        if (initError) {
            throw new Error(`Page initialization failed: ${initError}`);
        }

        const meta = await page.evaluate(() => window.__REEL_META__);
        const fps = meta.fps;
        const renderDuration = opts.duration && opts.duration > 0
            ? Math.min(opts.duration, meta.totalDuration)
            : meta.totalDuration;

        const secAEnd = Math.min(renderDuration, meta.openingEnd);
        const secAFrames = Math.round(secAEnd * fps);

        const secBStart = meta.openingEnd;
        const secBEnd = Math.min(renderDuration, meta.transitionEnd);
        const secBDur = Math.max(0, secBEnd - secBStart);

        const secCStart = meta.transitionEnd;
        const secCFrames = Math.max(0, Math.round((renderDuration - secCStart) * fps));

        console.log(`Rendering ${renderDuration.toFixed(2)}s @ ${fps}fps -> ${opts.out}`);

        const videoInputs = [];
        const videoFilterParts = [];

        if (secAFrames > 0) {
            const secAPath = path.join(tmpDir, "secA.mp4");
            await renderFramesToClip(page, {
                startTime: 0,
                frameCount: secAFrames,
                fps,
                outPath: secAPath,
                label: "Opening",
            });
            videoFilterParts.push(`[${videoInputs.length}:v]setsar=1[v${videoInputs.length}]`);
            videoInputs.push(secAPath);
        }

        if (secBDur > 0.01) {
            const bgPath = path.resolve(ROOT_DIR, meta.transitionVideo);
            const idx = videoInputs.length;
            videoFilterParts.push(
                `[${idx}:v]scale=1080:1920:flags=lanczos,fps=${fps},setsar=1,trim=duration=${secBDur.toFixed(3)},setpts=PTS-STARTPTS[v${idx}]`
            );
            videoInputs.push(bgPath);
        }

        if (secCFrames > 0) {
            const secCPath = path.join(tmpDir, "secC.mp4");
            await renderFramesToClip(page, {
                startTime: secCStart,
                frameCount: secCFrames,
                fps,
                outPath: secCPath,
                label: "Conversation",
            });
            videoFilterParts.push(`[${videoInputs.length}:v]setsar=1[v${videoInputs.length}]`);
            videoInputs.push(secCPath);
        }

        const concatInputs = videoInputs.map((_, idx) => `[v${idx}]`).join("");
        const filterLines = [
            ...videoFilterParts,
            `${concatInputs}concat=n=${videoInputs.length}:v=1:a=0[v]`,
        ];

        const audioInputPath = path.resolve(ROOT_DIR, meta.audioFile);
        const convAudioIdx = videoInputs.length;
        const allInputs = [...videoInputs, audioInputPath];

        const convDelayMs = Math.max(0, Math.round(meta.conversationStart * 1000));
        const convVol = meta.conversationVolume ?? 1.0;

        const ringInputPath = meta.ringFile ? path.resolve(ROOT_DIR, meta.ringFile) : null;
        const hasRing = Boolean(
            meta.ringtoneEnabled &&
            ringInputPath &&
            fs.existsSync(ringInputPath) &&
            meta.ringtoneDuration > 0
        );

        if (hasRing) {
            const ringIdx = allInputs.length;
            allInputs.push(ringInputPath);
            const ringDelayMs = Math.max(0, Math.round((meta.ringtoneStart ?? 0) * 1000));
            const ringVol = meta.ringtoneVolume ?? 0.45;
            filterLines.push(
                `[${convAudioIdx}:a]adelay=${convDelayMs}|${convDelayMs},volume=${convVol},apad[call]`,
                `[${ringIdx}:a]atrim=0:${meta.ringtoneDuration.toFixed(3)},adelay=${ringDelayMs}|${ringDelayMs},volume=${ringVol}[ring]`,
                `[ring][call]amix=inputs=2:duration=longest:normalize=0[a]`
            );
        } else {
            filterLines.push(`[${convAudioIdx}:a]adelay=${convDelayMs}|${convDelayMs},volume=${convVol},apad[a]`);
        }

        const finalArgs = [
            "-y",
            ...allInputs.flatMap((p) => ["-i", p]),
            "-filter_complex", filterLines.join(";"),
            "-map", "[v]",
            "-map", "[a]",
            "-r", String(fps),
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

        console.log("Assembling final MP4...");
        await runFfmpeg(finalArgs);
        console.log(`Done! Saved ${opts.out}`);
    } finally {
        if (browser) await browser.close();
        server.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error("Render failed:", err.message);
    process.exit(1);
});
