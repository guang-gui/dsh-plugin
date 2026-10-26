import type { GitExecutor } from './git.js';
import type { ApplyResult, MergePlan, MergeStrategy, MrRef, PlanMode, Project } from './types.js';
export interface ConfigProject {
    /** GitLab path_with_namespace 或 remote URL，用来匹配扫描结果 */
    path?: string;
    remoteUrl?: string;
    name?: string;
    localPath?: string;
    defaultTarget?: string;
    enabled?: boolean;
}
export interface ResolvedConfig {
    roots: string[];
    scanDepth: number;
    gitlabBaseUrl: string;
    gitlabToken: string;
    projects: ConfigProject[];
    defaultTarget: string;
    concurrency: number;
    headCacheTtlSec: number;
    mergeStrategy: MergeStrategy;
    deleteSourceBranch: boolean;
    dataDir: string;
    gitPath: string;
}
export interface PlanInput {
    mode: PlanMode;
    sourceBranch: string;
    targetBranch?: string;
    projectIds?: string[];
    title?: string;
    description?: string;
    refresh?: boolean;
    mergeStrategy?: MergeStrategy;
    deleteSourceBranch?: boolean;
    signal?: AbortSignal;
}
export interface ApplyInput {
    planId: string;
    planHash: string;
    title?: string;
    description?: string;
    signal?: AbortSignal;
}
export interface BranchMatch {
    projectId: string;
    project: string;
    namespace: string;
    branch: string;
    sha: string;
    gitlabPath: string;
}
export interface Logger {
    info(message: string, detail?: Record<string, unknown>): void;
    warn(message: string, detail?: Record<string, unknown>): void;
    debug(message: string, detail?: Record<string, unknown>): void;
}
export declare class ReleaseService {
    private readonly config;
    private readonly git;
    private readonly logger;
    private readonly store;
    private readonly heads;
    private adapter;
    private scanned;
    private readonly rangeCache;
    private readonly treeCache;
    private initPromise;
    private initError;
    constructor(config: ResolvedConfig, git: GitExecutor, logger?: Logger);
    /**
     * 首次使用时才读盘与扫描：插件加载本身不做 I/O，dsh 启动不会因为
     * 扫描一堆仓库而变慢；初始化失败也只会影响工具调用，不会拖垮整个插件树。
     */
    ready(): Promise<void>;
    private bootstrap;
    dispose(): void;
    get projects(): Project[];
    get roots(): string[];
    /** 扫描根目录并合并显式配置；force=false 时只在从未扫描过的情况下扫描 */
    refreshProjects(force?: boolean): Promise<Project[]>;
    private scanProjects;
    private hostOfBase;
    private selectProjects;
    /** 跨仓库按关键词查分支。关键词为空时返回各仓库的主干分支，便于选目标分支。 */
    findBranches(keyword: string, projectIds?: string[], limit?: number): Promise<BranchMatch[]>;
    planMerge(input: PlanInput): Promise<MergePlan>;
    private checkProject;
    applyPlan(input: ApplyInput): Promise<ApplyResult>;
    private executeItem;
    private mergeWithGit;
    private writeWithMr;
    refreshMrs(planId?: string): Promise<{
        total: number;
        updated: number;
        conflicts: number;
        checking: number;
        mrs: Array<{
            project: string;
            mr: MrRef;
        }>;
    }>;
    private adapterFor;
    /** 有本地工作区就用本地（对象通常齐全），否则用 bare 缓存 */
    private repoDirFor;
    /** 写路径专用：强制 bare 缓存，绝不写用户工作区 */
    private ensureWriteCache;
    private cachePath;
    private rememberHead;
    private remember;
    /**
     * 把 GitLab 的 401/403/404 翻译成能直接照着修的一句话。
     * 最常见的坑是「项目级访问令牌」——它只以 project_<id>_bot_* 账号存在，
     * 只能看见被授权的那一个项目，其他项目一律 404。
     */
    private apiPermissionNote;
}
