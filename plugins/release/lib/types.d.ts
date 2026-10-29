/**
 * 插件对外与内部共用的数据结构。
 * 与宿主无关：这里不引用 Cordis / dsh 的任何类型，方便单测与复用。
 */
export type PlanMode = 'create-mr' | 'merge-mr' | 'merge-git';
export type MergeStrategy = 'merge' | 'ff-only' | 'no-ff';
export type CheckStatus = 'ok' | 'warn' | 'danger' | 'unknown' | 'skipped';
export interface Check {
    id: string;
    label: string;
    status: CheckStatus;
    detail?: string;
}
export interface BranchRef {
    name: string;
    sha: string;
    committedAt: string | null;
    author: string | null;
}
export interface BranchCreationItem {
    projectId: string;
    name: string;
    branchName: string;
    baseBranch: string | null;
    baseSha: string | null;
    sha: string | null;
    status: 'created' | 'exists' | 'failed' | 'unknown';
    message: string;
    url: string | null;
}
export interface BranchCreationResult {
    branchName: string;
    total: number;
    created: number;
    exists: number;
    failed: number;
    unknown: number;
    items: BranchCreationItem[];
}
export type MrState = 'opened' | 'merged' | 'closed' | 'locked' | 'unknown';
export type MrMergeStatus = 'mergeable' | 'conflict' | 'not-approved' | 'ci-failed' | 'blocked' | 'checking' | 'unknown';
export interface MrRef {
    iid: number;
    url: string;
    state: MrState;
    title: string;
    sourceBranch: string;
    targetBranch: string;
    pipeline: 'success' | 'failed' | 'running' | 'pending' | 'skipped' | 'none';
    mergeStatus: MrMergeStatus;
    /** Original GitLab detailed_merge_status, retained for diagnosis and task history. */
    rawMergeStatus?: string;
    detail?: string;
    mergeCommitSha: string | null;
}
/** 一个可发版的仓库。id 由 remote 规范化后取哈希，跨扫描稳定。 */
export interface Project {
    id: string;
    name: string;
    namespace: string;
    remoteUrl: string;
    /** 本地工作区路径；没有本地副本时为空 */
    localPath: string | null;
    /** GitLab 的 path_with_namespace，默认由 remote 推导 */
    gitlabPath: string;
    /** 该项目默认目标分支，未配置则用全局默认 */
    defaultTarget: string | null;
    enabled: boolean;
    /** 来源：scan 扫描发现 / config 显式配置 */
    source: 'scan' | 'config';
}
export interface PlanItem {
    projectId: string;
    name: string;
    namespace: string;
    order: number;
    sourceBranch: string;
    targetBranch: string;
    sourceSha: string | null;
    targetSha: string | null;
    ahead: number | null;
    behind: number | null;
    checks: Check[];
    blockers: string[];
    warnings: string[];
    mr: MrRef | null;
    executable: boolean;
    noop: boolean;
    cachedAgeMs: number | null;
}
export interface PlanSummary {
    total: number;
    executable: number;
    blocked: number;
    noop: number;
    unknown: number;
}
export interface MergePlan {
    id: string;
    hash: string;
    mode: PlanMode;
    sourceBranch: string;
    targetBranch: string;
    mergeStrategy: MergeStrategy;
    deleteSourceBranch: boolean;
    title: string | null;
    description: string | null;
    items: PlanItem[];
    summary: PlanSummary;
    createdAt: string;
    expiresAt: string;
    checkDurationMs: number;
}
export interface ItemResult {
    projectId: string;
    name: string;
    ok: boolean;
    kind: 'mr' | 'push' | 'noop' | 'failed';
    message: string;
    mr: MrRef | null;
    sha: string | null;
    url: string | null;
    error: string | null;
}
export interface ApplyResult {
    planId: string;
    mode: PlanMode;
    results: ItemResult[];
    succeeded: number;
    failed: number;
    skipped: number;
    durationMs: number;
}
export type TaskStatus = 'success' | 'partial' | 'failed';
/**
 * 任务中心里的一条执行记录。
 *
 * 只记录「真正动过远端」的执行，不记预检——预检是只读的，数量多且没有留存价值。
 * 保留最近的若干条，用来回答「上周那次发版到底哪个仓库失败了」。
 */
export interface TaskRecord {
    id: string;
    planId: string;
    mode: PlanMode;
    sourceBranch: string;
    targetBranch: string;
    mergeStrategy: MergeStrategy;
    deleteSourceBranch: boolean;
    title: string | null;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    /** 计划里涉及的仓库总数（含跳过） */
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    status: TaskStatus;
    results: ItemResult[];
}
