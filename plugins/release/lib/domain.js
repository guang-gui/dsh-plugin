/**
 * 发版领域规则：纯函数，不依赖 Git、GitLab 或文件系统。
 * 预检摘要、阻塞判断、分支分类都在这里，可脱离宿主单测。
 */
import { createHash } from 'node:crypto';
export const MODE_LABEL = {
    'create-mr': '创建 MR',
    'merge-mr': '通过 MR 合并',
    'merge-git': 'Git 直接合并',
};
export const MODE_EFFECT = {
    'create-mr': '在 GitLab 创建合并请求，不修改目标分支',
    'merge-mr': '由 GitLab 执行合并，使用本次确认的源提交',
    'merge-git': '本地合并后推送目标分支（普通推送）',
};
/** 统一 remote 形态，用于去重与展示：host/group/repo */
export function parseRemoteUrl(raw) {
    const url = raw.trim();
    if (!url)
        return null;
    let host = '';
    let path = '';
    const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('\\\\');
    const isFileUrl = /^file:\/\//i.test(url);
    const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/.exec(url);
    if (isWindowsPath) {
        path = url.replace(/\\/g, '/');
    }
    else if (isFileUrl) {
        try {
            path = decodeURIComponent(new URL(url).pathname);
        }
        catch {
            return null;
        }
    }
    else if (scp && !url.includes('://')) {
        host = scp[1];
        path = scp[2];
    }
    else {
        try {
            const parsed = new URL(url);
            host = parsed.hostname;
            path = parsed.pathname.replace(/^\/+/, '');
        }
        catch {
            return null;
        }
    }
    path = path.replace(/^\/+/, '').replace(/\.git$/, '').replace(/\/+$/, '');
    if (!path)
        return null;
    const segments = path.split('/').filter(Boolean);
    const name = segments[segments.length - 1] ?? path;
    // 本地路径没有命名空间概念，取上一级目录名更易读
    const namespace = host ? segments.slice(0, -1).join('/') : (segments[segments.length - 2] ?? '');
    return { host: host.toLowerCase(), path, name, namespace };
}
export function normalizeRemoteUrl(raw) {
    const parsed = parseRemoteUrl(raw);
    return parsed ? `${parsed.host}/${parsed.path}`.toLowerCase() : raw.trim().toLowerCase();
}
/** 分支名合法性：拒绝空白、..、~^:?*[\、结尾 .lock 等，避免误用与注入 */
export function isValidBranchName(name) {
    if (!name || name.length > 255)
        return false;
    if (/[\s~^:?*[\\\x00-\x1f\x7f]/.test(name))
        return false;
    if (name.includes('..') || name.includes('@{') || name.includes('//'))
        return false;
    if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock'))
        return false;
    if (name.startsWith('-'))
        return false;
    return name.split('/').every((part) => part.length > 0 && !part.startsWith('.'));
}
export function sha256(input) {
    return createHash('sha256').update(input).digest('hex');
}
/** 计划摘要只包含影响执行的字段：任何输入变化都会改变摘要 */
export function computePlanHash(plan) {
    const canonical = JSON.stringify({
        mode: plan.mode,
        source: plan.sourceBranch,
        target: plan.targetBranch,
        strategy: plan.mergeStrategy,
        deleteSource: plan.deleteSourceBranch,
        title: plan.title ?? null,
        items: plan.items.map((i) => ({
            id: i.projectId,
            src: i.sourceBranch,
            target: i.targetBranch,
            srcSha: i.sourceSha,
            tgtSha: i.targetSha,
            run: i.executable,
        })),
    });
    return sha256(canonical).slice(0, 32);
}
export function summarizePlan(items) {
    return {
        total: items.length,
        executable: items.filter((i) => i.executable && !i.noop).length,
        blocked: items.filter((i) => i.blockers.length > 0).length,
        noop: items.filter((i) => i.noop).length,
        unknown: items.filter((i) => i.checks.some((c) => c.status === 'unknown')).length,
    };
}
export function branchCategory(name) {
    if (/^(master|main|develop|development|dev|trunk|pre|prod|test)$/i.test(name))
        return 'trunk';
    if (/^(release|releases|rel)\//i.test(name))
        return 'release';
    if (/^(hotfix|fix|bugfix)\//i.test(name))
        return 'hotfix';
    if (/^(feature|feat)\//i.test(name))
        return 'feature';
    return 'other';
}
/** 目标分支以主干优先，源分支以发布/特性分支优先 */
const CATEGORY_WEIGHT = {
    target: { trunk: 0, release: 1, hotfix: 2, feature: 3, other: 4 },
    source: { release: 0, feature: 1, hotfix: 2, trunk: 3, other: 4 },
};
export function compareBranchOption(a, b, kind) {
    const weight = CATEGORY_WEIGHT[kind];
    const byCategory = weight[a.category] - weight[b.category];
    if (byCategory !== 0)
        return byCategory;
    if (a.projectCount !== b.projectCount)
        return b.projectCount - a.projectCount;
    return b.name.localeCompare(a.name);
}
export const CHECK_IDS = {
    source: 'source-exists',
    target: 'target-exists',
    ahead: 'ahead',
    conflict: 'conflict',
    mr: 'existing-mr',
    permission: 'permission',
    sha: 'sha-pinned',
};
export function check(id, label, status, detail) {
    return { id, label, status, ...(detail ? { detail } : {}) };
}
/** 阻塞原因只来自明确的失败，不把「未知」当作不可执行以外的推断 */
export function blockingReasons(checks) {
    return checks.filter((c) => c.status === 'danger').map((c) => c.detail || c.label);
}
/** 默认合并提交信息；用户填了标题就用标题当 subject，说明作为正文 */
export function mergeCommitMessage(project, source, target, title, description) {
    const subject = (title ?? '').trim() || `Merge branch '${source}' into '${target}'`;
    const body = (description ?? '').trim();
    return body ? `${subject}\n\n${body}` : subject;
}
/** 计划有效期：预检结果只在一段短时间内有效，避免用过期快照执行远端写 */
export const PLAN_TTL_MS = 10 * 60 * 1000;
//# sourceMappingURL=domain.js.map