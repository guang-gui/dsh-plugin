import type { BranchRef, MrRef } from './types.js';
/**
 * 令牌身份画像。
 * GitLab 的项目级访问令牌（project access token）只会以 `project_<id>_bot_*` 这个机器人账号出现，
 * 且只能看到被授权的那一个项目——其他项目一律 404，表现为「创建 MR 没反应」。
 */
export interface TokenScope {
    kind: 'project' | 'personal' | 'unknown';
    username: string;
    projectId: number | null;
    projectPath: string | null;
    scopes: string[];
    /** 面向用户的一句话说明，正常令牌为 null */
    note: string | null;
}
export interface GitLabOptions {
    baseUrl: string;
    token: string;
    signal?: AbortSignal;
}
export declare class GitLabAdapter {
    private readonly opts;
    private readonly apiBase;
    private scopePromise;
    constructor(opts: GitLabOptions);
    private api;
    private projectPath;
    testConnection(): Promise<{
        ok: boolean;
        ms: number;
        account?: string;
        version?: string;
        error?: string;
        note?: string;
    }>;
    /** 探测令牌身份，失败不缓存（换令牌后可立刻重试） */
    tokenScope(): Promise<TokenScope>;
    private detectScope;
    getBranch(project: number | string, branch: string): Promise<BranchRef | null>;
    listOpenMrs(project: number | string, source: string, target: string): Promise<MrRef[]>;
    getMr(project: number | string, iid: number): Promise<MrRef>;
    createMr(project: number | string, input: {
        sourceBranch: string;
        targetBranch: string;
        title: string;
        description?: string;
    }): Promise<MrRef>;
    mergeMr(project: number | string, iid: number, sha: string, opts: {
        deleteSourceBranch: boolean;
        message?: string;
    }): Promise<MrRef>;
    private toMrRef;
}
