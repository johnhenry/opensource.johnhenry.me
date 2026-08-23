export declare function startFfmpeg({ fps, pixelWidth, pixelHeight, outPath, format, verbose }: any): import("node:child_process").ChildProcessByStdio<import("node:stream").Writable, null, null>;
export declare function writeToStream(stream: any, buf: any): Promise<void>;
export declare function encodeFrames(frames: any[], opts: any): Promise<void>;
export declare function runFfmpeg(args: string[], verbose: boolean, throwOnFail?: boolean): Promise<boolean>;
export declare function concatPartials(partials: string[], outPath: string, verbose: boolean): Promise<void>;
export declare function remuxCopy(src: string, outPath: string, verbose: boolean): Promise<void>;
export interface ProbeResult {
    duration: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
}
export declare function probeVideo(path: string): Promise<ProbeResult>;
export declare function extractFrames(path: string, opts: {
    fps: number;
    scale?: [number, number] | number;
    dir: string;
    start?: number;
    end?: number;
    verbose?: boolean;
}): Promise<string[]>;
//# sourceMappingURL=ffmpeg.d.ts.map