export interface WordBoundary {
    word: string;
    startMs: number;
    endMs: number;
}
export interface TTSResult {
    /** Path to the synthesized audio file. */
    file: string;
    durationSeconds: number;
    /** Per-word timings, if the provider supplies them (enables precise bookmarks). */
    wordBoundaries?: WordBoundary[];
}
export interface TTSSynthesizeOptions {
    voice?: string;
    speed?: number;
    language?: string;
    cacheDir?: string;
    [key: string]: any;
}
export interface TTSProvider {
    name: string;
    /** Whether this provider can run here (binary/key present). */
    available(): boolean | Promise<boolean>;
    synthesize(text: string, opts?: TTSSynthesizeOptions): Promise<TTSResult>;
}
export declare function registerTTSProvider(p: TTSProvider): void;
export declare function getTTSProvider(name: string): TTSProvider | undefined;
export declare function listTTSProviders(): string[];
/** Pick the first available provider from `preferred` (falls back to "silent"). */
export declare function resolveTTSProvider(preferred?: string): Promise<TTSProvider>;
/** Audio duration (seconds) via ffprobe. */
export declare function audioDurationSeconds(file: string): Promise<number>;
/** No-key fallback: a silent clip of the estimated duration (timing/offline). */
export declare const silentProvider: TTSProvider;
/** System TTS: macOS `say` or Linux `espeak-ng`. */
export declare const systemProvider: TTSProvider;
/** OpenAI TTS (uses OPENAI_API_KEY). No word timings. */
export declare const openaiProvider: TTSProvider;
/** ElevenLabs TTS (uses ELEVENLABS_API_KEY). No word timings in this minimal adapter. */
export declare const elevenLabsProvider: TTSProvider;
//# sourceMappingURL=providers.d.ts.map