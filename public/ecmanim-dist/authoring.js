// ecmanim/authoring — the higher-level authoring/orchestration layer: a plan IR
// (dry-run), quality gates, a pluggable Format lifecycle + provider abstraction
// (llm/tts/render), and a ecmanim render provider so it can back prompt→video
// pipelines. Kept out of the lean core entry; import from "ecmanim/authoring".
export { toPlanIR, toPlanString, } from "./authoring/plan.js";
export { slideshowRisk, checkDeliveryPromise, runQualityGates, DEFAULT_QUALITY_GATES, } from "./authoring/quality.js";
export { registerProvider, getProvider, listProviders, registerFormat, getFormat, listFormats, runFormat, } from "./authoring/formats.js";
export { manimRenderProvider, titleCardFormat } from "./authoring/showrunner.js";
export { explainerFormat, chartRevealFormat, quoteCardFormat } from "./authoring/formats_builtin.js";
//# sourceMappingURL=authoring.js.map