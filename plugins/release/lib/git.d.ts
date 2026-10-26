export interface RemoteRef {
    sha: string;
    name: string;
}
export interface CommitInfo {
    sha: string;
    subject: string;
    author: string;
    date: string;
}
export type GitErrorCode = 'GIT_NOT_FOUND' | 'NOT_A_REPOSITORY' | 'REMOTE_UNREACHABLE' | 'AUTH_FAILED' | 'BRANCH_NOT_FOUND' | 'CONFLICT' | 'NON_FAST_FORWARD' | 'TIMEOUT' | 'UNKNOWN';
export declare class GitError extends Error {
    readonly code: GitErrorCode;
    readonly retryable: boolean;
    readonly detail?: {
        stderr?: string;
        exitCode?: number;
    } | undefined;
    constructor(code: GitErrorCode, message: string, retryable?: boolean, detail?: {
        stderr?: string;
        exitCode?: number;
    } | undefined);
}
export declare class GitExecutor {
    private readonly gitPath;
    private readonly timeoutMs;
    constructor(gitPath?: string, timeoutMs?: number);
    private exec;
    private must;
    version(): Promise<string>;
    remoteUrl(repoPath: string): Promise<string | null>;
    currentBranch(repoPath: string): Promise<string | null>;
    /**
     * 远端分支查询。`repoPath` 为空时直接用 remote（URL 或远端名）发起；
     * pattern 用 refs/heads/... 形式，可传多个以减少网络往返。
     */
    lsRemoteHeads(repoPath: string | undefined, remote: string, pattern?: string | string[]): Promise<RemoteRef[]>;
    /** 本地已有的远端跟踪分支：纯本地读取，毫秒级 */
    localRemoteHeads(repoDir: string, remote?: string): Promise<RemoteRef[]>;
    ensureBareCache(cacheDir: string, remote: string): Promise<void>;
    fetch(cacheDir: string, signal?: AbortSignal): Promise<void>;
    /** 只取需要的分支，避免大仓库全量拉取 */
    fetchBranches(repoDir: string, branches: string[]): Promise<void>;
    /** 距上次 fetch 过了多久（毫秒）；读不到返回 null */
    lastFetchAge(repoDir: string): Promise<number | null>;
    revParse(cacheDir: string, ref: string): Promise<string | null>;
    /** 一次读取多个引用，缺失的引用不会出现在结果里 */
    refsOf(repoDir: string, refs: string[]): Promise<Map<string, string>>;
    /** 本地对象库是否已包含该提交；用于跳过重复 fetch */
    hasCommit(repoDir: string, sha: string): Promise<boolean>;
    /** 本地更新远端跟踪引用，不产生网络请求 */
    updateRemoteRef(repoDir: string, branch: string, sha: string): Promise<void>;
    countRange(cacheDir: string, from: string, to: string): Promise<number>;
    /** 一次遍历同时算出领先/落后提交数，比两次 countRange 省一半时间 */
    countBoth(cacheDir: string, base: string, head: string): Promise<{
        ahead: number;
        behind: number;
    }>;
    /** 冲突预演：不创建工作区，直接得到合并树结果 */
    mergeTree(cacheDir: string, ours: string, theirs: string): Promise<{
        clean: boolean;
        conflicts: string[];
    }>;
    log(cacheDir: string, ref: string, limit?: number): Promise<CommitInfo[]>;
    addWorktree(cacheDir: string, worktreeDir: string, sha: string, branch: string): Promise<void>;
    merge(worktreeDir: string, sha: string, strategy: 'merge' | 'ff-only' | 'no-ff', message: string): Promise<CommitInfo>;
    push(worktreeDir: string, refspec: string): Promise<void>;
    deleteRemoteBranch(cacheDir: string, branch: string): Promise<void>;
    removeWorktree(cacheDir: string, worktreeDir: string): Promise<void>;
    /** 判断 commit 是否为 ancestor 的祖先，用于推送后核验 */
    isAncestor(cacheDir: string, ancestor: string, descendant: string): Promise<boolean>;
    isGitRepository(path: string): Promise<boolean>;
}
