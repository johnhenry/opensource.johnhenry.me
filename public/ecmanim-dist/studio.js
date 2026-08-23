// ecmanim/studio — a live-preview dev server (file-watch → browser hot-reload of
// your Scene in a <manim-player>) plus a schema→props-controls helper for a
// props panel, a pointer-driven interactive camera (pan/zoom/orbit/pick), and
// the <manim-chart> custom element. Import from "ecmanim/studio". The dev
// server is Node-only; everything else is browser-safe (import-time only —
// see the Node-safety notes in interactive.ts/chart_element.ts).
export { startStudio, buildStudioHarness } from "./studio/dev_server.js";
export { schemaToControls } from "./studio/props.js";
export { attachInteractiveCamera, pickAt } from "./studio/interactive.js";
export { ManimChartElement, defineManimChart } from "./studio/chart_element.js";
export { timeToPixel, pixelToTime, frameToPixel, pixelToFrame, computeSectionThumbnails, renderSectionOverview, computeStepMarkers, computeWaveformBars, renderWaveform, computeKeyframeMarkers, renderKeyframeTimeline, attachKeyframeTimelineEditor, } from "./studio/timeline.js";
//# sourceMappingURL=studio.js.map