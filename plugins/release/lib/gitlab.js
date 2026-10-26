/**
 * GitLab 适配器。业务 URL、分页与状态映射都留在这里，领域层不感知 GitLab 字段。
 */
import { encodeBranch, httpJson, HttpError, joinUrl } from './http.js';
export class GitLabAdapter {
    opts;
    apiBase;
    scopePromise = null;
    constructor(opts) {
        this.opts = opts;
        this.apiBase = joinUrl(opts.baseUrl, '/api/v4');
    }
    api(path, init = {}) {
        return httpJson(`${this.apiBase}${path}`, {
            method: init.method ?? 'GET',
            body: init.body,
            timeoutMs: init.timeoutMs ?? 20_000,
            headers: { 'PRIVATE-TOKEN': this.opts.token },
            signal: this.opts.signal,
        });
    }
    projectPath(idOrPath) {
        return typeof idOrPath === 'number' ? String(idOrPath) : encodeURIComponent(idOrPath);
    }
    async testConnection() {
        const started = Date.now();
        try {
            const version = await this.api('/version', { timeoutMs: 12_000 }).catch(() => ({ version: '未知' }));
            const scope = await this.tokenScope();
            if (scope.kind === 'unknown')
                throw new Error('令牌无效或已过期');
            return {
                ok: true,
                ms: Date.now() - started,
                account: scope.username,
                version: version.version,
                ...(scope.note ? { note: scope.note } : {}),
            };
        }
        catch (e) {
            return { ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
        }
    }
    /** 探测令牌身份，失败不缓存（换令牌后可立刻重试） */
    async tokenScope() {
        if (!this.scopePromise) {
            this.scopePromise = this.detectScope().then((scope) => {
                if (scope.kind === 'unknown')
                    this.scopePromise = null;
                return scope;
            });
        }
        return this.scopePromise;
    }
    async detectScope() {
        const empty = { kind: 'unknown', username: '', projectId: null, projectPath: null, scopes: [], note: null };
        const user = await this.api('/user', { timeoutMs: 12_000 }).catch(() => null);
        if (!user?.username)
            return empty;
        const self = await this.api('/personal_access_tokens/self', { timeoutMs: 12_000 }).catch(() => null);
        const scopes = self?.scopes ?? [];
        const bot = /^project_(\d+)_bot_/.exec(user.username);
        if (!bot)
            return { ...empty, kind: 'personal', username: user.username, scopes };
        const projectId = Number(bot[1]);
        const detail = await this.api(`/projects/${projectId}`, {
            timeoutMs: 12_000,
        }).catch(() => null);
        const projectPath = detail?.path_with_namespace ?? null;
        const target = projectPath ?? `项目 #${projectId}`;
        return {
            kind: 'project',
            username: user.username,
            projectId,
            projectPath,
            scopes,
            note: `这是 ${target} 的项目级令牌，只能访问该项目；其他项目会返回 404。跨项目建 MR 请改用个人访问令牌（scope: api）`,
        };
    }
    async getBranch(project, branch) {
        try {
            const data = await this.api(`/projects/${this.projectPath(project)}/repository/branches/${encodeBranch(branch)}`);
            return {
                name: data.name,
                sha: data.commit.id,
                committedAt: data.commit.committed_date ?? null,
                author: data.commit.author_name ?? null,
            };
        }
        catch (e) {
            if (e instanceof HttpError && e.status === 404)
                return null;
            throw e;
        }
    }
    async listOpenMrs(project, source, target) {
        const data = await this.api(`/projects/${this.projectPath(project)}/merge_requests?state=opened&source_branch=${encodeURIComponent(source)}&target_branch=${encodeURIComponent(target)}&per_page=20`);
        return data.map((m) => this.toMrRef(m));
    }
    async getMr(project, iid) {
        return this.toMrRef(await this.api(`/projects/${this.projectPath(project)}/merge_requests/${iid}`));
    }
    async createMr(project, input) {
        const data = await this.api(`/projects/${this.projectPath(project)}/merge_requests`, {
            method: 'POST',
            body: {
                source_branch: input.sourceBranch,
                target_branch: input.targetBranch,
                title: input.title,
                description: input.description ?? '',
                remove_source_branch: false,
            },
            timeoutMs: 30_000,
        });
        return this.toMrRef(data);
    }
    async mergeMr(project, iid, sha, opts) {
        const data = await this.api(`/projects/${this.projectPath(project)}/merge_requests/${iid}/merge`, {
            method: 'PUT',
            body: {
                sha,
                should_remove_source_branch: opts.deleteSourceBranch,
                ...(opts.message ? { merge_commit_message: opts.message } : {}),
                squash: false,
            },
            timeoutMs: 45_000,
        });
        return this.toMrRef(data);
    }
    toMrRef(m) {
        const state = m.state === 'opened' || m.state === 'merged' || m.state === 'closed' || m.state === 'locked'
            ? m.state
            : 'unknown';
        const raw = m.detailed_merge_status ?? m.merge_status ?? '';
        let mergeStatus = 'unknown';
        if (m.has_conflicts || raw === 'conflict' || raw === 'cannot_be_merged')
            mergeStatus = 'conflict';
        else if (raw === 'mergeable' || raw === 'can_be_merged')
            mergeStatus = 'mergeable';
        else if (raw === 'not_approved')
            mergeStatus = 'not-approved';
        else if (raw === 'ci_must_pass' || raw === 'ci_still_running')
            mergeStatus = 'ci-failed';
        else if (raw === 'checking' || raw === 'unchecked' || raw === '')
            mergeStatus = 'checking';
        else if (raw)
            mergeStatus = 'blocked';
        const pipelineRaw = m.head_pipeline?.status ?? m.pipeline?.status ?? 'none';
        const pipeline = pipelineRaw === 'success' || pipelineRaw === 'failed' || pipelineRaw === 'running' || pipelineRaw === 'pending'
            ? pipelineRaw
            : pipelineRaw === 'skipped' || pipelineRaw === 'canceled'
                ? 'skipped'
                : 'none';
        const detailMap = {
            conflict: '目标分支与源分支存在冲突',
            'not-approved': '审批未满足',
            'ci-failed': '流水线未通过',
            blocked: 'GitLab 拒绝合并（分支保护或讨论未解决）',
            checking: 'GitLab 正在计算可合并状态',
            unknown: '无法获取合并状态',
        };
        return {
            iid: m.iid,
            url: m.web_url,
            state,
            title: m.title,
            sourceBranch: m.source_branch,
            targetBranch: m.target_branch,
            pipeline,
            mergeStatus,
            ...(detailMap[mergeStatus] ? { detail: detailMap[mergeStatus] } : {}),
            mergeCommitSha: m.merge_commit_sha ?? m.squash_commit_sha ?? null,
        };
    }
}
//# sourceMappingURL=gitlab.js.map