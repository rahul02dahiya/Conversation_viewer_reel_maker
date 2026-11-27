/**
 * Reusable SVG symmetrical bar waveform component with dynamic color support.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export function createWaveform(container, options) {
    const {
        barCount = 45,
        barWidth = 10,
        barSpacing = 10,
        minHeight = 10,
        maxHeight = 110,
        colorVar = "--muted-color",
    } = options;

    const totalWidth = barCount * barWidth + Math.max(0, barCount - 1) * barSpacing;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${totalWidth} ${maxHeight}`);
    svg.setAttribute("width", String(totalWidth));
    svg.setAttribute("height", String(maxHeight));
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "block";
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";

    const bars = [];
    const center = (barCount - 1) / 2;
    for (let i = 0; i < barCount; i++) {
        const rect = document.createElementNS(SVG_NS, "rect");
        const x = i * (barWidth + barSpacing);
        const y = (maxHeight - minHeight) / 2;
        const normDist = center > 0 ? Math.abs(i - center) / center : 0;
        const edgeOpacity = 1 - 0.65 * Math.pow(normDist, 1.6);

        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(barWidth));
        rect.setAttribute("height", String(minHeight));
        rect.setAttribute("rx", String(barWidth / 2));
        rect.setAttribute("fill", `var(${colorVar})`);
        rect.setAttribute("opacity", edgeOpacity.toFixed(2));
        svg.appendChild(rect);
        bars.push(rect);
    }

    container.replaceChildren(svg);

    function render(amplitudes, fillColor) {
        for (let i = 0; i < bars.length; i++) {
            const amp = amplitudes ? Math.min(1, Math.max(0, amplitudes[i] ?? 0)) : 0;
            const height = minHeight + amp * (maxHeight - minHeight);
            const y = (maxHeight - height) / 2;
            bars[i].setAttribute("height", height.toFixed(2));
            bars[i].setAttribute("y", y.toFixed(2));
            if (fillColor) {
                bars[i].setAttribute("fill", fillColor);
            }
        }
    }

    return { render };
}
