import { ANIMATION_CONFIG } from "../config/animation-config.js";
import { conversation } from "../config/timeline-config.js";
import { loadAudio, validateConversation } from "./audio-loader.js";
import { createAudioAnalyser } from "./audio-analyser.js";
import { createWaveform } from "./waveform.js";
import { createCallTimeline } from "./timeline.js";

const params = new URLSearchParams(window.location.search);
const isRenderMode = params.get("render") === "1";

document.body.classList.toggle("render-mode", isRenderMode);
document.body.classList.toggle("preview-mode", !isRenderMode);

const stageViewport = document.getElementById("stage-viewport");
const reelStage = document.getElementById("reel-stage");
const bgVideo = document.getElementById("bg-video");
if (isRenderMode && bgVideo) {
    bgVideo.removeAttribute("src");
}
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const playBtn = document.getElementById("play-btn");
const restartBtn = document.getElementById("restart-btn");
const scrubber = document.getElementById("scrubber");
const timeDisplay = document.getElementById("time-display");
const waveformContainer = document.getElementById("central-waveform");

reelStage.style.setProperty("--avatar-size", `${ANIMATION_CONFIG.layout.avatarSize}px`);

function parseCssRgb(varName) {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (hex.startsWith("#") && hex.length === 7) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
        ];
    }
    return [218, 220, 224];
}

function updatePreviewScale() {
    if (isRenderMode) return;
    const scale = stageViewport.clientWidth / ANIMATION_CONFIG.video.width;
    reelStage.style.setProperty("--preview-scale", String(scale));
}

window.addEventListener("resize", updatePreviewScale);
updatePreviewScale();

const wfConfig = ANIMATION_CONFIG.waveform;
const centralWaveform = createWaveform(waveformContainer, {
    ...wfConfig,
    colorVar: "--muted-color",
});

let audioCtx = null;
let audioBuffer = null;
let ringBuffer = null;
let analyser = null;
let callTimeline = null;
let sourceNode = null;
let ringSourceNode = null;
let isPlaying = false;
let playbackStartCtxTime = 0;
let currentOffset = 0;
let rafId = null;

function formatTime(sec) {
    const mins = Math.floor(sec / 60);
    const secs = (sec % 60).toFixed(2).padStart(5, "0");
    return `${mins}:${secs}`;
}

function renderAtTime(t) {
    if (!analyser || !callTimeline) return;
    const clamped = Math.max(0, Math.min(callTimeline.totalDuration, t));
    const tl = callTimeline.getStateAt(clamped);

    reelStage.dataset.section = tl.section;

    if (tl.section === "opening") {
        reelStage.style.setProperty("--shake-deg", `${tl.shakeDeg.toFixed(2)}deg`);
        reelStage.style.setProperty("--shake-x", `${tl.shakeX.toFixed(2)}px`);
        reelStage.style.setProperty("--opening-opacity", tl.overlayOpacity.toFixed(3));
    } else if (tl.section === "transition" && !isRenderMode) {
        if (!isPlaying || Math.abs(bgVideo.currentTime - tl.transitionTime) > 0.15) {
            bgVideo.currentTime = tl.transitionTime;
        }
    } else if (tl.section === "conversation") {
        reelStage.style.setProperty("--avatar-opacity", tl.avatarOpacity.toFixed(3));
        reelStage.style.setProperty("--avatar-scale", tl.avatarScale.toFixed(3));
        reelStage.style.setProperty("--conversation-opacity", tl.overlayOpacity.toFixed(3));

        const audioState = analyser.getStateAt(clamped);
        reelStage.dataset.activeSpeaker = audioState.activeSpeaker || "none";
        centralWaveform.render(audioState.bars, audioState.color);
    }

    if (!isRenderMode) {
        scrubber.value = clamped.toFixed(3);
        timeDisplay.textContent = `${formatTime(clamped)} / ${formatTime(callTimeline.totalDuration)}`;
    }
}

window.renderAtTime = renderAtTime;

function stopPlayback() {
    if (sourceNode) {
        sourceNode.onended = null;
        try {
            sourceNode.stop();
        } catch {}
        sourceNode.disconnect();
        sourceNode = null;
    }
    if (ringSourceNode) {
        try {
            ringSourceNode.stop();
        } catch {}
        ringSourceNode.disconnect();
        ringSourceNode = null;
    }
    if (!isRenderMode) {
        bgVideo.pause();
    }
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    isPlaying = false;
    playBtn.textContent = "Play";
}

function tick() {
    if (!isPlaying || !audioCtx || !callTimeline) return;
    const elapsed = currentOffset + (audioCtx.currentTime - playbackStartCtxTime);
    if (elapsed >= callTimeline.totalDuration) {
        currentOffset = callTimeline.totalDuration;
        renderAtTime(currentOffset);
        stopPlayback();
        return;
    }
    const tl = callTimeline.getStateAt(elapsed);
    if (tl.section === "transition" && bgVideo.paused) {
        bgVideo.currentTime = tl.transitionTime;
        bgVideo.play().catch(() => {});
    } else if (tl.section !== "transition" && !bgVideo.paused) {
        bgVideo.pause();
    }
    renderAtTime(elapsed);
    rafId = requestAnimationFrame(tick);
}

async function startPlayback() {
    if (!audioCtx || !audioBuffer || !callTimeline) return;
    if (audioCtx.state === "suspended") {
        await audioCtx.resume();
    }
    if (currentOffset >= callTimeline.totalDuration) {
        currentOffset = 0;
    }

    stopPlayback();

    const { ringtoneEnabled, ringtoneStart, ringtoneDuration, ringtoneVolume, conversationVolume } =
        ANIMATION_CONFIG.audio;
    const ringEnd = Math.min(callTimeline.openingEnd, ringtoneStart + ringtoneDuration);

    if (ringtoneEnabled && ringBuffer && currentOffset < ringEnd) {
        const delay = Math.max(0, ringtoneStart - currentOffset);
        const offset = Math.max(0, currentOffset - ringtoneStart);
        const remaining = Math.min(ringBuffer.duration - offset, ringEnd - Math.max(currentOffset, ringtoneStart));
        if (remaining > 0) {
            const gain = audioCtx.createGain();
            gain.gain.value = ringtoneVolume ?? 0.45;
            ringSourceNode = audioCtx.createBufferSource();
            ringSourceNode.buffer = ringBuffer;
            ringSourceNode.connect(gain);
            gain.connect(audioCtx.destination);
            ringSourceNode.start(audioCtx.currentTime + delay, offset, remaining);
        }
    }

    const convStart = callTimeline.conversationStart;
    const convDelay = Math.max(0, convStart - currentOffset);
    const convOffset = Math.max(0, currentOffset - convStart);

    if (convOffset < audioBuffer.duration) {
        const gain = audioCtx.createGain();
        gain.gain.value = conversationVolume ?? 1.0;
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(gain);
        gain.connect(audioCtx.destination);
        sourceNode.start(audioCtx.currentTime + convDelay, convOffset);
    }

    playbackStartCtxTime = audioCtx.currentTime;
    isPlaying = true;
    playBtn.textContent = "Pause";
    rafId = requestAnimationFrame(tick);
}

playBtn.addEventListener("click", async () => {
    if (isPlaying) {
        currentOffset += audioCtx.currentTime - playbackStartCtxTime;
        stopPlayback();
        renderAtTime(currentOffset);
    } else {
        await startPlayback();
    }
});

restartBtn.addEventListener("click", async () => {
    stopPlayback();
    currentOffset = 0;
    renderAtTime(0);
    await startPlayback();
});

scrubber.addEventListener("input", () => {
    const wasPlaying = isPlaying;
    stopPlayback();
    currentOffset = parseFloat(scrubber.value);
    renderAtTime(currentOffset);
    if (wasPlaying) {
        startPlayback();
    }
});

async function init() {
    try {
        statusEl.textContent = `Loading ${ANIMATION_CONFIG.audio.filePath}...`;
        const loaded = await loadAudio(ANIMATION_CONFIG.audio.filePath);
        audioCtx = loaded.audioCtx;
        audioBuffer = loaded.audioBuffer;

        if (ANIMATION_CONFIG.audio.ringtoneEnabled && ANIMATION_CONFIG.audio.ringFilePath) {
            const ringRes = await fetch(ANIMATION_CONFIG.audio.ringFilePath);
            if (!ringRes.ok) {
                throw new Error(`Ringtone "${ANIMATION_CONFIG.audio.ringFilePath}" failed to load.`);
            }
            ringBuffer = await audioCtx.decodeAudioData(await ringRes.arrayBuffer());
        }

        const validated = validateConversation(conversation, audioBuffer.duration);
        callTimeline = createCallTimeline({
            openingHoldDuration: ANIMATION_CONFIG.video.openingHoldDuration,
            transitionDuration: ANIMATION_CONFIG.video.transitionDuration,
            outroHoldDuration: ANIMATION_CONFIG.video.outroHoldDuration,
            audioDuration: audioBuffer.duration,
            avatarRevealDuration: ANIMATION_CONFIG.layout.avatarRevealDuration,
        });

        analyser = createAudioAnalyser(audioBuffer, validated, {
            startOffset: callTimeline.conversationStart,
            ...wfConfig,
            colors: {
                customer: parseCssRgb("--customer-color"),
                ai: parseCssRgb("--brand-orange"),
                muted: parseCssRgb("--muted-color"),
            },
        });

        scrubber.max = callTimeline.totalDuration.toFixed(3);
        scrubber.step = (1 / ANIMATION_CONFIG.video.fps).toFixed(4);
        playBtn.disabled = false;
        restartBtn.disabled = false;
        scrubber.disabled = false;

        statusEl.textContent = `Ready — ${callTimeline.totalDuration.toFixed(2)}s total (${validated.length} segments)`;
        renderAtTime(0);

        window.__REEL_META__ = {
            fps: ANIMATION_CONFIG.video.fps,
            width: ANIMATION_CONFIG.video.width,
            height: ANIMATION_CONFIG.video.height,
            openingEnd: callTimeline.openingEnd,
            transitionEnd: callTimeline.transitionEnd,
            conversationStart: callTimeline.conversationStart,
            totalDuration: callTimeline.totalDuration,
            transitionVideo: ANIMATION_CONFIG.video.transitionVideo,
            audioFile: ANIMATION_CONFIG.audio.filePath,
            conversationVolume: ANIMATION_CONFIG.audio.conversationVolume,
            ringtoneEnabled: ANIMATION_CONFIG.audio.ringtoneEnabled,
            ringFile: ANIMATION_CONFIG.audio.ringFilePath,
            ringtoneStart: ANIMATION_CONFIG.audio.ringtoneStart,
            ringtoneDuration: ANIMATION_CONFIG.audio.ringtoneDuration,
            ringtoneVolume: ANIMATION_CONFIG.audio.ringtoneVolume,
        };
        window.__REEL_READY__ = true;
    } catch (err) {
        statusEl.textContent = "Initialization failed";
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        window.__REEL_ERROR__ = err.message;
    }
}

init();
