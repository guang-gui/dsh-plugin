/**
 * 极小的 HTTP JSON 客户端：只覆盖 GitLab REST 需要的部分。
 * 用全局 fetch，不引第三方依赖，插件安装后即可用。
 */
export declare class HttpError extends Error {
    readonly status: number;
    readonly body: string;
    readonly url: string;
    constructor(status: number, body: string, url: string);
}
export declare function joinUrl(base: string, path: string): string;
/** 分支名里可能含 `/` 和中文，GitLab 要求整段 URL 编码 */
export declare function encodeBranch(branch: string): string;
export interface JsonRequest {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export declare function httpJson<T>(url: string, init?: JsonRequest): Promise<T>;
