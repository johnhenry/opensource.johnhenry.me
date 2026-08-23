export { startStudio, buildStudioHarness } from "./studio/dev_server.ts";
export type { StudioOptions, StudioHandle } from "./studio/dev_server.ts";
export { schemaToControls } from "./studio/props.ts";
export type { PropControl } from "./studio/props.ts";
export { attachInteractiveCamera, pickAt } from "./studio/interactive.ts";
export type { InteractiveCameraOptions, InteractiveCameraHandle, PickResult } from "./studio/interactive.ts";
export { ManimChartElement, defineManimChart } from "./studio/chart_element.ts";
export type { ChartGraphBuilder } from "./studio/chart_element.ts";
export { timeToPixel, pixelToTime, frameToPixel, pixelToFrame, computeSectionThumbnails, renderSectionOverview, computeStepMarkers, computeWaveformBars, renderWaveform, computeKeyframeMarkers, renderKeyframeTimeline, attachKeyframeTimelineEditor, } from "./studio/timeline.ts";
export type { TimeAxisOptions, FrameAxisOptions, SectionThumbnailLayout, StepMarkerLayout, WaveformBar, KeyframeMarkerLayout, KeyframeTimelineEditorOptions, } from "./studio/timeline.ts";
//# sourceMappingURL=studio.d.ts.map