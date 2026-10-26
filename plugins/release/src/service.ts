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
import {
  CHECK_IDS,
  check,
  computePlanHash,
  isValidBranchName,
  mergeCommitMessage,
  normalizeRemoteUrl,
  parseRemoteUrl,
  PLAN_TTL_MS,
  summarizePlan,
} from './domain.js';
import type { GitExecutor } from './git.js';
import { GitError } from './git.js';
import { GitLabAdapter, type TokenScope } from './gitlab.js';
import { HeadCacheStore } from './head-cache.js';
import { HttpError } from './http.js';
import { projectId, scanRoots, type ScannedProject } from './scanner.js';
import { JsonStore } from './store.js';
import type {
  ApplyResult,
  Check,
  ItemResult,
  MergePlan,
  MergeStrategy,
  MrRef,
  PlanItem,
  PlanMode,
  Project,
} from './types.js';

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

const NULL_LOGGER: Logger = { info: () => {}, warn: () => {}, debug: () => {} };

/** 空关键词查分支时只问这几条主干，避免拉回上千个 ref */
const TRUNK_REFS = [
  'refs/heads/master',
  'refs/heads/main',
  'refs/heads/develop',
  'refs/heads/dev',
  'refs/heads/pre',
  'refs/heads/prod',
];

/** 并发上限内跑完所有任务，保持结果顺序 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function short(sha: string | null): string {
  return sha ? sha.slice(0, 8) : '—';
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class ReleaseService {
  private readonly store: JsonStore;
  private readonly heads: HeadCacheStore;
  private adapter: GitLabAdapter | null = null;
  private scanned = false;
  private readonly rangeCache = new Map<string, { ahead: number; behind: number }>();
  private readonly treeCache = new Map<string, string[]>();
  private initPromise: Promise<void> | null = null;
  private initError: Error | null = null;

  constructor(
    private readonly config: ResolvedConfig,
    private readonly git: GitExecutor,
    private readonly logger: Logger = NULL_LOGGER,
  ) {
    this.store = new JsonStore(config.dataDir);
    this.heads = new HeadCacheStore(join(config.dataDir, 'head-cache.json'), (m, d) => this.logger.warn(m, d));
  }

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 首次使用时才读盘与扫描：插件加载本身不做 I/O，dsh 启动不会因为
   * 扫描一堆仓库而变慢；初始化失败也只会影响工具调用，不会拖垮整个插件树。
   */
  ready(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.bootstrap().catch((e: unknown) => {
        this.initError = e instanceof Error ? e : new Error(String(e));
      });
    }
    return this.initPromise.then(() => {
      if (this.initError) throw this.initError;
    });
  }

  private async bootstrap(): Promise<void> {
    this.store.load();
    this.heads.load();
    if (!this.store.list.length && this.config.roots.length) {
      await this.scanProjects();
    }
  }

  dispose(): void {
    this.heads.flush();
  }

  /* ------------------------------------------------------------------ */
  /* 项目                                                                */
  /* ------------------------------------------------------------------ */

  get projects(): Project[] {
    return this.store.list;
  }

  get roots(): string[] {
    return this.config.roots;
  }

  /** 扫描根目录并合并显式配置；force=false 时只在从未扫描过的情况下扫描 */
  async refreshProjects(force = true): Promise<Project[]> {
    await this.ready();
    if (!force && this.scanned) return this.store.list;
    return this.scanProjects();
  }

  private async scanProjects(): Promise<Project[]> {
    const existing = new Map(this.store.list.map((p) => [p.id, p]));
    let discovered: ScannedProject[] = [];

    if (this.config.roots.length) {
      const result = await scanRoots(this.config.roots, this.config.scanDepth, this.git);
      discovered = result.projects;
      if (result.errors.length) {
        this.logger.debug('扫描有跳过项', { count: result.errors.length, sample: result.errors.slice(0, 3) });
      }
    }

    const merged = new Map<string, Project>();
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
      if (!remote) continue;
      const parsed = parseRemoteUrl(remote);
      if (!parsed) continue;
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
    this.scanned = true;
    this.logger.info('项目清单已更新', { total: list.length, roots: this.config.roots.length });
    return list;
  }

  private hostOfBase(): string {
    try {
      return new URL(this.config.gitlabBaseUrl).host;
    } catch {
      return 'localhost';
    }
  }

  private selectProjects(ids?: string[]): Project[] {
    const enabled = this.store.list.filter((p) => p.enabled);
    if (!ids?.length) return enabled;
    const wanted = new Set(ids);
    return enabled.filter((p) => wanted.has(p.id) || wanted.has(p.name) || wanted.has(p.gitlabPath));
  }

  /* ------------------------------------------------------------------ */
  /* 分支                                                                */
  /* ------------------------------------------------------------------ */

  /** 跨仓库按关键词查分支。关键词为空时返回各仓库的主干分支，便于选目标分支。 */
  async findBranches(keyword: string, projectIds?: string[], limit = 200): Promise<BranchMatch[]> {
    await this.ready();
    const projects = this.selectProjects(projectIds);
    const trimmed = keyword.trim();
    const safe = trimmed.replace(/[*?[\]]/g, '');
    // 空关键词只问主干分支：全量 ls-remote 在大仓库上会有上千行
    const pattern = safe ? `refs/heads/*${safe}*` : TRUNK_REFS;

    const perProject = await mapLimit(projects, this.config.concurrency, async (project) => {
      try {
        const dir = await this.repoDirFor(project, false);
        const refs = await this.git.lsRemoteHeads(dir ?? undefined, dir ? 'origin' : project.remoteUrl, pattern);
        const lower = safe.toLowerCase();
        return refs
          .filter((r) => (safe ? r.name.toLowerCase().includes(lower) : isTrunk(r.name)))
          .map<BranchMatch>((r) => ({
            projectId: project.id,
            project: project.name,
            namespace: project.namespace,
            branch: r.name,
            sha: r.sha,
            gitlabPath: project.gitlabPath,
          }));
      } catch (e) {
        this.logger.debug('查询分支失败', { project: project.name, error: errorMessage(e) });
        return [];
      }
    });

    return perProject.flat().slice(0, limit);
  }

  /* ------------------------------------------------------------------ */
  /* 预检                                                                */
  /* ------------------------------------------------------------------ */

  async planMerge(input: PlanInput): Promise<MergePlan> {
    await this.ready();
    const started = Date.now();
    const mode = input.mode;
    const source = input.sourceBranch.trim();
    if (!isValidBranchName(source)) throw new Error(`源分支名不合法：${source}`);
    const globalTarget = (input.targetBranch ?? this.config.defaultTarget).trim();
    if (globalTarget && !isValidBranchName(globalTarget)) throw new Error(`目标分支名不合法：${globalTarget}`);

    const projects = this.selectProjects(input.projectIds);
    if (!projects.length) {
      throw new Error(
        this.config.roots.length || this.config.projects.length
          ? '没有匹配的启用项目，请先检查 roots 配置或项目是否被停用'
          : '还没有任何仓库：请在插件配置里填 roots（本地仓库根目录）或 projects',
      );
    }

    const items = await mapLimit(projects, this.config.concurrency, (project, index) =>
      this.checkProject(project, mode, source, globalTarget, index, Boolean(input.refresh), input.signal),
    );

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
    const plan: MergePlan = {
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

  private async checkProject(
    project: Project,
    mode: PlanMode,
    sourceBranch: string,
    targetBranchInput: string,
    order: number,
    refresh: boolean,
    signal?: AbortSignal,
  ): Promise<PlanItem> {
    const targetBranch = (project.defaultTarget ?? targetBranchInput).trim();
    const checks: Check[] = [];
    const warnings: string[] = [];
    let sourceSha: string | null = null;
    let targetSha: string | null = null;
    let ahead: number | null = null;
    let behind: number | null = null;
    let conflictFiles: string[] | null = null;
    let mr: MrRef | null = null;
    let mrApiStatus: number | null = null;
    let mrApiError = false;
    let cachedAgeMs: number | null = null;
    let sourceMissing = false;
    let targetMissing = false;
    let sourceError: string | null = null;
    let targetError: string | null = null;

    const adapter = this.adapterFor();
    const needsApi = mode !== 'merge-git';
    // 创建 MR 不需要本地对象；只有要算冲突/合并才需要把仓库落到本地
    const dir = await this.repoDirFor(project, mode !== 'create-mr').catch((e: unknown) => {
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

    // 2) 未命中：一次 ls-remote 拿两个分支的最新 SHA（一次网络往返，且能判定分支是否存在）
    if (!confirmed) {
      let refs: Array<{ sha: string; name: string }> | null = null;
      try {
        refs = await this.git.lsRemoteHeads(dir ?? undefined, dir ? 'origin' : project.remoteUrl, [sourceRef, targetRef]);
      } catch (e) {
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
      const missing: string[] = [];
      if (sourceSha && !(await this.git.hasCommit(dir, sourceSha))) missing.push(sourceBranch);
      if (targetSha && !(await this.git.hasCommit(dir, targetSha))) missing.push(targetBranch);
      if (missing.length) {
        try {
          await this.git.fetchBranches(dir, missing);
        } catch (e) {
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
        if (branch) sourceSha = branch.sha;
        else sourceMissing = true;
      } catch (e) {
        sourceError = errorMessage(e);
      }
    }
    if (!targetSha && !targetMissing && !targetError && adapter) {
      try {
        const branch = await adapter.getBranch(project.gitlabPath, targetBranch);
        if (branch) targetSha = branch.sha;
        else targetMissing = true;
      } catch (e) {
        targetError = errorMessage(e);
      }
    }

    if (dir && sourceSha && targetSha) {
      const rangeKey = `${targetSha}..${sourceSha}`;
      const cachedRange = this.rangeCache.get(rangeKey);
      if (cachedRange) {
        ahead = cachedRange.ahead;
        behind = cachedRange.behind;
      } else {
        try {
          const both = await this.git.countBoth(dir, targetSha, sourceSha);
          ahead = both.ahead;
          behind = both.behind;
          this.remember(this.rangeCache, rangeKey, both, 500);
        } catch {
          ahead = null;
          behind = null;
        }
      }

      if (ahead === 0) {
        // 无需合并时不必做冲突预演
        conflictFiles = [];
      } else if (ahead !== null && ahead > 0 && mode !== 'create-mr') {
        const cachedTree = this.treeCache.get(rangeKey);
        if (cachedTree) {
          conflictFiles = cachedTree;
        } else {
          try {
            const tree = await this.git.mergeTree(dir, targetSha, sourceSha);
            conflictFiles = tree.clean ? [] : tree.conflicts;
            this.remember(this.treeCache, rangeKey, conflictFiles, 200);
          } catch {
            conflictFiles = null;
          }
        }
      }
    }

    if (ahead === null && mode === 'create-mr' && sourceSha && targetSha) {
      warnings.push('本地缺少这两个分支的对象，待合并提交数未计算（不影响创建 MR）');
    }

    // Git 直接合并路径不经过 MR，跳过 GitLab API 查询；
    // 源分支不存在时也不可能有 MR，省掉一次必然无用的往返
    if (adapter && needsApi && !sourceMissing) {
      try {
        const mrs = await adapter.listOpenMrs(project.gitlabPath, sourceBranch, targetBranch);
        mr = mrs[0] ?? null;
      } catch (e) {
        // 这里静默吞异常会让预检一片绿灯、执行时才 404，所以记下状态码变成阻塞项
        mr = null;
        mrApiError = true;
        mrApiStatus = e instanceof HttpError ? e.status : null;
      }
    }

    const permissionNote =
      mrApiError && adapter && isPermissionError(mrApiStatus)
        ? await this.apiPermissionNote(adapter, project, mrApiStatus)
        : null;

    /* ---- 检查清单 ---- */
    if (sourceMissing) checks.push(check(CHECK_IDS.source, '源分支', 'danger', '源分支不存在'));
    else if (sourceError) checks.push(check(CHECK_IDS.source, '源分支', 'unknown', sourceError));
    else checks.push(check(CHECK_IDS.source, '源分支', 'ok', `已确认 · ${short(sourceSha)}`));

    if (targetMissing) checks.push(check(CHECK_IDS.target, '目标分支', 'danger', '目标分支不存在'));
    else if (targetError) checks.push(check(CHECK_IDS.target, '目标分支', 'unknown', targetError));
    else checks.push(check(CHECK_IDS.target, '目标分支', 'ok', `已确认 · ${short(targetSha)}`));

    if (ahead === null) checks.push(check(CHECK_IDS.ahead, '待合并提交', 'unknown', '无法计算差异'));
    else if (ahead === 0) checks.push(check(CHECK_IDS.ahead, '待合并提交', 'warn', '无需合并：源提交已包含在目标分支'));
    else checks.push(check(CHECK_IDS.ahead, '待合并提交', 'ok', `${ahead} 个提交`));

    if (mode === 'create-mr') {
      checks.push(check(CHECK_IDS.conflict, '合并冲突', 'skipped', '创建 MR 阶段不做冲突预演'));
    } else if (conflictFiles === null) {
      checks.push(check(CHECK_IDS.conflict, '合并冲突', 'unknown', '当前环境不支持冲突预演'));
    } else if (conflictFiles.length) {
      checks.push(
        check(
          CHECK_IDS.conflict,
          '合并冲突',
          'danger',
          `冲突文件 ${conflictFiles.length} 个：${conflictFiles.slice(0, 3).join('、')}`,
        ),
      );
    } else {
      checks.push(check(CHECK_IDS.conflict, '合并冲突', 'ok', '无冲突'));
    }

    if (!needsApi) checks.push(check(CHECK_IDS.mr, '已有 MR', 'skipped', 'Git 直接合并不经过 MR'));
    else if (sourceMissing) checks.push(check(CHECK_IDS.mr, '已有 MR', 'skipped', '源分支不存在，跳过查询'));
    else if (mr) checks.push(check(CHECK_IDS.mr, '已有 MR', 'ok', `!${mr.iid} · ${mr.state} · 可复用`));
    else if (mrApiError) checks.push(check(CHECK_IDS.mr, '已有 MR', 'danger', '查询失败：GitLab 接口未通过'));
    else checks.push(check(CHECK_IDS.mr, '已有 MR', 'skipped', '无，将新建'));

    if (needsApi && !adapter) {
      checks.push(check(CHECK_IDS.permission, '执行权限', 'danger', '未配置 GitLab 连接'));
    } else if (permissionNote) {
      checks.push(
        check(
          CHECK_IDS.permission,
          mode === 'merge-mr' ? '执行权限' : '创建权限',
          'danger',
          `${permissionNote.short}：${permissionNote.detail}`,
        ),
      );
    } else if (mode === 'merge-mr') {
      if (mr && mr.mergeStatus !== 'mergeable' && mr.mergeStatus !== 'checking') {
        checks.push(check(CHECK_IDS.permission, '执行权限', 'danger', mr.detail || 'MR 当前不可合并'));
      } else {
        checks.push(check(CHECK_IDS.permission, '执行权限', 'ok', '已具备 MR 合并条件'));
      }
    } else if (mode === 'merge-git') {
      checks.push(check(CHECK_IDS.permission, '推送权限', 'warn', '执行时校验，非快进会被拒绝'));
    } else {
      checks.push(check(CHECK_IDS.permission, '创建权限', 'ok', '已配置 GitLab 连接'));
    }

    if (sourceSha) checks.push(check(CHECK_IDS.sha, '源提交锁定', 'ok', short(sourceSha)));
    if (targetSha && targetSha !== sourceSha) warnings.push(`目标分支当前为 ${short(targetSha)}`);

    /* ---- 阻塞判断 ---- */
    const blockers: string[] = [];
    if (sourceMissing) blockers.push('源分支不存在');
    if (targetMissing) blockers.push('目标分支不存在');
    if (sourceError && !sourceSha) blockers.push(`源分支无法确认：${sourceError}`);
    if (targetError && !targetSha) blockers.push(`目标分支无法确认：${targetError}`);
    // 创建 MR 不依赖本地差异，算不出来也不算阻塞；合并类操作必须知道差异
    if (ahead === null && mode !== 'create-mr') blockers.push('待合并提交数未知');
    if (mode !== 'create-mr' && conflictFiles && conflictFiles.length) {
      blockers.push(`合并冲突：${conflictFiles.slice(0, 3).join('、')}`);
    }
    if (needsApi && !adapter) blockers.push('未配置 GitLab 连接');
    if (needsApi && permissionNote) blockers.push(permissionNote.short);
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

  async applyPlan(input: ApplyInput): Promise<ApplyResult> {
    await this.ready();
    const started = Date.now();
    const plan = this.store.getPlan(input.planId);
    if (!plan) throw new Error(`找不到计划 ${input.planId}，请重新预检`);
    if (plan.hash !== input.planHash) throw new Error('计划摘要不匹配：预检结果已变化，请重新预检');
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
    const results: ItemResult[] = [];

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
      } catch (e) {
        const message = errorMessage(e);
        this.logger.warn('执行失败', { project: item.name, error: message });
        results.push({
          projectId: item.projectId,
          name: item.name,
          ok: false,
          kind: 'failed',
          message,
          mr: null,
          sha: null,
          url: null,
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
    return {
      planId: plan.id,
      mode: plan.mode,
      results,
      succeeded,
      failed: results.filter((r) => r.kind === 'failed').length,
      skipped: skipped.length,
      durationMs: Date.now() - started,
    };
  }

  private async executeItem(plan: MergePlan, item: PlanItem, signal?: AbortSignal): Promise<ItemResult> {
    const project = this.store.list.find((p) => p.id === item.projectId);
    if (!project) throw new Error(`项目已从清单移除：${item.name}`);

    // 写操作永远用 bare 缓存 + 临时工作树，不碰用户的工作区
    const cache = await this.ensureWriteCache(project);
    await this.git.fetch(cache, signal);

    const sourceSha = await this.git.revParse(cache, `refs/remotes/origin/${item.sourceBranch}`);
    const targetSha = await this.git.revParse(cache, `refs/remotes/origin/${item.targetBranch}`);
    if (!sourceSha) throw new Error('源分支已不存在，请重新预检');
    if (!targetSha) throw new Error('目标分支已不存在，请重新预检');
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
      if (!tree.clean) throw new Error(`合并冲突：${tree.conflicts.slice(0, 3).join('、')}`);
    }

    if (plan.mode === 'merge-git') {
      return this.mergeWithGit(plan, project, item, cache, sourceSha, targetSha);
    }
    return this.writeWithMr(plan, project, item, sourceSha);
  }

  private async mergeWithGit(
    plan: MergePlan,
    project: Project,
    item: PlanItem,
    cache: string,
    sourceSha: string,
    targetSha: string,
  ): Promise<ItemResult> {
    const worktree = join(this.config.dataDir, 'worktrees', `${plan.id}-${item.order}`);
    const branch = `pa-merge/${plan.id}-${item.order}`;
    await this.git.addWorktree(cache, worktree, targetSha, branch);
    try {
      const info = await this.git.merge(
        worktree,
        sourceSha,
        plan.mergeStrategy,
        mergeCommitMessage(project.name, item.sourceBranch, item.targetBranch, plan.title, plan.description),
      );
      await this.git.push(worktree, `HEAD:refs/heads/${item.targetBranch}`);

      // 推送后核验：远端目标分支必须真的指向新提交
      const heads = await this.git.lsRemoteHeads(worktree, 'origin', `refs/heads/${item.targetBranch}`);
      const remoteSha = heads[0]?.sha ?? null;
      if (remoteSha && remoteSha !== info.sha) {
        throw new Error(`推送后远端仍为 ${short(remoteSha)}，预期 ${short(info.sha)}`);
      }

      if (plan.deleteSourceBranch && item.sourceBranch !== item.targetBranch) {
        await this.git.deleteRemoteBranch(cache, item.sourceBranch).catch((e: unknown) => {
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
    } finally {
      await this.git.removeWorktree(cache, worktree).catch(() => undefined);
    }
  }

  private async writeWithMr(plan: MergePlan, project: Project, item: PlanItem, sourceSha: string): Promise<ItemResult> {
    const adapter = this.adapterFor();
    if (!adapter) throw new Error('未配置 GitLab 连接，无法创建或合并 MR');
    const path = project.gitlabPath;

    const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        const status = e instanceof HttpError ? e.status : null;
        if (!isPermissionError(status)) throw e;
        const note = await this.apiPermissionNote(adapter, project, status);
        throw new Error(`${note.short}：${note.detail}`);
      }
    };

    let mr = (await guard(() => adapter.listOpenMrs(path, item.sourceBranch, item.targetBranch)))[0] ?? null;

    if (!mr) {
      // 实测部分 GitLab 实例不校验源分支是否存在（不存在的分支也能 201 建出 MR），
      // 预检到执行之间若分支被删就会产出空 MR，所以自己先确认一次。
      const source = await guard(() => adapter.getBranch(path, item.sourceBranch));
      if (!source) throw new Error(`源分支 ${item.sourceBranch} 已不存在，未创建 MR`);
      mr = await guard(() =>
        adapter.createMr(path, {
          sourceBranch: item.sourceBranch,
          targetBranch: item.targetBranch,
          title: plan.title || `${item.sourceBranch} → ${item.targetBranch}`,
          description: plan.description ?? undefined,
        }),
      );
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
    } else if (plan.mode === 'create-mr') {
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

    if (mr.mergeStatus !== 'mergeable' && mr.mergeStatus !== 'checking') {
      throw new Error(mr.detail || `MR !${mr.iid} 当前不可合并`);
    }

    const merged = await guard(() =>
      adapter.mergeMr(path, mr.iid, sourceSha, {
        deleteSourceBranch: plan.deleteSourceBranch,
        message: mergeCommitMessage(project.name, item.sourceBranch, item.targetBranch, plan.title, plan.description),
      }),
    );

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

  async refreshMrs(planId?: string): Promise<{
    total: number;
    updated: number;
    conflicts: number;
    checking: number;
    mrs: Array<{ project: string; mr: MrRef }>;
  }> {
    await this.ready();
    const adapter = this.adapterFor();
    if (!adapter) throw new Error('未配置 GitLab 连接，无法查询 MR 状态');
    const plan = planId ? this.store.getPlan(planId) : this.store.latestPlan();
    if (!plan) throw new Error('没有可查询的计划，请先预检或创建 MR');

    const withMr = plan.items.filter((i) => i.mr);
    const refreshed = await mapLimit(withMr, Math.min(4, this.config.concurrency), async (item) => {
      const project = this.store.list.find((p) => p.id === item.projectId);
      if (!project || !item.mr) return { project: item.name, mr: item.mr as MrRef };
      try {
        const mr = await adapter.getMr(project.gitlabPath, item.mr.iid);
        item.mr = mr;
        return { project: item.name, mr };
      } catch {
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

  private adapterFor(): GitLabAdapter | null {
    if (!this.config.gitlabBaseUrl || !this.config.gitlabToken) return null;
    this.adapter ??= new GitLabAdapter({ baseUrl: this.config.gitlabBaseUrl, token: this.config.gitlabToken });
    return this.adapter;
  }

  /** 有本地工作区就用本地（对象通常齐全），否则用 bare 缓存 */
  private async repoDirFor(project: Project, ensure: boolean): Promise<string | null> {
    if (project.localPath && existsSync(join(project.localPath, '.git'))) return project.localPath;
    const cache = this.cachePath(project);
    if (existsSync(join(cache, 'HEAD'))) return cache;
    if (!ensure) return null;
    await this.git.ensureBareCache(cache, project.remoteUrl);
    return cache;
  }

  /** 写路径专用：强制 bare 缓存，绝不写用户工作区 */
  private async ensureWriteCache(project: Project): Promise<string> {
    const cache = this.cachePath(project);
    await this.git.ensureBareCache(cache, project.remoteUrl);
    return cache;
  }

  private cachePath(project: Project): string {
    return join(this.config.dataDir, 'repos', project.id);
  }

  private rememberHead(projectIdValue: string, ref: string, sha: string | null): void {
    // null 表示「确认该分支不存在」，与「没有记录」是两回事，所以两者都写入
    this.heads.set(projectIdValue, ref, sha);
  }

  private remember<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
    if (cache.size > max) cache.delete(cache.keys().next().value as string);
    cache.set(key, value);
  }

  /**
   * 把 GitLab 的 401/403/404 翻译成能直接照着修的一句话。
   * 最常见的坑是「项目级访问令牌」——它只以 project_<id>_bot_* 账号存在，
   * 只能看见被授权的那一个项目，其他项目一律 404。
   */
  private async apiPermissionNote(
    adapter: GitLabAdapter,
    project: Project,
    status: number | null,
  ): Promise<{ short: string; detail: string }> {
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

    const scope = await adapter.tokenScope().catch((): TokenScope | null => null);
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

function isPermissionError(status: number | null): boolean {
  return status === 401 || status === 403 || status === 404;
}

function pickSha(refs: Array<{ sha: string; name: string }>, ref: string): string | null {
  const name = ref.replace(/^refs\/heads\//, '');
  return refs.find((r) => r.name === name)?.sha ?? null;
}

function isTrunk(name: string): boolean {
  return /^(master|main|develop|dev|pre|prod|release)$/i.test(name);
}

function defaultTitle(mode: PlanMode, source: string, target: string): string {
  if (mode === 'merge-git') return `Merge branch '${source}' into '${target}'`;
  return `${source} → ${target}`;
}
