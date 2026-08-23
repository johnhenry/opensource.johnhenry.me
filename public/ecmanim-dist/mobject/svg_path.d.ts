export declare function arcToCubics(x1: number, y1: number, rx: number, ry: number, xAxisRotationDeg: number, largeArcFlag: number, sweepFlag: number, x2: number, y2: number): Array<[number[], number[], number[]]>;
export declare function parsePathToSubpaths(d: string): number[][][];
export declare function subpathsToVMobject(vmobject: any, subpaths: number[][][], { scale, translate, flipY }?: {
    scale?: number | number[];
    translate?: number[];
    flipY?: boolean;
}): any;
//# sourceMappingURL=svg_path.d.ts.map