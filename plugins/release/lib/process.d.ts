export interface RunOptions {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    signal?: AbortSignal;
}
export interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
export declare class ProcessStartError extends Error {
    readonly file: string;
    constructor(file: string, cause: unknown);
}
export declare function run(file: string, args: string[], opts?: RunOptions): Promise<RunResult>;
