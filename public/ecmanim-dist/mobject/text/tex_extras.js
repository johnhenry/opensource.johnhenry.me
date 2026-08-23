// BulletedList and Title, mirroring manim.mobject.text.tex_mobject.
// BulletedList renders each item as a Tex with a leading bullet Dot; Title
// renders a heading with an optional underline.
import { VGroup } from "../VMobject.js";
import { Tex } from "../mathtex.js";
import { Text } from "./Text.js";
import { Dot, Line } from "../geometry.js";
import * as V from "../../core/math/vector.js";
import { WHITE } from "../../core/color.js";
export class BulletedList extends VGroup {
    items;
    buff;
    dotScaleFactor;
    constructor(...args) {
        super();
        let config = {};
        if (args.length &&
            typeof args[args.length - 1] === "object" &&
            args[args.length - 1] !== null &&
            !Array.isArray(args[args.length - 1])) {
            config = args.pop();
        }
        const itemStrings = args.map((a) => String(a));
        this.buff = config.buff ?? 0.5; // manim MED_LARGE_BUFF
        this.dotScaleFactor = config.dotScaleFactor ?? 2;
        const texConfig = { ...config };
        delete texConfig.buff;
        delete texConfig.dotScaleFactor;
        delete texConfig.texEnvironment;
        delete texConfig.tex_environment;
        const rows = [];
        for (const s of itemStrings) {
            const tex = new Tex(s, texConfig);
            const dot = new Dot({ color: config.color ?? WHITE });
            dot.scale(this.dotScaleFactor);
            // Place the bullet to the left of the item text.
            dot.nextTo(tex, V.LEFT, 0.25);
            // Group the bullet with its text so `.submobjects[0]` is the bullet.
            const row = new VGroup(dot, tex);
            rows.push(row);
        }
        this.items = new VGroup(...rows);
        // Stack items vertically, left-aligned.
        for (let i = 1; i < rows.length; i++) {
            rows[i].nextTo(rows[i - 1], V.DOWN, this.buff);
            rows[i].alignTo(rows[0], V.LEFT);
        }
        this.add(...rows);
        this.center();
    }
    /** Get the bullet Dot for row `i`. */
    getBullet(i) {
        return this.items.submobjects[i].submobjects[0];
    }
    /** Dim every item except `index` (manim's fade_all_but). */
    fadeAllBut(index, opacity = 0.25) {
        const rows = this.items.submobjects;
        for (let i = 0; i < rows.length; i++) {
            const target = i === index ? 1 : opacity;
            for (const m of rows[i].getFamily()) {
                m.fillOpacity = target;
                if (m.strokeOpacity != null)
                    m.strokeOpacity = target;
                m.opacity = target;
            }
        }
        return this;
    }
}
export class Title extends VGroup {
    titleText;
    underline;
    includeUnderline;
    matchUnderlineWidthToText;
    underlineBuff;
    constructor(text = "", config = {}) {
        super();
        this.includeUnderline = config.includeUnderline ?? true;
        this.matchUnderlineWidthToText = config.matchUnderlineWidthToText ?? false;
        this.underlineBuff = config.underlineBuff ?? 0.25; // manim MED_SMALL_BUFF
        const inner = { ...config };
        delete inner.includeUnderline;
        delete inner.matchUnderlineWidthToText;
        delete inner.underlineBuff;
        delete inner.useTex;
        // Default to Tex; allow a plain Text heading via useTex:false.
        this.titleText = config.useTex === false
            ? new Text(String(text), inner)
            : new Tex(String(text), inner);
        this.add(this.titleText);
        this.underline = null;
        if (this.includeUnderline) {
            const width = this.matchUnderlineWidthToText
                ? this.titleText.getWidth()
                : Math.max(this.titleText.getWidth() + 1, 2);
            const line = new Line([-width / 2, 0, 0], [width / 2, 0, 0], { color: config.color ?? WHITE });
            line.nextTo(this.titleText, V.DOWN, this.underlineBuff);
            this.underline = line;
            this.add(line);
        }
        // Titles sit at the top of the frame by convention.
        this.toEdge(V.UP);
    }
}
//# sourceMappingURL=tex_extras.js.map