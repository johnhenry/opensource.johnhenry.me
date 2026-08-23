export interface StudioOptions {
    /** Browser-importable ES module exporting the scene (relative to `root`). */
    sceneModule: string;
    /** Named export (default "default"). */
    sceneExport?: string;
    /** Files/dirs to watch for changes (default: the scene module's dir). */
    watch?: string[];
    /** Static root served over http (default cwd; must contain dist/browser.js). */
    root?: string;
    port?: number;
    /** Bind address. Default "127.0.0.1" (localhost-only, the safe default —
     *  this dev server has no auth). Pass "0.0.0.0" to expose it on the LAN
     *  (e.g. to view from another device, or over a remote/SSH-tunneled
     *  session where "127.0.0.1" only means the *server's own* loopback, not
     *  yours). Understand the exposure before doing this on an untrusted network. */
    host?: string;
    quality?: string;
    background?: string;
    /** Attach pointer-driven pan/zoom/orbit to the live preview (default false). */
    interactive?: boolean;
    /** Draw a waveform strip below the player for each of the scene's sounds
     *  (via addSound()), on the shared time axis (default false). */
    waveform?: boolean;
    /** Render a props panel (from the scene's `static schema`) below the
     *  player; edits re-render via parameter-only re-render, not a full file
     *  reload (default false). */
    props?: boolean;
}
/** The live-reload harness page HTML (importmap + <manim-player> + SSE reload). */
export declare function buildStudioHarness(opts: {
    sceneModuleUrl: string;
    sceneExport: string;
    browserUrl: string;
    studioUrl: string;
    quality: string;
    background: string;
    interactive: boolean;
    waveform?: boolean;
    props?: boolean;
}): string;
export interface StudioHandle {
    /** Best-guess browsable URL: the bind host itself, or (when bound to the
     *  wildcard "0.0.0.0"/"::") the first discovered LAN address -- falling
     *  back to "127.0.0.1" if none is found. See `urls` for every candidate. */
    url: string;
    /** Every URL the server is actually reachable at (loopback + LAN, when
     *  wildcard-bound) -- useful when accessing from a different device than
     *  the one running the server. */
    urls: string[];
    port: number;
    close: () => void;
}
/** Start the Studio dev server. Returns a handle with the URL and a close(). */
export declare function startStudio(options: StudioOptions): Promise<StudioHandle>;
//# sourceMappingURL=dev_server.d.ts.map