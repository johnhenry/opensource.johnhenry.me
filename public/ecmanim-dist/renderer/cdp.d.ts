export interface EvaluateOptions {
    awaitPromise?: boolean;
    returnByValue?: boolean;
}
export declare class CDPSession {
    readonly cdpUrl: string;
    readonly targetId: string;
    private ws;
    private nextId;
    private pending;
    private loadFired;
    private loadWaiters;
    private closed;
    constructor(cdpUrl: string, targetId: string, ws: any);
    send(method: string, params?: Record<string, any>): Promise<any>;
    evaluate(expression: string, opts?: EvaluateOptions): Promise<any>;
    navigate(url: string): Promise<void>;
    waitForLoad(timeoutMs?: number): Promise<void>;
    close(): Promise<void>;
}
export declare function connectCDP(cdpUrl: string): Promise<CDPSession>;
export declare function probeCDP(cdpUrl: string, timeoutMs?: number): Promise<boolean>;
//# sourceMappingURL=cdp.d.ts.map