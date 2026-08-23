// Loader for the shared WASM math core (packages/manim-wasm/manim_core.wasm).
// The SAME module is consumed by Python manim via wasmtime — a cross-language
// computational core. Loading is async; once loaded the functions are sync.
// Everything degrades gracefully: if the .wasm is unavailable, isWasmLoaded()
// stays false and callers fall back to the pure-JS implementations.
let ex = null;
let f64 = null;
let i32 = null;
export function isWasmLoaded() {
    return ex != null;
}
export async function loadWasm(source) {
    if (ex)
        return true;
    try {
        const url = source ?? new URL("../packages/manim-wasm/manim_core.wasm", import.meta.url);
        let bytes;
        if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
            const { readFileSync } = await import("node:fs");
            const { fileURLToPath } = await import("node:url");
            bytes = readFileSync(typeof url === "string" ? url : fileURLToPath(url));
        }
        else {
            bytes = await fetch(url).then((r) => r.arrayBuffer());
        }
        const { instance } = await WebAssembly.instantiate(bytes, {});
        ex = instance.exports;
        const mem = ex.memory.buffer;
        const n = ex.buffer_len();
        f64 = new Float64Array(mem, ex.buffer_ptr(), n);
        i32 = new Int32Array(mem, ex.ibuffer_ptr(), n);
        // Wire the accelerator into the pure-JS core (used by earclipTriangulation).
        const { _setWasmEarclip } = await import("./core/math/vector.js");
        _setWasmEarclip(earclipWasm, isWasmLoaded);
        return true;
    }
    catch {
        ex = null;
        return false;
    }
}
/** WASM cubic-bezier eval; p0/c1/c2/p3 are [x,y,z]. Returns the point. */
export function bezierEvalWasm(p0, c1, c2, p3, t) {
    const b = f64;
    for (let k = 0; k < 3; k++) {
        b[k] = p0[k];
        b[3 + k] = c1[k];
        b[6 + k] = c2[k];
        b[9 + k] = p3[k];
    }
    ex.bezier_eval(t);
    return [b[12], b[13], b[14]];
}
/** WASM ear-clipping of a simple 2D polygon. Returns flat index triples. */
export function earclipWasm(points) {
    const b = f64, ib = i32;
    const count = points.length;
    for (let i = 0; i < count; i++) {
        b[2 * i] = points[i][0];
        b[2 * i + 1] = points[i][1];
    }
    const tris = ex.earclip(count);
    const out = [];
    for (let i = 0; i < tris * 3; i++)
        out.push(ib[i]);
    return out;
}
/** WASM 3x3 (row-major) matrix times a 3-vector. */
export function mat3VecWasm(m, v) {
    const b = f64;
    for (let i = 0; i < 9; i++)
        b[i] = m[i];
    for (let i = 0; i < 3; i++)
        b[9 + i] = v[i];
    ex.mat3_vec();
    return [b[12], b[13], b[14]];
}
//# sourceMappingURL=wasm.js.map