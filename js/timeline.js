/**
 * Deterministic 3-section visual timeline + decoupled audio start offset:
 *   Section A (opening):      0 -> openingHoldDuration (4.0s, synced with 2 rings)
 *   Section B (transition):   openingHoldDuration -> transitionEnd (8.04s background.mp4)
 *   Section C (conversation): transitionEnd -> totalDuration (frozen bg-last.png)
 *   Avatars, waveform & call.mp3 all start at conversationStartOffset (5.0s = 4.0s ring + 1.0s delay).
 */

export function createCallTimeline({
    openingHoldDuration,
    transitionDuration,
    outroHoldDuration,
    conversationStartOffset,
    audioDuration,
    avatarRevealDuration = 0.8,
}) {
    const openingEnd = Math.max(0, openingHoldDuration);
    const transitionEnd = openingEnd + Math.max(0, transitionDuration);
    const conversationStart = conversationStartOffset ?? transitionEnd;
    const conversationEnd = Math.max(transitionEnd, conversationStart + Math.max(0, audioDuration));
    const totalDuration = conversationEnd + Math.max(0, outroHoldDuration);

    function getStateAt(t) {
        if (t < openingEnd) {
            const p = openingEnd > 0 ? t / openingEnd : 1;
            // Synced with 4.0s ring.wav: ring 1 [0..1.5s], pause [1.5..2.2s], ring 2 [2.2..3.7s]
            const isRinging = (t >= 0 && t <= 1.5) || (t >= 2.2 && t <= 3.7);
            const shakeDeg = isRinging ? Math.sin(t * 48) * 11 : 0;
            const shakeX = isRinging ? Math.sin(t * 48) * 2.5 : 0;
            const fadeOut = openingEnd - t < 0.25 ? Math.max(0, (openingEnd - t) / 0.25) : 1;
            return {
                section: "opening",
                state: "ringing",
                showConversationOverlay: false,
                progress: p,
                shakeDeg,
                shakeX,
                overlayOpacity: fadeOut,
                avatarOpacity: 0,
                avatarScale: 0.92,
                transitionTime: 0,
            };
        }

        const isConversationActive = t >= conversationStart;
        const convLocalT = Math.max(0, t - conversationStart);
        const revealP = avatarRevealDuration > 0 ? Math.min(1, convLocalT / avatarRevealDuration) : 1;
        const eased = 1 - Math.pow(1 - revealP, 3);

        if (t < transitionEnd) {
            const localT = t - openingEnd;
            const p = transitionDuration > 0 ? localT / transitionDuration : 1;
            return {
                section: "transition",
                state: isConversationActive ? "conversation" : "transition",
                showConversationOverlay: isConversationActive,
                progress: p,
                shakeDeg: 0,
                shakeX: 0,
                overlayOpacity: isConversationActive ? 1 : 0,
                avatarOpacity: isConversationActive ? eased : 0,
                avatarScale: isConversationActive ? 0.92 + 0.08 * eased : 0.92,
                transitionTime: localT,
            };
        }

        if (t < conversationEnd) {
            return {
                section: "conversation",
                state: "conversation",
                showConversationOverlay: true,
                progress: 1,
                shakeDeg: 0,
                shakeX: 0,
                overlayOpacity: 1,
                avatarOpacity: eased,
                avatarScale: 0.92 + 0.08 * eased,
                transitionTime: transitionDuration,
            };
        }

        const endedP = outroHoldDuration > 0
            ? Math.min(1, (t - conversationEnd) / outroHoldDuration)
            : 1;
        return {
            section: "conversation",
            state: "ended",
            showConversationOverlay: true,
            progress: endedP,
            shakeDeg: 0,
            shakeX: 0,
            overlayOpacity: 1 - 0.35 * endedP,
            avatarOpacity: 1,
            avatarScale: 1,
            transitionTime: transitionDuration,
        };
    }

    return {
        openingEnd,
        transitionEnd,
        conversationStart,
        conversationEnd,
        totalDuration,
        getStateAt,
    };
}
