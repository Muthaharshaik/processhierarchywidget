import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { attr as svgAttr, create as svgCreate, append as svgAppend } from "tiny-svg";
import { is } from "bpmn-js/lib/util/ModelUtil";

const HIGH_PRIORITY = 1500;

// ── Design tokens — same as library widget ────────────────────────────────────
const ROOT_BG      = "#1e2d4a";   // dark navy  — root node (same as library root)
const ROOT_DECOR   = "#2e3f5e";
const ROOT_TITLE   = "#ffffff";
const ROOT_SUB     = "#8fa3bf";

const NODE_BG      = "#ffffff";   // white — process/valuechain nodes (same as library child)
const NODE_BORDER  = "#2cb5b5";   // teal border
const NODE_DECOR   = "#f5e6d0";   // cream decorative circle
const NODE_TITLE   = "#1a2744";   // dark navy text
const NODE_SUB     = "#6b7a99";   // muted grey subtitle

const NODE_RADIUS  = 10;
const NODE_SHADOW  = "rgba(30,45,74,0.15)";

class CustomProcessRenderer extends BaseRenderer {
    constructor(eventBus, bpmnRenderer) {
        super(eventBus, HIGH_PRIORITY);
        this.bpmnRenderer = bpmnRenderer;
    }

    canRender(element) {
        return (
            is(element, "bpmn:SubProcess") &&
            element.businessObject.get &&
            element.businessObject.get("process:processType")
        );
    }

    drawShape(parentNode, element) {
        const { width, height } = element;
        const bo          = element.businessObject;
        const processName = bo.get("process:processName") || bo.name || "";
        const processType = bo.get("process:processType") || "process";
        const processId   = bo.get("process:processId")   || "";
        const isRoot      = processId === "root";
        const isVC        = processType === "valuechain";

        const bg     = isRoot ? ROOT_BG    : NODE_BG;
        const border = isRoot ? "none"     : NODE_BORDER;
        const decor  = isRoot ? ROOT_DECOR : NODE_DECOR;
        const title  = isRoot ? ROOT_TITLE : NODE_TITLE;
        const sub    = isRoot ? ROOT_SUB   : NODE_SUB;

        // 1. Hide base bpmn-js shape
        const baseShape = this.bpmnRenderer.drawShape(parentNode, element);
        svgAttr(baseShape, { stroke: "none", fill: "none", "stroke-width": 0 });

        // 2. Drop-shadow filter
        const filterId = `proc-shadow-${element.id}`;
        const defsF = svgCreate("defs");
        defsF.innerHTML = `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="${NODE_SHADOW}" />
        </filter>`;
        svgAppend(parentNode, defsF);

        // 3. Clip path (rounded rect)
        const clipId = `proc-clip-${element.id}`;
        const defsC = svgCreate("defs");
        defsC.innerHTML = `<clipPath id="${clipId}">
            <rect x="0" y="0" width="${width}" height="${height}"
                  rx="${NODE_RADIUS}" ry="${NODE_RADIUS}" />
        </clipPath>`;
        svgAppend(parentNode, defsC);

        // 4. Card background
        const card = svgCreate("rect");
        svgAttr(card, {
            x: 0, y: 0, width, height,
            rx: NODE_RADIUS, ry: NODE_RADIUS,
            fill:           bg,
            stroke:         border,
            "stroke-width": isRoot ? 0 : 2,
            filter:         `url(#${filterId})`
        });
        svgAppend(parentNode, card);

        // 5. Decorative circle — top-right, sized for compact node
        const cR = Math.round(Math.min(width, height) * 0.30);
        const circ = svgCreate("circle");
        svgAttr(circ, {
            cx: width - 2, cy: 2, r: cR,
            fill:        decor,
            opacity:     isRoot ? 0.7 : 0.85,
            "clip-path": `url(#${clipId})`
        });
        svgAppend(parentNode, circ);

        // 6. Title — centered, no truncation for compact square nodes
        const titleEl = svgCreate("text");
        svgAttr(titleEl, {
            x: width / 2,
            y: isRoot ? height / 2 - 7 : height / 2 - 7,
            fill:                title,
            "font-size":         "12px",
            "font-weight":       "700",
            "font-family":       "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
            "text-anchor":       "middle",
            "dominant-baseline": "auto",
            "pointer-events":    "none"
        });
        // Generous char limit — 100px wide, ~6.5px per char
        const maxChars = Math.floor((width - 12) / 6.5);
        titleEl.textContent = processName.length > maxChars
            ? processName.slice(0, maxChars - 1) + "…"
            : processName;
        svgAppend(parentNode, titleEl);

        // 7. Subtitle — only for non-root, no level number
        if (!isRoot) {
            const subEl = svgCreate("text");
            svgAttr(subEl, {
                x: width / 2,
                y: height / 2 + 10,
                fill:                sub,
                "font-size":         "10px",
                "font-weight":       "400",
                "font-family":       "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
                "text-anchor":       "middle",
                "dominant-baseline": "auto",
                "pointer-events":    "none"
            });
            subEl.textContent = isVC ? "Value Chain" : "Process";
            svgAppend(parentNode, subEl);
        }

        return baseShape;
    }
}

CustomProcessRenderer.$inject = ["eventBus", "bpmnRenderer"];

export default {
    __init__: ["customProcessRenderer"],
    customProcessRenderer: ["type", CustomProcessRenderer]
};