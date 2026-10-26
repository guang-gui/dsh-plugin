import type { Check, MergePlan, MergeStrategy, PlanItem, PlanMode } from './types.js';
export declare const MODE_LABEL: Record<PlanMode, string>;
export declare const MODE_EFFECT: Record<PlanMode, string>;
export interface ParsedRemote {
    host: string;
    path: string;
    name: string;
    namespace: string;
}
/** 统一 remote 形态，用于去重与展示：host/group/repo */
export declare function parseRemoteUrl(raw: string): ParsedRemote | null;
export declare function normalizeRemoteUrl(raw: string): string;
/** 分支名合法性：拒绝空白、..、~^:?*[\、结尾 .lock 等，避免误用与注入 */
export declare function isValidBranchName(name: string): boolean;
export declare function sha256(input: string): string;
/** 计划摘要只包含影响执行的字段：任何输入变化都会改变摘要 */
export declare function computePlanHash(plan: {
    mode: PlanMode;
    sourceBranch: string;
    targetBranch: string;
    mergeStrategy: MergeStrategy;
    deleteSourceBranch: boolean;
    title?: string | null;
    items: Array<Pick<PlanItem, 'projectId' | 'sourceBranch' | 'targetBranch' | 'sourceSha' | 'targetSha' | 'executable'>>;
}): string;
export declare function summarizePlan(items: PlanItem[]): MergePlan['summary'];
export type BranchCategory = 'trunk' | 'release' | 'feature' | 'hotfix' | 'other';
export declare function branchCategory(name: string): BranchCategory;
export declare function compareBranchOption(a: {
    name: string;
    category: BranchCategory;
    projectCount: number;
}, b: {
    name: string;
    category: BranchCategory;
    projectCount: number;
}, kind: 'source' | 'target'): number;
export declare const CHECK_IDS: {
    readonly source: "source-exists";
    readonly target: "target-exists";
    readonly ahead: "ahead";
    readonly conflict: "conflict";
    readonly mr: "existing-mr";
    readonly permission: "permission";
    readonly sha: "sha-pinned";
};
export declare function check(id: string, label: string, status: Check['status'], detail?: string): Check;
/** 阻塞原因只来自明确的失败，不把「未知」当作不可执行以外的推断 */
export declare function blockingReasons(checks: Check[]): string[];
/** 默认合并提交信息；用户填了标题就用标题当 subject，说明作为正文 */
export declare function mergeCommitMessage(project: string, source: string, target: string, title?: string | null, description?: string | null): string;
/** 计划有效期：预检结果只在一段短时间内有效，避免用过期快照执行远端写 */
export declare const PLAN_TTL_MS: number;
