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
const callStatusText = document.getElementById("call-status-text");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const playBtn = document.getElementById("play-btn");
const restartBtn = document.getElementById("restart-btn");
const scrubber = document.getElementById("scrubber");
const timeDisplay = document.getElementById("time-display");
const customerContainer = document.getElementById("customer-waveform");
const aiContainer = document.getElementById("ai-waveform");
const aiLogo = document.getElementById("ai-logo");

// Apply configurable layout dimensions
reelStage.style.setProperty("--avatar-size", `${ANIMATION_CONFIG.layout.avatarSize}px`);
reelStage.style.setProperty("--logo-size", `${ANIMATION_CONFIG.layout.logoSize}px`);

function updatePreviewScale() {
    if (isRenderMode) return;
    const scale = stageViewport.clientWidth / ANIMATION_CONFIG.video.width;
    reelStage.style.setProperty("--preview-scale", String(scale));
}

window.addEventListener("resize", updatePreviewScale);
updatePreviewScale();

aiLogo.addEventListener("error", () => {
    if (!isRenderMode && errorEl.hidden) {
        errorEl.textContent = "Missing assets/favicon.svg — place the ReceptionMonk logo at assets/favicon.svg.";
        errorEl.hidden = false;
    }
});

const wfConfig = ANIMATION_CONFIG.waveform;
const customerWaveform = createWaveform(customerContainer, {
    ...wfConfig,
    colorVar: "--customer-color",
});
const aiWaveform = createWaveform(aiContainer, {
    ...wfConfig,
    colorVar: "--brand-orange",
});

let audioCtx = null;
let audioBuffer = null;
let analyser = null;
let callTimeline = null;
let sourceNode = null;
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
    const callState = callTimeline.getStateAt(clamped);
    const audioState = analyser.getStateAt(clamped);

    reelStage.dataset.callState = callState.state;
    reelStage.dataset.activeSpeaker =
        callState.state === "conversation" && audioState.activeSpeaker
            ? audioState.activeSpeaker
            : "none";

    if (callState.state === "connecting") {
        reelStage.style.setProperty("--connecting-pulse", callState.pulse.toFixed(3));
        reelStage.style.setProperty("--connecting-scale", callState.scale.toFixed(3));
    } else if (callState.state === "ended") {
        reelStage.style.setProperty("--ended-progress", callState.progress.toFixed(3));
    }

    callStatusText.textContent = callState.label;
    customerWaveform.render(audioState.customer);
    aiWaveform.render(audioState.ai);

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

    const startOffset = ANIMATION_CONFIG.audio.startOffset;
    const startDelay = Math.max(0, startOffset - currentOffset);
    const audioOffset = Math.max(0, currentOffset - startOffset);

    if (audioOffset < audioBuffer.duration) {
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioCtx.destination);
        sourceNode.start(audioCtx.currentTime + startDelay, audioOffset);
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

        const validated = validateConversation(conversation, audioBuffer.duration);
        analyser = createAudioAnalyser(audioBuffer, validated, {
            startOffset: ANIMATION_CONFIG.audio.startOffset,
            ...wfConfig,
        });
        callTimeline = createCallTimeline({
            audioStartOffset: ANIMATION_CONFIG.audio.startOffset,
            audioDuration: audioBuffer.duration,
            callStates: ANIMATION_CONFIG.callStates,
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
            audioFile: ANIMATION_CONFIG.audio.filePath,
            audioStartOffset: ANIMATION_CONFIG.audio.startOffset,
            audioDuration: audioBuffer.duration,
            totalDuration: callTimeline.totalDuration,
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
