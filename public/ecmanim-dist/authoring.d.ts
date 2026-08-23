export { toPlanIR, toPlanString, } from "./authoring/plan.ts";
export type { PlanIR, PlanSegment, PlanChapter, PlanConfig, PlanOptions } from "./authoring/plan.ts";
export { slideshowRisk, checkDeliveryPromise, runQualityGates, DEFAULT_QUALITY_GATES, } from "./authoring/quality.ts";
export type { QualityContext, QualityGate, QualityReport } from "./authoring/quality.ts";
export { registerProvider, getProvider, listProviders, registerFormat, getFormat, listFormats, runFormat, } from "./authoring/formats.ts";
export type { Provider, ProviderKind, ProviderSet, Format, FormatContext, FormatResult } from "./authoring/formats.ts";
export { manimRenderProvider, titleCardFormat } from "./authoring/showrunner.ts";
export type { TitleCardPlan } from "./authoring/showrunner.ts";
export { explainerFormat, chartRevealFormat, quoteCardFormat } from "./authoring/formats_builtin.ts";
export type { ExplainerPlan, ExplainerSection, ChartRevealPlan, ChartDatum, QuoteCardPlan, } from "./authoring/formats_builtin.ts";
//# sourceMappingURL=authoring.d.ts.map