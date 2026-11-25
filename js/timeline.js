/**
 * Deterministic 5-state call lifecycle timeline:
 * initial -> connecting -> connected -> conversation -> ended
 */

export function createCallTimeline({ audioStartOffset, audioDuration, callStates }) {
    const initialDur = Math.max(0, callStates?.initialDuration ?? 0.4);
    const connectingDur = Math.max(0, callStates?.connectingDuration ?? 0.8);
    const disconnectFadeDur = Math.max(0, callStates?.disconnectFadeDuration ?? 1.0);

    const connectingStart = Math.min(audioStartOffset, initialDur);
    const connectedStart = Math.min(audioStartOffset, connectingStart + connectingDur);
    const conversationStart = audioStartOffset;
    const conversationEnd = audioStartOffset + audioDuration;
    const totalDuration = conversationEnd + disconnectFadeDur;

    function getStateAt(t) {
        if (t < connectingStart) {
            return { state: "initial", label: "Incoming Call", progress: 0 };
        }
        if (t < connectedStart) {
            const p = connectingDur > 0 ? (t - connectingStart) / connectingDur : 1;
            const pulse = 0.45 + 0.55 * Math.abs(Math.sin(p * Math.PI * 3));
            const scale = 0.9 + 0.35 * Math.abs(Math.sin(p * Math.PI * 3));
            return { state: "connecting", label: "Connecting…", progress: p, pulse, scale };
        }
        if (t < conversationStart) {
            return { state: "connected", label: "Connected", progress: 1 };
        }
        if (t < conversationEnd) {
            return { state: "conversation", label: "Connected", progress: 1 };
        }

        const endedProgress = disconnectFadeDur > 0
            ? Math.min(1, (t - conversationEnd) / disconnectFadeDur)
            : 1;
        return { state: "ended", label: "Call Ended", progress: endedProgress };
    }

    return {
        totalDuration,
        conversationStart,
        conversationEnd,
        getStateAt,
    };
}
