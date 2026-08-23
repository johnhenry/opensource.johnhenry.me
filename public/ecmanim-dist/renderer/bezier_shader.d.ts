export interface BezierStrokeOptions {
    width?: number;
    resolution?: [number, number];
    color?: [number, number, number];
    antialias?: number;
    transparent?: boolean;
    opacity?: number;
}
export declare function makeBezierStrokeMaterial(THREE: any, opts?: BezierStrokeOptions): any;
export declare function buildStrokeGeometry(THREE: any, segments: number[], _widths: number[] | null, colors: number[]): any;
//# sourceMappingURL=bezier_shader.d.ts.map