/**
 * Pre-computes smoothed RMS amplitude envelopes from an AudioBuffer
 * and maps them deterministically to customer / AI waveform bars
 * using the validated conversation timeline.
 */

const ENVELOPE_RATE_HZ = 60;
const RMS_WINDOW_SEC = 0.04;
const BAR_TIME_SPREAD_SEC = 0.022;

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

export function createAudioAnalyser(audioBuffer, validatedConversation, config) {
    const {
        startOffset = 0,
        barCount = 28,
        sensitivity = 2.6,
        smoothing = 0.45,
        noiseFloor = 0.012,
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

    function getActiveSpeaker(audioTime) {
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

    function buildBars(audioTime) {
        const center = (barCount - 1) / 2;
        const bars = new Array(barCount);
        for (let i = 0; i < barCount; i++) {
            const normDist = center > 0 ? Math.abs(i - center) / center : 0;
            // Subtle center-weighted voice shape, driven purely by real RMS around audioTime
            const envelopeWeight = 0.45 + 0.55 * Math.cos((normDist * Math.PI) / 2);
            const tSample = audioTime + (i - center) * BAR_TIME_SPREAD_SEC;
            const rms = sampleEnvelopeAt(tSample);
            bars[i] = Math.min(1, Math.max(0, rms * sensitivity * envelopeWeight));
        }
        return bars;
    }

    function getStateAt(timelineTime) {
        const audioTime = timelineTime - startOffset;
        const activeSpeaker = getActiveSpeaker(audioTime);
        const rms = sampleEnvelopeAt(audioTime);

        if (activeSpeaker === "customer") {
            return {
                activeSpeaker,
                rms,
                customer: buildBars(audioTime),
                ai: silentBars,
            };
        }
        if (activeSpeaker === "ai") {
            return {
                activeSpeaker,
                rms,
                customer: silentBars,
                ai: buildBars(audioTime),
            };
        }

        return {
            activeSpeaker: null,
            rms,
            customer: silentBars,
            ai: silentBars,
        };
    }

    return {
        duration,
        totalDuration: startOffset + duration,
        getStateAt,
    };
}
