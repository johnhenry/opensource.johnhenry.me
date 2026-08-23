// Pluggable "formats" (scrollmark/showrunner-style Format lifecycle) + a provider
// abstraction (llm / tts / render). A Format turns a topic/params into a plan,
// optionally generates assets, and composes an output; `revise` feeds feedback
// back into the plan. Providers are swappable backends the format calls.
const providers = new Map();
const pkey = (kind, name) => `${kind}:${name}`;
export function registerProvider(p) { providers.set(pkey(p.kind, p.name), p); }
export function getProvider(kind, name) { return providers.get(pkey(kind, name)); }
export function listProviders(kind) {
    const all = Array.from(providers.values());
    return kind ? all.filter((p) => p.kind === kind) : all;
}
const formats = new Map();
export function registerFormat(f) { formats.set(f.name, f); }
export function getFormat(name) { return formats.get(name); }
export function listFormats() { return Array.from(formats.values()); }
/** Run a format's lifecycle: plan → generateAssets → compose. */
export async function runFormat(format, ctx = {}) {
    const f = typeof format === "string" ? getFormat(format) : format;
    if (!f)
        throw new Error(`unknown format "${format}"`);
    for (const kind of f.requiredProviders ?? []) {
        if (!ctx.providers?.[kind])
            throw new Error(`format "${f.name}" requires a ${kind} provider`);
    }
    const plan = await f.plan(ctx);
    const assets = f.generateAssets ? await f.generateAssets(plan, ctx) : null;
    const output = await f.compose(plan, assets, ctx);
    return { plan, assets, output };
}
//# sourceMappingURL=formats.js.map