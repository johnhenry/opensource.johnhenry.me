export interface AudioData {
    /** One Float32Array of samples per channel. */
    channelWaveforms: Float32Array[];
    sampleRate: number;
    durationInSeconds: number;
    numberOfChannels: number;
}
/**
 * Decode an audio file/URL to PCM. Node: shells out to ffmpeg (f32le). Browser:
 * fetch + AudioContext.decodeAudioData. Returns mono unless `channels` > 1.
 */
export declare function getAudioData(src: string, opts?: {
    sampleRate?: number;
    channels?: number;
}): Promise<AudioData>;
/**
 * A frequency spectrum for the given frame — `numberOfSamples` values in [0,1],
 * left = low freq (bass) → right = highs. `numberOfSamples` should be a power of
 * two. Mirrors Remotion's visualizeAudio.
 */
export declare function visualizeAudio(opts: {
    audioData: AudioData;
    frame: number;
    fps: number;
    numberOfSamples: number;
    smoothing?: boolean;
    channel?: number;
}): number[];
/** A downsampled waveform amplitude slice (each value in [-1,1]) — for oscilloscopes. */
export declare function getWaveformPortion(opts: {
    audioData: AudioData;
    startTimeInSeconds: number;
    durationInSeconds: number;
    numberOfSamples: number;
    channel?: number;
}): number[];
/**
 * Build a smooth SVG path string through `points` (Catmull-Rom → cubic Bézier).
 * Handy for turning a spectrum/waveform into a flowing line.
 */
export declare function createSmoothSvgPath(points: Array<[number, number]>, tension?: number): string;
//# sourceMappingURL=analyze.d.ts.map