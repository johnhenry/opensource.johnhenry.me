// A ecmanim `render` provider + a minimal example Format, so ecmanim can act as
// the renderer for prompt→video pipelines (scrollmark/showrunner-style). The
// render provider takes a scene "spec" (a construct function or Scene class) and
// renders it; the example titleCard format plans a title/bullets from a topic and
// composes them into a rendered clip.
import { registerProvider, registerFormat } from "./formats.js";
/** A render provider backed by ecmanim's Node renderer. */
export const manimRenderProvider = {
    kind: "render",
    name: "ecmanim",
    available() { return true; },
    async invoke(input) {
        const { render } = await import("../node.js");
        return render(input.scene, input.options ?? {});
    },
};
registerProvider(manimRenderProvider);
/**
 * A tiny end-to-end Format: turn a topic (+ optional bullets) into a title-card
 * scene and render it. `plan` uses the llm provider if present to expand bullets,
 * else falls back to the given ones. Demonstrates plan → compose → revise.
 */
export const titleCardFormat = {
    name: "title-card",
    description: "A title + bullet list card rendered to video.",
    requiredProviders: ["render"],
    async plan(ctx) {
        const title = ctx.params?.title ?? ctx.topic ?? "Untitled";
        let bullets = ctx.params?.bullets ?? [];
        if (!bullets.length && ctx.providers?.llm) {
            const out = await ctx.providers.llm.invoke({ prompt: `Three short bullet points about: ${title}` });
            bullets = Array.isArray(out) ? out : String(out).split("\n").filter(Boolean).slice(0, 3);
        }
        if (!bullets.length)
            bullets = ["Point one", "Point two", "Point three"];
        return { title, bullets, style: ctx.params?.style ?? "3b1b-dark" };
    },
    async compose(plan, _assets, ctx) {
        const render = ctx.providers.render;
        const build = async (scene) => {
            const idx = await import("../index.js");
            const title = new idx.Text(plan.title, { fontSize: 0.9, point: [0, 2.4, 0], color: "#FFD700" });
            scene.add(title);
            await scene.play(new idx.Write(title), { _playConfig: true, runTime: 0.6 });
            plan.bullets.forEach((b, i) => {
                const t = new idx.Text("• " + b, { fontSize: 0.5, point: [-3, 0.8 - i * 0.9, 0], align: "left" });
                scene.add(t);
            });
            await scene.wait(0.6);
        };
        return render.invoke({ scene: build, options: { ...(ctx.params?.renderOptions ?? {}), style: plan.style } });
    },
    async revise(plan, feedback) {
        return { ...plan, ...feedback };
    },
};
registerFormat(titleCardFormat);
//# sourceMappingURL=showrunner.js.map