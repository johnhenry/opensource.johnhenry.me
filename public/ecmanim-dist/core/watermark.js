// Watermark overlay for rendered video (Node/ffmpeg): burn a text or image
// watermark into a finished video via an ffmpeg filter, in place. Node-only.
// Text watermarks need ffmpeg's `drawtext` filter, which requires an ffmpeg
// build with libfreetype compiled in. Homebrew's default `ffmpeg` formula on
// macOS omits it (the separate `ffmpeg-full` formula has it); most Linux
// distro packages include it by default. Image watermarks use `overlay` +
// `colorchannelmixer`, which are always-built-in filters, so they need no gate.
let drawtextAvailable = null;
export async function ffmpegHasDrawtext() {
    if (drawtextAvailable !== null)
        return drawtextAvailable;
    const { execFile } = await import("node:child_process");
    drawtextAvailable = await new Promise((resolve) => {
        execFile("ffmpeg", ["-filters"], (err, stdout) => resolve(!err && /drawtext/.test(stdout)));
    });
    return drawtextAvailable;
}
function posExpr(position, margin, kind) {
    // For drawtext the box is text_w/text_h; for overlay it's overlay_w/overlay_h.
    const w = kind === "text" ? "text_w" : "overlay_w";
    const h = kind === "text" ? "text_h" : "overlay_h";
    const m = margin;
    switch (position) {
        case "top-left": return { x: `${m}`, y: `${m}` };
        case "top-right": return { x: `W-${w}-${m}`, y: `${m}` };
        case "bottom-left": return { x: `${m}`, y: `H-${h}-${m}` };
        case "center": return { x: `(W-${w})/2`, y: `(H-${h})/2` };
        case "bottom-right":
        default: return { x: `W-${w}-${m}`, y: `H-${h}-${m}` };
    }
}
/** Apply a watermark to `videoPath` in place (via a temp file + rename). */
export async function applyWatermark(videoPath, config) {
    const { spawn } = await import("node:child_process");
    const { renameSync, existsSync } = await import("node:fs");
    const position = config.position ?? "bottom-right";
    const opacity = config.opacity ?? 0.6;
    const margin = config.margin ?? 24;
    const tmp = videoPath.replace(/(\.[^.]+)$/, ".wm$1");
    let args;
    if (config.image) {
        const { x, y } = posExpr(position, margin, "image");
        // Scale the logo alpha by opacity, then overlay.
        const filter = `[1:v]format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${x}:${y}`;
        args = ["-y", "-i", videoPath, "-i", config.image, "-filter_complex", filter, "-c:a", "copy", tmp];
    }
    else {
        if (!(await ffmpegHasDrawtext())) {
            console.warn("applyWatermark: this ffmpeg build has no `drawtext` filter (needs libfreetype) — " +
                "skipping the text watermark; the video is otherwise unchanged. " +
                "On macOS, `brew install ffmpeg-full` has it; most Linux ffmpeg packages include it by default.");
            return;
        }
        const { x, y } = posExpr(position, margin, "text");
        const text = (config.text ?? "").replace(/[\\:']/g, (c) => "\\" + c);
        const color = config.color ?? "white";
        const fontSize = config.fontSize ?? 36;
        const draw = `drawtext=text='${text}':fontcolor=${color}@${opacity}:fontsize=${fontSize}:x=${x}:y=${y}:box=0`;
        args = ["-y", "-i", videoPath, "-vf", draw, "-c:a", "copy", tmp];
    }
    await new Promise((resolve, reject) => {
        const ff = spawn("ffmpeg", ["-v", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
        ff.on("error", reject);
        ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error("watermark ffmpeg exited " + code))));
    });
    if (existsSync(tmp))
        renameSync(tmp, videoPath);
}
//# sourceMappingURL=watermark.js.map