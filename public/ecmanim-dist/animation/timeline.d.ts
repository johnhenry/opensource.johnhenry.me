export interface TimelineOptions {
    fps?: number;
    defaults?: {
        runTime?: number;
        rateFunc?: (t: number) => number;
    };
}
export declare class Timeline {
    fps: number;
    defaults: {
        runTime?: number;
        rateFunc?: (t: number) => number;
    };
    private entries;
    private labels;
    private cursor;
    private prevStart;
    private prevEnd;
    constructor(opts?: TimelineOptions);
    private resolve;
    private childRunTime;
    add(animation: any, position?: string | number): this;
    addLabel(name: string, position?: string | number): this;
    get duration(): number;
    build(): any;
}
export declare function timeline(opts?: TimelineOptions): Timeline;
//# sourceMappingURL=timeline.d.ts.map