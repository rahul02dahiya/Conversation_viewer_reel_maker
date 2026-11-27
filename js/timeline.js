/**
 * Deterministic 3-section timeline:
 *   Section A (opening):      0 -> openingHoldDuration
 *   Section B (transition):   openingHoldDuration -> conversationStartOffset
 *   Section C (conversation): conversationStartOffset -> conversationEnd -> totalDuration (ended)
 */

export function createCallTimeline({
    openingHoldDuration,
    transitionDuration,
    outroHoldDuration,
    audioDuration,
    avatarRevealDuration = 0.8,
}) {
    const openingEnd = Math.max(0, openingHoldDuration);
    const transitionEnd = openingEnd + Math.max(0, transitionDuration);
    const conversationStart = transitionEnd;
    const conversationEnd = conversationStart + Math.max(0, audioDuration);
    const totalDuration = conversationEnd + Math.max(0, outroHoldDuration);

    function getStateAt(t) {
        if (t < openingEnd) {
            const p = openingEnd > 0 ? t / openingEnd : 1;
            // Two ring pulses inside 2.0s: [0..0.85] and [1.05..1.90]
            const isRinging = (t >= 0 && t <= 0.85) || (t >= 1.05 && t <= 1.9);
            const shakeDeg = isRinging ? Math.sin(t * 48) * 11 : 0;
            const shakeX = isRinging ? Math.sin(t * 48) * 2.5 : 0;
            const fadeOut = openingEnd - t < 0.25 ? Math.max(0, (openingEnd - t) / 0.25) : 1;
            return {
                section: "opening",
                state: "ringing",
                progress: p,
                shakeDeg,
                shakeX,
                overlayOpacity: fadeOut,
                avatarOpacity: 0,
                avatarScale: 0.92,
                transitionTime: 0,
            };
        }

        if (t < transitionEnd) {
            const localT = t - openingEnd;
            const p = transitionDuration > 0 ? localT / transitionDuration : 1;
            return {
                section: "transition",
                state: "transition",
                progress: p,
                shakeDeg: 0,
                shakeX: 0,
                overlayOpacity: 0,
                avatarOpacity: 0,
                avatarScale: 0.92,
                transitionTime: localT,
            };
        }

        if (t < conversationEnd) {
            const localT = t - conversationStart;
            const revealP = avatarRevealDuration > 0 ? Math.min(1, localT / avatarRevealDuration) : 1;
            const eased = 1 - Math.pow(1 - revealP, 3);
            return {
                section: "conversation",
                state: "conversation",
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
