interface ZVertex {
    x: number;
    y: number;
    z: number;
    r?: number;
    g?: number;
    b?: number;
}
export declare class ZBuffer {
    logicalWidth: number;
    logicalHeight: number;
    superSample: number;
    width: number;
    height: number;
    color: Uint8ClampedArray;
    depth: Float32Array;
    constructor(width: number, height: number, superSample?: number);
    resize(width: number, height: number, superSample?: number): void;
    clear(r: number, g: number, b: number): void;
    _blend(idx: number, r: number, g: number, b: number, a: number): void;
    _s(v: ZVertex): ZVertex;
    triangle(v0In: ZVertex, v1In: ZVertex, v2In: ZVertex, color: number[], alpha: number): void;
    triangleGouraud(v0In: ZVertex, v1In: ZVertex, v2In: ZVertex, alpha: number): void;
    line(p0In: ZVertex, p1In: ZVertex, halfWidth: number, color: number[], alpha: number, bias?: number): void;
    blitTo(ctx: CanvasRenderingContext2D): void;
}
export {};
//# sourceMappingURL=zbuffer.d.ts.map