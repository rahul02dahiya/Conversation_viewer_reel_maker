/**
 * Pre-computes smoothed RMS amplitude envelopes from an AudioBuffer
 * and maps them deterministically to a single central waveform
 * with smooth color transitions between customer, AI, and silence.
 */

const ENVELOPE_RATE_HZ = 60;
const RMS_WINDOW_SEC = 0.04;
const BAR_TIME_SPREAD_SEC = 0.018;

function mixToMono(audioBuffer) {
    const length = audioBuffer.length;
    const channels = audioBuffer.numberOfChannels;
    if (channels === 1) {
        return audioBuffer.getChannelData(0);
    }

    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            mono[i] += data[i] / channels;
        }
    }
    return mono;
}

function computeSmoothedEnvelope(samples, sampleRate, smoothing, noiseFloor) {
    const duration = samples.length / sampleRate;
    const totalBins = Math.max(1, Math.ceil(duration * ENVELOPE_RATE_HZ));
    const halfWindowSamples = Math.max(1, Math.floor((RMS_WINDOW_SEC * sampleRate) / 2));
    const envelope = new Float32Array(totalBins);

    let prev = 0;
    const alpha = Math.max(0.05, Math.min(1, 1 - smoothing));

    for (let bin = 0; bin < totalBins; bin++) {
        const centerSample = Math.floor((bin / ENVELOPE_RATE_HZ) * sampleRate);
        const start = Math.max(0, centerSample - halfWindowSamples);
        const end = Math.min(samples.length, centerSample + halfWindowSamples);

        let sumSq = 0;
        const count = end - start;
        for (let i = start; i < end; i++) {
            const s = samples[i];
            sumSq += s * s;
        }

        const rawRms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        const gated = rawRms < noiseFloor ? 0 : rawRms - noiseFloor;
        prev = alpha * gated + (1 - alpha) * prev;
        envelope[bin] = prev;
    }

    return envelope;
}

function lerpRgb(c1, c2, t) {
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

export function createAudioAnalyser(audioBuffer, validatedConversation, config) {
    const {
        startOffset = 0,
        barCount = 45,
        sensitivity = 2.8,
        smoothing = 0.55,
        noiseFloor = 0.012,
        speakerColorTransition = 0.25,
        colors = {
            customer: [66, 133, 244],
            ai: [249, 115, 22],
            muted: [218, 220, 224],
        },
    } = config;

    const samples = mixToMono(audioBuffer);
    const envelope = computeSmoothedEnvelope(samples, audioBuffer.sampleRate, smoothing, noiseFloor);
    const duration = audioBuffer.duration;
    const silentBars = new Array(barCount).fill(0);

    function sampleEnvelopeAt(audioTime) {
        if (audioTime < 0 || audioTime > duration) {
            return 0;
        }
        const exactBin = audioTime * ENVELOPE_RATE_HZ;
        const idx0 = Math.min(envelope.length - 1, Math.max(0, Math.floor(exactBin)));
        const idx1 = Math.min(envelope.length - 1, idx0 + 1);
        const frac = exactBin - idx0;
        return envelope[idx0] * (1 - frac) + envelope[idx1] * frac;
    }

    function getSpeakerAt(audioTime) {
        if (audioTime < 0 || audioTime > duration) {
            return null;
        }
        for (let i = 0; i < validatedConversation.length; i++) {
            const seg = validatedConversation[i];
            if (audioTime >= seg.start && audioTime < seg.end) {
                return seg.speaker;
            }
        }
        return null;
    }

    function getColorForSpeaker(speaker) {
        if (speaker === "customer") return colors.customer;
        if (speaker === "ai") return colors.ai;
        return colors.muted;
    }

    function getBlendedColor(audioTime, currentSpeaker) {
        const target = getColorForSpeaker(currentSpeaker);
        if (speakerColorTransition <= 0) {
            return `rgb(${target[0]}, ${target[1]}, ${target[2]})`;
        }
        // Blend smoothly from the speaker slightly earlier in time
        const prevSpeaker = getSpeakerAt(audioTime - speakerColorTransition);
        if (prevSpeaker === currentSpeaker) {
            return `rgb(${target[0]}, ${target[1]}, ${target[2]})`;
        }
        // Find exact transition boundary inside [audioTime - speakerColorTransition, audioTime]
        let boundary = audioTime;
        for (let i = 0; i < validatedConversation.length; i++) {
            const seg = validatedConversation[i];
            if (seg.start <= audioTime && seg.start > audioTime - speakerColorTransition) {
                boundary = Math.max(boundary === audioTime ? seg.start : boundary, seg.start);
            }
            if (seg.end <= audioTime && seg.end > audioTime - speakerColorTransition) {
                boundary = Math.max(boundary === audioTime ? seg.end : boundary, seg.end);
            }
        }
        const elapsed = Math.max(0, Math.min(speakerColorTransition, audioTime - boundary));
        const blend = elapsed / speakerColorTransition;
        return lerpRgb(getColorForSpeaker(prevSpeaker), target, blend);
    }

    function buildBars(audioTime) {
        const center = (barCount - 1) / 2;
        const bars = new Array(barCount);
        for (let i = 0; i < barCount; i++) {
            const normDist = center > 0 ? Math.abs(i - center) / center : 0;
            const envelopeWeight = 0.45 + 0.55 * Math.cos((normDist * Math.PI) / 2);
            const tSample = audioTime + (i - center) * BAR_TIME_SPREAD_SEC;
            const rms = sampleEnvelopeAt(tSample);
            bars[i] = Math.min(1, Math.max(0, rms * sensitivity * envelopeWeight));
        }
        return bars;
    }

    function getStateAt(timelineTime) {
        const audioTime = timelineTime - startOffset;
        const activeSpeaker = getSpeakerAt(audioTime);
        const rms = sampleEnvelopeAt(audioTime);
        const color = getBlendedColor(audioTime, activeSpeaker);

        return {
            activeSpeaker,
            rms,
            color,
            bars: activeSpeaker ? buildBars(audioTime) : silentBars,
        };
    }

    return {
        duration,
        totalDuration: startOffset + duration,
        getStateAt,
    };
}
