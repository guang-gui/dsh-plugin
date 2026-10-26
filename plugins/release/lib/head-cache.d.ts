export interface HeadEntry {
    /** 记录时间（毫秒时间戳） */
    at: number;
    /** 分支 SHA；null 表示当时确认「该分支不存在」 */
    sha: string | null;
}
export type WarnFn = (message: string, detail?: Record<string, unknown>) => void;
export declare class HeadCacheStore {
    private readonly file;
    private readonly warn;
    private entries;
    private timer;
    constructor(file: string, warn?: WarnFn);
    load(): void;
    get size(): number;
    get(projectId: string, ref: string): HeadEntry | undefined;
    set(projectId: string, ref: string, sha: string | null, at?: number): void;
    clear(): void;
    /** 立即落盘（进程退出或测试时用） */
    flush(): void;
    private scheduleFlush;
}
