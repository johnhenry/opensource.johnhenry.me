export type ProviderKind = "llm" | "tts" | "render";
export interface Provider {
    kind: ProviderKind;
    name: string;
    available?(): boolean | Promise<boolean>;
    invoke(input: any, opts?: Record<string, any>): Promise<any>;
}
export declare function registerProvider(p: Provider): void;
export declare function getProvider(kind: ProviderKind, name: string): Provider | undefined;
export declare function listProviders(kind?: ProviderKind): Provider[];
export interface ProviderSet {
    llm?: Provider;
    tts?: Provider;
    render?: Provider;
}
export interface FormatContext {
    topic?: string;
    params?: Record<string, any>;
    workDir?: string;
    providers?: ProviderSet;
    [key: string]: any;
}
export interface Format {
    name: string;
    description?: string;
    requiredProviders?: ProviderKind[];
    /** topic/params → a plan (a scene spec / plan IR / whatever the format consumes). */
    plan(ctx: FormatContext): Promise<any> | any;
    /** Optional: fetch/generate assets (audio, images, …) referenced by the plan. */
    generateAssets?(plan: any, ctx: FormatContext): Promise<any> | any;
    /** Produce the final output (usually a render) from plan + assets. */
    compose(plan: any, assets: any, ctx: FormatContext): Promise<any> | any;
    /** Optional: revise the plan given feedback (the iterative loop). */
    revise?(plan: any, feedback: any, ctx: FormatContext): Promise<any> | any;
}
export declare function registerFormat(f: Format): void;
export declare function getFormat(name: string): Format | undefined;
export declare function listFormats(): Format[];
export interface FormatResult {
    plan: any;
    assets: any;
    output: any;
}
/** Run a format's lifecycle: plan → generateAssets → compose. */
export declare function runFormat(format: Format | string, ctx?: FormatContext): Promise<FormatResult>;
//# sourceMappingURL=formats.d.ts.map