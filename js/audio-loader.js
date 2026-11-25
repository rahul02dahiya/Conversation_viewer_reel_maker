/**
 * Loads and decodes an audio file using the Web Audio API,
 * and validates the speaker conversation timeline.
 */

export async function loadAudio(filePath) {
    let response;
    try {
        response = await fetch(filePath);
    } catch (err) {
        throw new Error(`Failed to fetch audio file "${filePath}": ${err.message}`);
    }

    if (!response.ok) {
        throw new Error(
            `Audio file "${filePath}" could not be loaded (HTTP ${response.status} ${response.statusText}).`
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
        throw new Error("Web Audio API is not supported in this browser.");
    }

    const audioCtx = new AudioCtx();
    try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return { audioBuffer, audioCtx };
    } catch (err) {
        await audioCtx.close().catch(() => {});
        throw new Error(
            `Failed to decode audio file "${filePath}". Ensure it is a valid MP3/WAV/OGG file. (${err.message || err})`
        );
    }
}

export function validateConversation(conversation, audioDuration) {
    if (!Array.isArray(conversation)) {
        throw new Error("Conversation timeline must be an array of { start, end, speaker } objects.");
    }

    const DURATION_TOLERANCE = 0.05;
    const validSpeakers = new Set(["customer", "ai"]);
    const sorted = [...conversation].sort((a, b) => a.start - b.start);

    for (let i = 0; i < sorted.length; i++) {
        const seg = sorted[i];
        if (typeof seg.start !== "number" || typeof seg.end !== "number" || Number.isNaN(seg.start) || Number.isNaN(seg.end)) {
            throw new Error(`Timeline segment #${i + 1} has invalid start/end timestamps.`);
        }
        if (seg.start < 0) {
            throw new Error(`Timeline segment #${i + 1} has negative start time (${seg.start}s).`);
        }
        if (seg.start >= seg.end) {
            throw new Error(`Timeline segment #${i + 1} must have start < end (${seg.start}s >= ${seg.end}s).`);
        }
        if (!validSpeakers.has(seg.speaker)) {
            throw new Error(`Timeline segment #${i + 1} has invalid speaker "${seg.speaker}". Must be "customer" or "ai".`);
        }
        if (seg.end > audioDuration + DURATION_TOLERANCE) {
            throw new Error(
                `Timeline segment #${i + 1} ends at ${seg.end}s, which exceeds audio duration (${audioDuration.toFixed(2)}s).`
            );
        }
        if (i > 0 && seg.start < sorted[i - 1].end) {
            throw new Error(
                `Timeline segment #${i + 1} (${seg.start}s–${seg.end}s) overlaps with previous segment (${sorted[i - 1].start}s–${sorted[i - 1].end}s).`
            );
        }
    }

    return sorted;
}
