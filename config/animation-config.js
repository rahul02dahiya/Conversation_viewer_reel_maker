export const ANIMATION_CONFIG = {
    audio: {
        filePath: "./call.mp3",
        startOffset: 1.5,
        ringFilePath: "./assets/ring.wav",
        ringVolume: 0.6,
    },
    video: {
        width: 1080,
        height: 1920,
        fps: 30,
    },
    layout: {
        avatarSize: 270,
        logoSize: 270,
    },
    waveform: {
        barCount: 28,
        barWidth: 10,
        barSpacing: 12,
        minHeight: 8,
        maxHeight: 140,
        sensitivity: 2.8,
        smoothing: 0.45,
        noiseFloor: 0.012,
    },
    callStates: {
        initialDuration: 0.4,
        connectingDuration: 0.8,
        disconnectFadeDuration: 1.0,
    },
};
