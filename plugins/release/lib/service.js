/**
 * 发版服务：预检（只读）与执行（写远端）分成两步，中间用计划摘要串起来。
 *
 * 设计要点：
 * - 预检只读远端，不修改任何东西；执行前重新核对 SHA，防止用过期快照写远端。
 * - 写操作永远走 bare 缓存 + 临时工作树，不碰用户的工作区。
 * - `create-mr` 只调 GitLab API，不下载代码。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK_IDS, check, computePlanHash, isValidBranchName, mergeCommitMessage, normalizeRemoteUrl, parseRemoteUrl, PLAN_TTL_MS, summarizePlan, } from './domain.js';
import { GitLabAdapter } from './gitlab.js';
import { HeadCacheStore } from './head-cache.js';
import { HttpError } from './http.js';
import { projectId, scanRoots } from './scanner.js';
import { JsonStore } from './store.js';
import { BranchCatalog } from './branch-catalog.js';
const NULL_LOGGER = { info: () => { }, warn: () => { }, debug: () => { } };
/** 并发上限内跑完所有任务，保持结果顺序 */
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
        for (;;) {
            const index = cursor++;
            if (index >= items.length)
                return;
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}
function short(sha) {
    return sha ? sha.slice(0, 8) : '—';
}
function errorMessage(e) {
    return e instanceof Error ? e.message : String(e);
}
export class ReleaseService {
    config;
    git;
    logger;
    store;
    heads;
    adapter = null;
    scanned = false;
    rangeCache = new Map();
    treeCache = new Map();
    initPromise = null;
    initError = null;
    branches;
    constructor(config, git, logger = NULL_LOGGER) {
        this.config = config;
        this.git = git;
        this.logger = logger;
        this.store = new JsonStore(config.dataDir);
        this.branches = this.createBranchCatalog();
        this.heads = new HeadCacheStore(join(config.dataDir, 'head-cache.json'), (m, d) => this.logger.warn(m, d));
    }
    /* ------------------------------------------------------------------ */
    /* 生命周期                                                            */
    /* ------------------------------------------------------------------ */
    /**
     * 运行时改配置：界面上保存设置后调用，不需要重启 dsh。
     *
     * 只有真正影响缓存的字段变化时才清缓存——GitLab 连接变了要重建适配器
     * （旧令牌的身份画像会一起作废），扫描参数变了要重新扫目录。
     */
    reconfigure(patch) {
        const prev = this.config;
        this.config = { ...prev, ...patch };
        if (this.config.gitlabBaseUrl !== prev.gitlabBaseUrl || this.config.gitlabToken !== prev.gitlabToken) {
            this.adapter = null;
            this.branches = this.createBranchCatalog();
        }
        const rootsChanged = this.config.roots.join('\u0000') !== prev.roots.join('\u0000') || this.config.scanDepth !== prev.scanDepth;
        if (rootsChanged) {
            this.branches = this.createBranchCatalog();
            this.scanned = false;
            this.rangeCache.clear();
            this.treeCache.clear();
        }
    }
    /** 当前生效配置。含明文令牌，只允许宿主内部使用，对外必须先脱敏。 */
    get settings() {
        return this.config;
    }
    /** 配置是否已经能让 GitLab 相关功能跑起来 */
    get gitlabReady() {
        return Boolean(this.config.gitlabBaseUrl && this.config.gitlabToken);
    }
    /**
     * 探测 GitLab 连接，可以带上还没保存的新值——设置页「测试连接」用。
     * 不复用 this.adapter：避免把未保存的凭据写进当前实例的缓存。
     */
    async testGitLab(override) {
        const baseUrl = (override?.baseUrl ?? this.config.gitlabBaseUrl).trim().replace(/\/+$/, '');
        const token = (override?.token ?? this.config.gitlabToken).trim();
        if (!baseUrl)
            return { ok: false, ms: 0, error: '未填写 GitLab 地址' };
        if (!token)
            return { ok: false, ms: 0, error: '未填写令牌' };
        try {
            return await new GitLabAdapter({ baseUrl, token }).testConnection();
        }
        catch (e) {
            return { ok: false, ms: 0, error: e instanceof Error ? e.message : String(e) };
        }
    }
    /**
     * 首次使用时才读盘与扫描：插件加载本身不做 I/O，dsh 启动不会因为
     * 扫描一堆仓库而变慢；初始化失败也只会影响工具调用，不会拖垮整个插件树。
     */
    ready() {
        if (!this.initPromise) {
            this.initPromise = this.bootstrap().catch((e) => {
                this.initError = e instanceof Error ? e : new Error(String(e));
            });
        }
        return this.initPromise.then(() => {
            if (this.initError)
                throw this.initError;
        });
    }
    async bootstrap() {
        this.store.load();
        this.heads.load();
        if (!this.store.list.length && (this.config.roots.length || this.config.projects.length)) {
            await this.scanProjects();
        }
    }
    dispose() {
        this.heads.flush();
    }
    /* ------------------------------------------------------------------ */
    /* 项目                                                                */
    /* ------------------------------------------------------------------ */
    get projects() {
        return this.store.list;
    }
    get roots() {
        return this.config.roots;
    }
    /** 扫描根目录并合并显式配置；force=false 时只在从未扫描过的情况下扫描 */
    async refreshProjects(force = true) {
        await this.ready();
        if (!force && this.scanned)
            return this.store.list;
        return this.scanProjects();
    }
    async scanProjects() {
        const existing = new Map(this.store.list.map((p) => [p.id, p]));
        let discovered = [];
        if (this.config.roots.length) {
            const result = await scanRoots(this.config.roots, this.config.scanDepth, this.git);
            discovered = result.projects;
            if (result.errors.length) {
                this.logger.debug('扫描有跳过项', { count: result.errors.length, sample: result.errors.slice(0, 3) });
            }
        }
        const merged = new Map();
        for (const p of discovered) {
            const previous = existing.get(p.id);
            merged.set(p.id, {
                id: p.id,
                name: p.name,
                namespace: p.namespace,
                remoteUrl: p.remoteUrl,
                localPath: p.localPath,
                gitlabPath: p.gitlabPath,
                defaultTarget: previous?.defaultTarget ?? p.defaultTarget,
                // 扫描不能覆盖用户手工停用的项目
                enabled: previous?.enabled ?? p.enabled,
                source: 'scan',
            });
        }
        // 显式配置优先：可以补充没扫描到的仓库，也能覆盖默认目标分支与启用状态
        for (const entry of this.config.projects) {
            const remote = entry.remoteUrl ?? (entry.path ? `https://${this.hostOfBase()}/${entry.path}.git` : undefined);
            if (!remote)
                continue;
            const parsed = parseRemoteUrl(remote);
            if (!parsed)
                continue;
            const id = projectId(normalizeRemoteUrl(remote));
            const previous = merged.get(id);
            merged.set(id, {
                id,
                name: entry.name ?? previous?.name ?? parsed.name,
                namespace: previous?.namespace ?? parsed.namespace,
                remoteUrl: previous?.remoteUrl ?? remote,
                localPath: entry.localPath ?? previous?.localPath ?? null,
                gitlabPath: entry.path ?? previous?.gitlabPath ?? parsed.path,
                defaultTarget: entry.defaultTarget ?? previous?.defaultTarget ?? null,
                enabled: entry.enabled ?? previous?.enabled ?? true,
                source: 'config',
            });
        }
        const list = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
        this.store.replaceProjects(list);
        this.branches = this.createBranchCatalog();
        this.scanned = true;
        this.logger.info('项目清单已更新', { total: list.length, roots: this.config.roots.length });
        return list;
    }
    hostOfBase() {
        try {
            return new URL(this.config.gitlabBaseUrl).host;
        }
        catch {
            return 'localhost';
        }
    }
    selectProjects(ids) {
        const enabled = this.store.list.filter((p) => p.enabled);
        if (!ids?.length)
            return enabled;
        const wanted = new Set(ids);
        return enabled.filter((p) => wanted.has(p.id) || wanted.has(p.name) || wanted.has(p.gitlabPath));
    }
    /* ------------------------------------------------------------------ */
    /* 分支                                                                */
    /* ------------------------------------------------------------------ */
    async branchOptions(keyword = '', projectIds, refresh = false) {
        await this.ready();
        const catalog = this.branches;
        // Load the full enabled set once, so changing the selection never loses local candidates.
        await catalog.view(this.selectProjects(), this.config.concurrency, this.config.headCacheTtlSec, refresh);
        return catalog.snapshot(this.selectProjects(projectIds), keyword);
    }
    createBranchCatalog() {
        // Capture the current adapter, so reconfiguration cannot mix two identities in an old request.
        const adapter = this.adapterFor();
        const baseUrl = this.config.gitlabBaseUrl;
        return new BranchCatalog(this.git, async (project) => {
            const remote = parseRemoteUrl(project.remoteUrl);
            if (adapter && remote?.host === new URL(baseUrl).hostname.toLowerCase()) {
                return adapter.listBranches(project.gitlabPath);
            }
            const dir = await this.repoDirFor(project, false);
            return this.git.lsRemoteHeads(dir ?? undefined, dir ? 'origin' : project.remoteUrl);
        });
    }
    /** Tools share the same fuzzy catalog as the UI; cached searches do not query the network again. */
    async findBranches(keyword, projectIds, limit = 200) {
        await this.ready();
        const catalog = this.branches;
        await catalog.view(this.selectProjects(), this.config.concurrency, this.config.headCacheTtlSec);
        await catalog.wait();
        return catalog.matches(this.selectProjects(projectIds), keyword.trim(), limit);
    }
    /* ------------------------------------------------------------------ */
    /* 预检                                                                */
    /* ------------------------------------------------------------------ */
    async planMerge(input) {
        await this.ready();
        const started = Date.now();
        const mode = input.mode;
        const source = input.sourceBranch.trim();
        if (!isValidBranchName(source))
            throw new Error(`源分支名不合法：${source}`);
        const globalTarget = (input.targetBranch ?? this.config.defaultTarget).trim();
        if (globalTarget && !isValidBranchName(globalTarget))
            throw new Error(`目标分支名不合法：${globalTarget}`);
        const projects = this.selectProjects(input.projectIds);
        if (!projects.length) {
            throw new Error(this.config.roots.length || this.config.projects.length
                ? '没有匹配的启用项目，请先检查 roots 配置或项目是否被停用'
                : '还没有任何仓库：请在插件配置里填 roots（本地仓库根目录）或 projects');
        }
        const items = await mapLimit(projects, this.config.concurrency, (project, index) => this.checkProject(project, mode, source, globalTarget, index, input.refresh !== false, input.signal));
        const mergeStrategy = input.mergeStrategy ?? this.config.mergeStrategy;
        const deleteSourceBranch = input.deleteSourceBranch ?? this.config.deleteSourceBranch;
        const title = (input.title ?? '').trim() || defaultTitle(mode, source, globalTarget);
        const description = (input.description ?? '').trim() || null;
        const hash = computePlanHash({
            mode,
            sourceBranch: source,
            targetBranch: globalTarget,
            mergeStrategy,
            deleteSourceBranch,
            title,
            items,
        });
        const now = new Date();
        const plan = {
            id: `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            hash,
            mode,
            sourceBranch: source,
            targetBranch: globalTarget,
            mergeStrategy,
            deleteSourceBranch,
            title,
            description,
            items,
            summary: summarizePlan(items),
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
            checkDurationMs: Date.now() - started,
        };
        this.store.savePlan(plan);
        this.logger.info('预检完成', {
            planId: plan.id,
            mode,
            total: plan.summary.total,
            executable: plan.summary.executable,
            blocked: plan.summary.blocked,
            ms: plan.checkDurationMs,
        });
        return plan;
    }
    async checkProject(project, mode, sourceBranch, targetBranchInput, order, refresh, signal) {
        const targetBranch = (project.defaultTarget ?? targetBranchInput).trim();
        const checks = [];
        const warnings = [];
        let sourceSha = null;
        let targetSha = null;
        let ahead = null;
        let behind = null;
        let conflictFiles = null;
        let mr = null;
        let mrApiStatus = null;
        let mrApiError = false;
        let cachedAgeMs = null;
        let sourceMissing = false;
        let targetMissing = false;
        let sourceError = null;
        let targetError = null;
        const adapter = this.adapterFor();
        const remoteHost = parseRemoteUrl(project.remoteUrl)?.host;
        let instanceHost = '';
        try {
            instanceHost = new URL(this.config.gitlabBaseUrl).hostname.toLowerCase();
        }
        catch { /* Git-only configuration */ }
        const sameGitLab = adapter !== null && remoteHost === instanceHost;
        const needsApi = mode !== 'merge-git';
        // 创建 MR 不需要本地对象；只有要算冲突/合并才需要把仓库落到本地
        const dir = await this.repoDirFor(project, mode !== 'create-mr').catch((e) => {
            sourceError = errorMessage(e);
            return null;
        });
        const sourceRef = `refs/heads/${sourceBranch}`;
        const targetRef = `refs/heads/${targetBranch}`;
        const ttl = this.config.headCacheTtlSec * 1000;
        const now = Date.now();
        // 1) 先看持久缓存：命中就直接用，不碰网络。
        //    缓存只记录「远端分支指向哪个提交」，不要求本地已有这些对象——
        //    创建 MR 本来就不下载代码，若用 hasCommit 判定会把缓存全部判死。
        const sCached = ttl > 0 && !refresh ? this.heads.get(project.id, sourceRef) : undefined;
        const tCached = ttl > 0 && !refresh ? this.heads.get(project.id, targetRef) : undefined;
        let confirmed = false;
        if (sCached && tCached && now - sCached.at < ttl && now - tCached.at < ttl) {
            sourceSha = sCached.sha;
            targetSha = tCached.sha;
            sourceMissing = sCached.sha === null;
            targetMissing = tCached.sha === null;
            cachedAgeMs = Math.max(now - sCached.at, now - tCached.at);
            confirmed = true;
        }
        // 2) 默认每次预检核对最新 SHA；候选列表缓存不能作为「无变化」的依据。
        // 同一 GitLab 实例优先并行读取两个分支，避免每个项目启动一次慢速 Git 连接。
        if (!confirmed) {
            let refs = null;
            if (adapter && sameGitLab) {
                try {
                    const branches = await Promise.all([
                        adapter.getBranch(project.gitlabPath, sourceBranch),
                        adapter.getBranch(project.gitlabPath, targetBranch),
                    ]);
                    refs = branches.filter((branch) => branch !== null);
                }
                catch (e) {
                    this.logger.debug('分支 API 查询失败，改用 Git 核对', { project: project.name, error: errorMessage(e) });
                }
            }
            try {
                refs ??= await this.git.lsRemoteHeads(dir ?? undefined, dir ? 'origin' : project.remoteUrl, [sourceRef, targetRef]);
            }
            catch (e) {
                sourceError = errorMessage(e);
                targetError = sourceError;
            }
            if (refs) {
                sourceSha = pickSha(refs, sourceRef);
                targetSha = pickSha(refs, targetRef);
                sourceMissing = !sourceSha;
                targetMissing = !targetSha;
                this.rememberHead(project.id, sourceRef, sourceSha);
                this.rememberHead(project.id, targetRef, targetSha);
            }
        }
        // 3) 合并类操作要本地对象才能算差异与冲突：缺什么补什么。
        //    创建 MR 完全不碰本地对象——差异算不出来也不影响建 MR，省掉每个仓库几次 git 调用。
        if (dir && mode !== 'create-mr' && (sourceSha || targetSha)) {
            const missing = [];
            if (sourceSha && !(await this.git.hasCommit(dir, sourceSha)))
                missing.push(sourceBranch);
            if (targetSha && !(await this.git.hasCommit(dir, targetSha)))
                missing.push(targetBranch);
            if (missing.length) {
                try {
                    await this.git.fetchBranches(dir, missing);
                }
                catch (e) {
                    // 下载失败仍保留 ls-remote 的 SHA：分支确实存在，只是差异暂时算不出来
                    warnings.push(`拉取对象失败：${errorMessage(e)}`);
                }
            }
            // 对象已在本地时顺手同步远端跟踪引用，后续 git 命令可直接用分支名
            if (sourceSha && !missing.includes(sourceBranch)) {
                await this.git.updateRemoteRef(dir, sourceBranch, sourceSha).catch(() => undefined);
            }
            if (targetSha && !missing.includes(targetBranch)) {
                await this.git.updateRemoteRef(dir, targetBranch, targetSha).catch(() => undefined);
            }
        }
        // 拉取失败时用 API 确认存在性，避免把网络问题误报为分支不存在
        if (!sourceSha && !sourceMissing && !sourceError && adapter) {
            try {
                const branch = await adapter.getBranch(project.gitlabPath, sourceBranch);
                if (branch)
                    sourceSha = branch.sha;
                else
                    sourceMissing = true;
            }
            catch (e) {
                sourceError = errorMessage(e);
            }
        }
        if (!targetSha && !targetMissing && !targetError && adapter) {
            try {
                const branch = await adapter.getBranch(project.gitlabPath, targetBranch);
                if (branch)
                    targetSha = branch.sha;
                else
                    targetMissing = true;
            }
            catch (e) {
                targetError = errorMessage(e);
            }
        }
        if (dir && sourceSha && targetSha) {
            const rangeKey = `${targetSha}..${sourceSha}`;
            const cachedRange = this.rangeCache.get(rangeKey);
            if (cachedRange) {
                ahead = cachedRange.ahead;
                behind = cachedRange.behind;
            }
            else {
                try {
                    const both = await this.git.countBoth(dir, targetSha, sourceSha);
                    ahead = both.ahead;
                    behind = both.behind;
                    this.remember(this.rangeCache, rangeKey, both, 500);
                }
                catch {
                    ahead = null;
                    behind = null;
                }
            }
            if (ahead === 0) {
                // 无需合并时不必做冲突预演
                conflictFiles = [];
            }
            else if (ahead !== null && ahead > 0 && mode !== 'create-mr') {
                const cachedTree = this.treeCache.get(rangeKey);
                if (cachedTree) {
                    conflictFiles = cachedTree;
                }
                else {
                    try {
                        const tree = await this.git.mergeTree(dir, targetSha, sourceSha);
                        conflictFiles = tree.clean ? [] : tree.conflicts;
                        this.remember(this.treeCache, rangeKey, conflictFiles, 200);
                    }
                    catch {
                        conflictFiles = null;
                    }
                }
            }
        }
        if (ahead === null && mode === 'create-mr' && sourceSha && targetSha && adapter && sameGitLab) {
            try {
                ahead = await adapter.countAhead(project.gitlabPath, targetSha, sourceSha);
            }
            catch (e) {
                this.logger.debug('远端提交比较失败', { project: project.name, error: errorMessage(e) });
            }
        }
        if (ahead === null && mode === 'create-mr' && sourceSha && targetSha) {
            warnings.push('待合并提交数暂时无法确认（创建 MR 时由 GitLab 校验）');
        }
        // Git 直接合并路径不经过 MR，跳过 GitLab API 查询；
        // 源分支不存在时也不可能有 MR，省掉一次必然无用的往返
        if (adapter && needsApi && !sourceMissing) {
            try {
                const mrs = await adapter.listOpenMrs(project.gitlabPath, sourceBranch, targetBranch);
                mr = mrs[0] ?? null;
            }
            catch (e) {
                // 这里静默吞异常会让预检一片绿灯、执行时才 404，所以记下状态码变成阻塞项
                mr = null;
                mrApiError = true;
                mrApiStatus = e instanceof HttpError ? e.status : null;
            }
        }
        const permissionNote = mrApiError && adapter && isPermissionError(mrApiStatus)
            ? await this.apiPermissionNote(adapter, project, mrApiStatus)
            : null;
        /* ---- 检查清单 ---- */
        if (sourceMissing)
            checks.push(check(CHECK_IDS.source, '源分支', 'danger', '源分支不存在'));
        else if (sourceError)
            checks.push(check(CHECK_IDS.source, '源分支', 'unknown', sourceError));
        else
            checks.push(check(CHECK_IDS.source, '源分支', 'ok', `已确认 · ${short(sourceSha)}`));
        if (targetMissing)
            checks.push(check(CHECK_IDS.target, '目标分支', 'danger', '目标分支不存在'));
        else if (targetError)
            checks.push(check(CHECK_IDS.target, '目标分支', 'unknown', targetError));
        else
            checks.push(check(CHECK_IDS.target, '目标分支', 'ok', `已确认 · ${short(targetSha)}`));
        if (ahead === null)
            checks.push(check(CHECK_IDS.ahead, '待合并提交', 'unknown', '无法计算差异'));
        else if (ahead === 0)
            checks.push(check(CHECK_IDS.ahead, '待合并提交', 'warn', '无需合并：源提交已包含在目标分支'));
        else
            checks.push(check(CHECK_IDS.ahead, '待合并提交', 'ok', `${ahead} 个提交`));
        if (mode === 'create-mr') {
            checks.push(check(CHECK_IDS.conflict, '合并冲突', 'skipped', '创建 MR 阶段不做冲突预演'));
        }
        else if (conflictFiles === null) {
            checks.push(check(CHECK_IDS.conflict, '合并冲突', 'unknown', '当前环境不支持冲突预演'));
        }
        else if (conflictFiles.length) {
            checks.push(check(CHECK_IDS.conflict, '合并冲突', 'danger', `冲突文件 ${conflictFiles.length} 个：${conflictFiles.slice(0, 3).join('、')}`));
        }
        else {
            checks.push(check(CHECK_IDS.conflict, '合并冲突', 'ok', '无冲突'));
        }
        if (!needsApi)
            checks.push(check(CHECK_IDS.mr, '已有 MR', 'skipped', 'Git 直接合并不经过 MR'));
        else if (sourceMissing)
            checks.push(check(CHECK_IDS.mr, '已有 MR', 'skipped', '源分支不存在，跳过查询'));
        else if (mr)
            checks.push(check(CHECK_IDS.mr, '已有 MR', 'ok', `!${mr.iid} · ${mr.state} · 可复用`));
        else if (mrApiError)
            checks.push(check(CHECK_IDS.mr, '已有 MR', 'danger', '查询失败：GitLab 接口未通过'));
        else
            checks.push(check(CHECK_IDS.mr, '已有 MR', 'skipped', '无，将新建'));
        if (needsApi && !adapter) {
            checks.push(check(CHECK_IDS.permission, '执行权限', 'danger', '未配置 GitLab 连接'));
        }
        else if (permissionNote) {
            checks.push(check(CHECK_IDS.permission, mode === 'merge-mr' ? '执行权限' : '创建权限', 'danger', `${permissionNote.short}：${permissionNote.detail}`));
        }
        else if (mode === 'merge-mr') {
            if (mr && mr.mergeStatus !== 'mergeable' && mr.mergeStatus !== 'checking') {
                checks.push(check(CHECK_IDS.permission, '执行权限', 'danger', mr.detail || 'MR 当前不可合并'));
            }
            else {
                checks.push(check(CHECK_IDS.permission, '执行权限', 'ok', '已具备 MR 合并条件'));
            }
        }
        else if (mode === 'merge-git') {
            checks.push(check(CHECK_IDS.permission, '推送权限', 'warn', '执行时校验，非快进会被拒绝'));
        }
        else {
            checks.push(check(CHECK_IDS.permission, '创建权限', 'ok', '已配置 GitLab 连接'));
        }
        if (sourceSha)
            checks.push(check(CHECK_IDS.sha, '源提交锁定', 'ok', short(sourceSha)));
        if (targetSha && targetSha !== sourceSha)
            warnings.push(`目标分支当前为 ${short(targetSha)}`);
        /* ---- 阻塞判断 ---- */
        const blockers = [];
        if (sourceMissing)
            blockers.push('源分支不存在');
        if (targetMissing)
            blockers.push('目标分支不存在');
        if (sourceError && !sourceSha)
            blockers.push(`源分支无法确认：${sourceError}`);
        if (targetError && !targetSha)
            blockers.push(`目标分支无法确认：${targetError}`);
        // 创建 MR 不依赖本地差异，算不出来也不算阻塞；合并类操作必须知道差异
        if (ahead === null && mode !== 'create-mr')
            blockers.push('待合并提交数未知');
        if (mode !== 'create-mr' && conflictFiles && conflictFiles.length) {
            blockers.push(`合并冲突：${conflictFiles.slice(0, 3).join('、')}`);
        }
        if (needsApi && !adapter)
            blockers.push('未配置 GitLab 连接');
        if (needsApi && permissionNote)
            blockers.push(permissionNote.short);
        if (mode === 'merge-mr' && mr && mr.mergeStatus !== 'mergeable' && mr.mergeStatus !== 'checking') {
            blockers.push(mr.detail || 'MR 当前不可合并');
        }
        const noop = ahead === 0;
        return {
            projectId: project.id,
            name: project.name,
            namespace: project.namespace,
            order,
            sourceBranch,
            targetBranch,
            sourceSha,
            targetSha,
            ahead,
            behind,
            checks,
            blockers: [...new Set(blockers)],
            warnings,
            mr,
            executable: blockers.length === 0 && !noop,
            noop,
            cachedAgeMs,
        };
    }
    /* ------------------------------------------------------------------ */
    /* 执行                                                                */
    /* ------------------------------------------------------------------ */
    async applyPlan(input) {
        await this.ready();
        const started = Date.now();
        const plan = this.store.getPlan(input.planId);
        if (!plan)
            throw new Error(`找不到计划 ${input.planId}，请重新预检`);
        if (plan.hash !== input.planHash)
            throw new Error('计划摘要不匹配：预检结果已变化，请重新预检');
        if (Date.parse(plan.expiresAt) < Date.now()) {
            throw new Error(`计划已过期（${plan.expiresAt}），请重新预检`);
        }
        // 文案可能被用户在确认时改过：以传入值为准重新计算摘要
        const title = (input.title ?? plan.title ?? '').trim();
        const description = (input.description ?? plan.description ?? '').trim() || null;
        if (title !== (plan.title ?? '') || description !== (plan.description ?? null)) {
            const nextHash = computePlanHash({
                mode: plan.mode,
                sourceBranch: plan.sourceBranch,
                targetBranch: plan.targetBranch,
                mergeStrategy: plan.mergeStrategy,
                deleteSourceBranch: plan.deleteSourceBranch,
                title,
                items: plan.items,
            });
            if (nextHash !== plan.hash) {
                // 摘要变化只可能来自文案，允许继续，但把新值写回计划
                plan.title = title;
                plan.description = description;
                plan.hash = nextHash;
                this.store.savePlan(plan);
            }
        }
        const targets = plan.items.filter((i) => i.executable && !i.noop);
        const results = [];
        for (const item of targets) {
            if (input.signal?.aborted) {
                results.push({
                    projectId: item.projectId,
                    name: item.name,
                    ok: false,
                    kind: 'failed',
                    message: '已取消',
                    mr: null,
                    sha: null,
                    url: null,
                    error: '已取消',
                });
                continue;
            }
            try {
                results.push(await this.executeItem(plan, item, input.signal));
            }
            catch (e) {
                const message = errorMessage(e);
                this.logger.warn('执行失败', { project: item.name, error: message });
                results.push({
                    projectId: item.projectId,
                    name: item.name,
                    ok: false,
                    kind: 'failed',
                    message,
                    mr: item.mr,
                    sha: null,
                    url: item.mr?.url ?? null,
                    error: message,
                });
            }
        }
        // 未执行的项（阻塞 / 无需合并）也如实回报，避免用户以为漏跑了
        const skipped = plan.items.filter((i) => !i.executable || i.noop);
        for (const item of skipped) {
            results.push({
                projectId: item.projectId,
                name: item.name,
                ok: item.noop,
                kind: item.noop ? 'noop' : 'failed',
                message: item.noop ? '无需合并（源提交已在目标分支）' : item.blockers.join('；') || '未执行',
                mr: item.mr,
                sha: null,
                url: item.mr?.url ?? null,
                error: item.noop ? null : item.blockers.join('；') || '未执行',
            });
        }
        const succeeded = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => r.kind === 'failed').length;
        const durationMs = Date.now() - started;
        // 落到任务中心：失败也算记录，否则「哪个仓库没发出去」事后无从查起
        this.store.addTask({
            id: `t_${started.toString(36)}`,
            planId: plan.id,
            mode: plan.mode,
            sourceBranch: plan.sourceBranch,
            targetBranch: plan.targetBranch,
            mergeStrategy: plan.mergeStrategy,
            deleteSourceBranch: plan.deleteSourceBranch,
            title: plan.title,
            startedAt: new Date(started).toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs,
            total: plan.items.length,
            succeeded,
            failed,
            skipped: skipped.length,
            status: failed === 0 ? 'success' : succeeded > 0 ? 'partial' : 'failed',
            results,
        });
        return {
            planId: plan.id,
            mode: plan.mode,
            results,
            succeeded,
            failed,
            skipped: skipped.length,
            durationMs,
        };
    }
    /** 任务中心：最近的执行记录（新的在前） */
    get tasks() {
        return this.store.taskList;
    }
    async executeItem(plan, item, signal) {
        const project = this.store.list.find((p) => p.id === item.projectId);
        if (!project)
            throw new Error(`项目已从清单移除：${item.name}`);
        // 写操作永远用 bare 缓存 + 临时工作树，不碰用户的工作区
        const cache = await this.ensureWriteCache(project);
        await this.git.fetch(cache, signal);
        const sourceSha = await this.git.revParse(cache, `refs/remotes/origin/${item.sourceBranch}`);
        const targetSha = await this.git.revParse(cache, `refs/remotes/origin/${item.targetBranch}`);
        if (!sourceSha)
            throw new Error('源分支已不存在，请重新预检');
        if (!targetSha)
            throw new Error('目标分支已不存在，请重新预检');
        if (item.sourceSha && sourceSha !== item.sourceSha) {
            throw new Error(`源分支已更新（${short(item.sourceSha)} → ${short(sourceSha)}），请重新预检`);
        }
        if (item.targetSha && targetSha !== item.targetSha) {
            throw new Error(`目标分支已更新（${short(item.targetSha)} → ${short(targetSha)}），请重新预检`);
        }
        const ahead = await this.git.countRange(cache, targetSha, sourceSha);
        if (ahead === 0) {
            return {
                projectId: project.id,
                name: project.name,
                ok: true,
                kind: 'noop',
                message: '无需合并（源提交已在目标分支）',
                mr: null,
                sha: targetSha,
                url: null,
                error: null,
            };
        }
        if (plan.mode !== 'create-mr') {
            const tree = await this.git.mergeTree(cache, targetSha, sourceSha);
            if (!tree.clean)
                throw new Error(`合并冲突：${tree.conflicts.slice(0, 3).join('、')}`);
        }
        if (plan.mode === 'merge-git') {
            return this.mergeWithGit(plan, project, item, cache, sourceSha, targetSha);
        }
        return this.writeWithMr(plan, project, item, sourceSha);
    }
    async mergeWithGit(plan, project, item, cache, sourceSha, targetSha) {
        const worktree = join(this.config.dataDir, 'worktrees', `${plan.id}-${item.order}`);
        const branch = `pa-merge/${plan.id}-${item.order}`;
        await this.git.addWorktree(cache, worktree, targetSha, branch);
        try {
            const info = await this.git.merge(worktree, sourceSha, plan.mergeStrategy, mergeCommitMessage(project.name, item.sourceBranch, item.targetBranch, plan.title, plan.description));
            await this.git.push(worktree, `HEAD:refs/heads/${item.targetBranch}`);
            // 推送后核验：远端目标分支必须真的指向新提交
            const heads = await this.git.lsRemoteHeads(worktree, 'origin', `refs/heads/${item.targetBranch}`);
            const remoteSha = heads[0]?.sha ?? null;
            if (remoteSha && remoteSha !== info.sha) {
                throw new Error(`推送后远端仍为 ${short(remoteSha)}，预期 ${short(info.sha)}`);
            }
            if (plan.deleteSourceBranch && item.sourceBranch !== item.targetBranch) {
                await this.git.deleteRemoteBranch(cache, item.sourceBranch).catch((e) => {
                    this.logger.warn('删除源分支失败', { project: project.name, error: errorMessage(e) });
                });
            }
            return {
                projectId: project.id,
                name: project.name,
                ok: true,
                kind: 'push',
                message: `已合并并推送 ${item.targetBranch} · ${short(info.sha)}`,
                mr: null,
                sha: info.sha,
                url: null,
                error: null,
            };
        }
        finally {
            await this.git.removeWorktree(cache, worktree).catch(() => undefined);
        }
    }
    async writeWithMr(plan, project, item, sourceSha) {
        const adapter = this.adapterFor();
        if (!adapter)
            throw new Error('未配置 GitLab 连接，无法创建或合并 MR');
        const path = project.gitlabPath;
        const guard = async (fn) => {
            try {
                return await fn();
            }
            catch (e) {
                const status = e instanceof HttpError ? e.status : null;
                if (!isPermissionError(status))
                    throw e;
                const note = await this.apiPermissionNote(adapter, project, status);
                throw new Error(`${note.short}：${note.detail}`);
            }
        };
        let mr = (await guard(() => adapter.listOpenMrs(path, item.sourceBranch, item.targetBranch)))[0] ?? null;
        if (!mr) {
            // 实测部分 GitLab 实例不校验源分支是否存在（不存在的分支也能 201 建出 MR），
            // 预检到执行之间若分支被删就会产出空 MR，所以自己先确认一次。
            const source = await guard(() => adapter.getBranch(path, item.sourceBranch));
            if (!source)
                throw new Error(`源分支 ${item.sourceBranch} 已不存在，未创建 MR`);
            mr = await guard(() => adapter.createMr(path, {
                sourceBranch: item.sourceBranch,
                targetBranch: item.targetBranch,
                title: plan.title || `${item.sourceBranch} → ${item.targetBranch}`,
                description: plan.description ?? undefined,
            }));
            item.mr = mr;
            this.store.savePlan(plan);
            if (plan.mode === 'create-mr') {
                return {
                    projectId: project.id,
                    name: project.name,
                    ok: true,
                    kind: 'mr',
                    message: `已创建 MR !${mr.iid}`,
                    mr,
                    sha: null,
                    url: mr.url,
                    error: null,
                };
            }
        }
        else if (plan.mode === 'create-mr') {
            return {
                projectId: project.id,
                name: project.name,
                ok: true,
                kind: 'mr',
                message: `复用已有 MR !${mr.iid}`,
                mr,
                sha: null,
                url: mr.url,
                error: null,
            };
        }
        const mrIid = mr.iid;
        mr = await guard(() => adapter.getMr(path, mrIid));
        item.mr = mr;
        this.store.savePlan(plan);
        const latestMr = mr;
        mr = await guard(() => adapter.waitForMergeable(path, latestMr));
        item.mr = mr;
        this.store.savePlan(plan);
        if (mr.state !== 'opened')
            throw new Error(`MR !${mr.iid} 当前为 ${mr.state}，未执行合并`);
        if (mr.mergeStatus === 'checking') {
            throw new Error(`MR !${mr.iid} 状态计算尚未完成，请稍后重新预检；${mr.detail || 'GitLab 正在准备 MR'}`);
        }
        if (mr.mergeStatus !== 'mergeable') {
            throw new Error(`MR !${mr.iid}：${mr.detail || '当前不可合并'}`);
        }
        const merged = await guard(() => adapter.mergeMr(path, mr.iid, sourceSha, {
            deleteSourceBranch: plan.deleteSourceBranch,
            message: mergeCommitMessage(project.name, item.sourceBranch, item.targetBranch, plan.title, plan.description),
        }));
        return {
            projectId: project.id,
            name: project.name,
            ok: true,
            kind: 'mr',
            message: `已合并 MR !${merged.iid}`,
            mr: merged,
            sha: merged.mergeCommitSha,
            url: merged.url,
            error: null,
        };
    }
    /* ------------------------------------------------------------------ */
    /* MR 状态                                                             */
    /* ------------------------------------------------------------------ */
    async refreshMrs(planId) {
        await this.ready();
        const adapter = this.adapterFor();
        if (!adapter)
            throw new Error('未配置 GitLab 连接，无法查询 MR 状态');
        const plan = planId ? this.store.getPlan(planId) : this.store.latestPlan();
        if (!plan)
            throw new Error('没有可查询的计划，请先预检或创建 MR');
        const withMr = plan.items.filter((i) => i.mr);
        const refreshed = await mapLimit(withMr, Math.min(4, this.config.concurrency), async (item) => {
            const project = this.store.list.find((p) => p.id === item.projectId);
            if (!project || !item.mr)
                return { project: item.name, mr: item.mr };
            try {
                const mr = await adapter.getMr(project.gitlabPath, item.mr.iid);
                item.mr = mr;
                return { project: item.name, mr };
            }
            catch {
                return { project: item.name, mr: item.mr };
            }
        });
        this.store.savePlan(plan);
        return {
            total: withMr.length,
            updated: refreshed.filter((r) => r.mr.state !== 'unknown').length,
            conflicts: refreshed.filter((r) => r.mr.mergeStatus === 'conflict').length,
            checking: refreshed.filter((r) => r.mr.mergeStatus === 'checking').length,
            mrs: refreshed,
        };
    }
    /* ------------------------------------------------------------------ */
    /* 内部工具                                                            */
    /* ------------------------------------------------------------------ */
    adapterFor() {
        if (!this.config.gitlabBaseUrl || !this.config.gitlabToken)
            return null;
        this.adapter ??= new GitLabAdapter({ baseUrl: this.config.gitlabBaseUrl, token: this.config.gitlabToken });
        return this.adapter;
    }
    /** 有本地工作区就用本地（对象通常齐全），否则用 bare 缓存 */
    async repoDirFor(project, ensure) {
        if (project.localPath && existsSync(join(project.localPath, '.git')))
            return project.localPath;
        const cache = this.cachePath(project);
        if (existsSync(join(cache, 'HEAD')))
            return cache;
        if (!ensure)
            return null;
        await this.git.ensureBareCache(cache, project.remoteUrl);
        return cache;
    }
    /** 写路径专用：强制 bare 缓存，绝不写用户工作区 */
    async ensureWriteCache(project) {
        const cache = this.cachePath(project);
        await this.git.ensureBareCache(cache, project.remoteUrl);
        return cache;
    }
    cachePath(project) {
        return join(this.config.dataDir, 'repos', project.id);
    }
    rememberHead(projectIdValue, ref, sha) {
        // null 表示「确认该分支不存在」，与「没有记录」是两回事，所以两者都写入
        this.heads.set(projectIdValue, ref, sha);
    }
    remember(cache, key, value, max) {
        if (cache.size > max)
            cache.delete(cache.keys().next().value);
        cache.set(key, value);
    }
    /**
     * 把 GitLab 的 401/403/404 翻译成能直接照着修的一句话。
     * 最常见的坑是「项目级访问令牌」——它只以 project_<id>_bot_* 账号存在，
     * 只能看见被授权的那一个项目，其他项目一律 404。
     */
    async apiPermissionNote(adapter, project, status) {
        const path = project.gitlabPath;
        if (status === 401) {
            return {
                short: 'GitLab 令牌无效（401）',
                detail: '令牌可能已过期、被撤销或复制不完整，请重新生成后在插件配置里更新 gitlab.token',
            };
        }
        if (status === 403) {
            return {
                short: `GitLab 拒绝访问 ${path}（403）`,
                detail: '令牌 scope 不足，需要 api（读+写）；只有 read_api 无法创建 MR',
            };
        }
        const scope = await adapter.tokenScope().catch(() => null);
        if (scope?.kind === 'project' && scope.projectPath && scope.projectPath !== path) {
            return {
                short: `无 ${path} 的访问权限（404）`,
                detail: `当前令牌是 ${scope.projectPath} 的项目级令牌，只能操作该项目；跨项目建 MR 请改用个人访问令牌（scope: api）`,
            };
        }
        if (status === 404) {
            return {
                short: `无 ${path} 的访问权限（404）`,
                detail: '项目不存在或令牌无权访问。若项目路径正确，请换用有该项目权限的个人访问令牌',
            };
        }
        return { short: 'GitLab 接口调用失败', detail: `状态码 ${status ?? '未知'}` };
    }
}
/* -------------------------------------------------------------------- */
/* 小工具                                                                */
/* -------------------------------------------------------------------- */
function isPermissionError(status) {
    return status === 401 || status === 403 || status === 404;
}
function pickSha(refs, ref) {
    const name = ref.replace(/^refs\/heads\//, '');
    return refs.find((r) => r.name === name)?.sha ?? null;
}
function defaultTitle(mode, source, target) {
    if (mode === 'merge-git')
        return `Merge branch '${source}' into '${target}'`;
    return `${source} → ${target}`;
}
//# sourceMappingURL=service.js.map