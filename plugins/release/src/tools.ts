/**
 * 模型可见的五个工具。
 *
 * 工作流刻意拆成两步：
 *   1. release_check 只读远端，产出一份带 planId + planHash 的计划；
 *   2. release_apply 必须回填这两个值才会写远端。
 * 这样「先给用户看结果、确认后再执行」是结构上保证的，而不是靠模型自觉。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { ReleaseService } from './service.js';
import type { MergePlan, PlanMode } from './types.js';

const MODE_HINT: Record<PlanMode, string> = {
  'create-mr': '只创建 MR，不动目标分支（合并留给 GitLab 网页）',
  'merge-mr': '在 GitLab 上合并 MR',
  'merge-git': '本地合并后直接推送目标分支',
};

/* ------------------------------------------------------------------ */
/* release_projects                                                    */
/* ------------------------------------------------------------------ */

interface ProjectsArgs {
  refresh?: boolean;
}

interface ProjectsValue {
  total: number;
  enabled: number;
  roots: string[];
  projects: Array<{
    id: string;
    name: string;
    namespace: string;
    gitlabPath: string;
    localPath: string | null;
    defaultTarget: string | null;
    enabled: boolean;
  }>;
}

/* ------------------------------------------------------------------ */
/* release_branches                                                    */
/* ------------------------------------------------------------------ */

interface BranchesArgs {
  keyword?: string;
  projects?: string[];
}

interface BranchesValue {
  total: number;
  matches: Array<{ project: string; projectId: string; branch: string; sha: string }>;
}

/* ------------------------------------------------------------------ */
/* release_check                                                       */
/* ------------------------------------------------------------------ */

interface CheckArgs {
  mode: PlanMode;
  sourceBranch: string;
  targetBranch?: string;
  projects?: string[];
  title?: string;
  description?: string;
  refresh?: boolean;
}

interface CheckValue {
  planId: string;
  planHash: string;
  mode: PlanMode;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  summary: { total: number; executable: number; blocked: number; noop: number; unknown: number };
  checkDurationMs: number;
  expiresAt: string;
  items: Array<{
    project: string;
    projectId: string;
    target: string;
    executable: boolean;
    noop: boolean;
    ahead: number | null;
    behind: number | null;
    mr: number | null;
    blockers: string[];
    warnings: string[];
    checks: Array<{ label: string; status: string; detail?: string }>;
  }>;
}

/* ------------------------------------------------------------------ */
/* release_apply                                                       */
/* ------------------------------------------------------------------ */

interface ApplyArgs {
  planId: string;
  planHash: string;
  title?: string;
  description?: string;
}

interface ApplyValue {
  planId: string;
  mode: PlanMode;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: Array<{
    project: string;
    ok: boolean;
    kind: string;
    message: string;
    mr: number | null;
    url: string | null;
    sha: string | null;
    error: string | null;
  }>;
}

/* ------------------------------------------------------------------ */
/* release_mrs                                                         */
/* ------------------------------------------------------------------ */

interface MrsArgs {
  planId?: string;
}

interface MrsValue {
  total: number;
  conflicts: number;
  checking: number;
  mrs: Array<{ project: string; iid: number; state: string; mergeStatus: string; detail?: string; url: string }>;
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function summarizePlanText(value: CheckValue): string {
  const lines: string[] = [];
  lines.push(
    `预检完成：${value.mode} · ${value.sourceBranch} → ${value.targetBranch || '(各项目默认)'} · 用时 ${value.checkDurationMs}ms`,
  );
  lines.push(
    `共 ${value.summary.total} 个：可执行 ${value.summary.executable}，阻塞 ${value.summary.blocked}，无需合并 ${value.summary.noop}，未知 ${value.summary.unknown}`,
  );
  lines.push('');
  for (const item of value.items) {
    const state = item.noop ? '无需合并' : item.executable ? '可执行' : '阻塞';
    const ahead = item.ahead === null ? '?' : String(item.ahead);
    const mr = item.mr ? ` · MR !${item.mr}` : '';
    lines.push(`- ${item.project} [${state}] 待合并 ${ahead} 个提交${mr}`);
    if (item.blockers.length) lines.push(`    阻塞：${item.blockers.join('；')}`);
    if (item.warnings.length) lines.push(`    提示：${item.warnings.join('；')}`);
  }
  if (value.summary.executable > 0) {
    lines.push('');
    lines.push(`确认后调用 release_apply，planId=${value.planId}，planHash=${value.planHash}（10 分钟内有效）`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 注册                                                                */
/* ------------------------------------------------------------------ */

export function registerTools(ctx: Context, service: ReleaseService): void {
  ctx.tools.register(
    defineTool<ProjectsArgs, ProjectsValue>({
      name: 'release_projects',
      description:
        '列出发版插件管理的 Git 仓库（本地扫描 + 配置）。'
        + '每个仓库带 id、GitLab 路径、默认目标分支与启用状态。'
        + '批量发版前先用它确认要操作哪些仓库；传 refresh=true 会重新扫描本地目录。',
      parameters: {
        refresh: { type: 'boolean', description: '重新扫描配置里的本地根目录，发现新增或已删除的仓库' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            total: { type: 'number', required: true },
            enabled: { type: 'number', required: true },
            roots: { type: 'array', items: { type: 'string' }, required: true },
            projects: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true },
          },
        },
        render: (_args, value) => {
          const text = value.projects.length
            ? [
                `共 ${value.total} 个仓库（启用 ${value.enabled} 个）`,
                `扫描根目录：${value.roots.join('、') || '(未配置，仅用 config 里的项目)'}`,
                '',
                ...value.projects.map(
                  (p) =>
                    `- ${p.name}（${p.gitlabPath}）${p.enabled ? '' : ' [已停用]'}`
                    + `${p.defaultTarget ? ` 默认目标 ${p.defaultTarget}` : ''}`
                    + `${p.localPath ? ` · ${p.localPath}` : ' · 无本地副本'}`,
                ),
              ].join('\n')
            : '还没有任何仓库。请在插件配置里填 roots（本地仓库根目录）或 projects（显式列表）。';
          return [{ type: 'text', text }];
        },
      },
      execute(args) {
        return (async () => {
          await service.ready();
          const projects = args.refresh ? await service.refreshProjects(true) : service.projects;
          return {
            total: projects.length,
            enabled: projects.filter((p) => p.enabled).length,
            roots: service.roots,
            projects: projects.map((p) => ({
              id: p.id,
              name: p.name,
              namespace: p.namespace,
              gitlabPath: p.gitlabPath,
              localPath: p.localPath,
              defaultTarget: p.defaultTarget,
              enabled: p.enabled,
            })),
          };
        })();
      },
      presentCall: (args) => ({
        card: 'generic',
        title: args.refresh ? '重新扫描仓库' : '列出发版仓库',
        kind: 'search',
      }),
    }),
  );

  ctx.tools.register(
    defineTool<BranchesArgs, BranchesValue>({
      name: 'release_branches',
      description:
        '跨所有仓库按关键词搜索远端分支，返回「哪个仓库有这条分支」以及对应提交。'
        + '用于确认发布分支/特性分支是否真实存在，避免把不存在或拼错的分支名带进预检。'
        + '关键词支持模糊匹配；留空列出候选，主干分支（master/main/develop 等）优先。与页面共用分支缓存。',
      parameters: {
        keyword: { type: 'string', description: '分支名关键词，支持片段、多个关键词与不连续字符匹配，例如 PROJ-123' },
        projects: { type: 'array', items: { type: 'string' }, description: '只在这些仓库里找（id、名称或 GitLab 路径）' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            total: { type: 'number', required: true },
            matches: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true },
          },
        },
        render: (_args, value) => {
          if (!value.matches.length) return [{ type: 'text', text: '没有匹配的分支。' }];
          const byBranch = new Map<string, string[]>();
          for (const m of value.matches) {
            const list = byBranch.get(m.branch) ?? [];
            list.push(m.project);
            byBranch.set(m.branch, list);
          }
          const lines = [...byBranch.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([branch, projects]) => `- ${branch} → ${projects.join('、')}（${projects.length} 个仓库）`);
          return [{ type: 'text', text: [`命中 ${value.total} 条：`, ...lines].join('\n') }];
        },
      },
      execute(args) {
        return (async () => {
          const matches = await service.findBranches(args.keyword ?? '', args.projects);
          return {
            total: matches.length,
            matches: matches.map((m) => ({
              project: m.project,
              projectId: m.projectId,
              branch: m.branch,
              sha: m.sha,
            })),
          };
        })();
      },
      presentCall: (args) => ({
        card: 'generic',
        title: args.keyword ? `搜索分支 ${args.keyword}` : '列出候选分支',
        kind: 'search',
        rawInput: args.keyword,
      }),
    }),
  );

  ctx.tools.register(
    defineTool<CheckArgs, CheckValue>({
      name: 'release_check',
      description:
        '批量发版的预检：对每个仓库计算「源分支比目标分支多几个提交」「合并会不会冲突」「有没有已存在的 MR」「有没有 API 权限」，'
        + '并给出每个仓库的阻塞原因。这是只读操作，不改远端。'
        + `三种模式：create-mr（${MODE_HINT['create-mr']}）、merge-mr（${MODE_HINT['merge-mr']}）、merge-git（${MODE_HINT['merge-git']}）。`
        + '返回的 planId 与 planHash 是执行阶段的凭据，必须先让用户看过结果再调用 release_apply。',
      parameters: {
        mode: {
          type: 'string',
          required: true,
          enum: ['create-mr', 'merge-mr', 'merge-git'],
          description: 'create-mr 只建 MR；merge-mr 在 GitLab 合并；merge-git 本地合并后推送',
        },
        sourceBranch: { type: 'string', required: true, description: '源分支名，例如 release/20261022' },
        targetBranch: { type: 'string', description: '目标分支名，默认取配置里的 defaultTarget（通常是 master）' },
        projects: { type: 'array', items: { type: 'string' }, description: '只检查这些仓库（id、名称或 GitLab 路径），留空=全部启用仓库' },
        title: { type: 'string', description: 'MR 标题 / 合并提交信息。留空则按分支名自动生成' },
        description: { type: 'string', description: 'MR 说明 / 合并提交正文' },
        refresh: { type: 'boolean', description: '默认 true，每次核对远端最新提交；显式 false 才复用分支 SHA 缓存' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            planId: { type: 'string', required: true },
            planHash: { type: 'string', required: true },
            mode: { type: 'string', required: true },
            sourceBranch: { type: 'string', required: true },
            targetBranch: { type: 'string', required: true },
            title: { type: 'string', required: true },
            checkDurationMs: { type: 'number', required: true },
            expiresAt: { type: 'string', required: true },
            summary: { type: 'object', additionalProperties: true, required: true },
            items: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: summarizePlanText(value) }],
      },
      execute(args, exec) {
        return (async () => {
          const plan = await service.planMerge({
            mode: args.mode,
            sourceBranch: args.sourceBranch,
            targetBranch: args.targetBranch,
            projectIds: args.projects,
            title: args.title,
            description: args.description,
            refresh: args.refresh,
            signal: exec.signal,
          });
          return toCheckValue(plan);
        })();
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `预检 ${args.sourceBranch} → ${args.targetBranch ?? '默认目标'}`,
        kind: 'search',
        rawInput: args.sourceBranch,
      }),
    }),
  );

  ctx.tools.register(
    defineTool<ApplyArgs, ApplyValue>({
      name: 'release_apply',
      description:
        '执行 release_check 产出的计划：按计划里的模式创建 MR、合并 MR 或直接推送。'
        + '必须原样传入 release_check 返回的 planId 与 planHash；计划 10 分钟后过期，过期或摘要不符会拒绝执行。'
        + '执行前会重新核对远端分支 SHA，若分支已变动会要求重新预检，不会用旧快照写远端。',
      parameters: {
        planId: { type: 'string', required: true, description: 'release_check 返回的 planId' },
        planHash: { type: 'string', required: true, description: 'release_check 返回的 planHash' },
        title: { type: 'string', description: '覆盖预检时的标题（用户确认前改过文案才需要传）' },
        description: { type: 'string', description: '覆盖预检时的说明' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            planId: { type: 'string', required: true },
            mode: { type: 'string', required: true },
            succeeded: { type: 'number', required: true },
            failed: { type: 'number', required: true },
            skipped: { type: 'number', required: true },
            durationMs: { type: 'number', required: true },
            results: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true },
          },
        },
        render: (_args, value) => {
          const lines = [
            `执行完成：成功 ${value.succeeded}，失败 ${value.failed}，跳过 ${value.skipped}，用时 ${value.durationMs}ms`,
            '',
          ];
          for (const r of value.results) {
            const mark = r.ok ? '✓' : '✗';
            lines.push(`${mark} ${r.project}：${r.message}${r.url ? ` · ${r.url}` : ''}`);
          }
          return [{ type: 'text', text: lines.join('\n') }];
        },
      },
      execute(args, exec) {
        return (async () => {
          const result = await service.applyPlan({
            planId: args.planId,
            planHash: args.planHash,
            title: args.title,
            description: args.description,
            signal: exec.signal,
          });
          return {
            planId: result.planId,
            mode: result.mode,
            succeeded: result.succeeded,
            failed: result.failed,
            skipped: result.skipped,
            durationMs: result.durationMs,
            results: result.results.map((r) => ({
              project: r.name,
              ok: r.ok,
              kind: r.kind,
              message: r.message,
              mr: r.mr?.iid ?? null,
              url: r.url,
              sha: r.sha,
              error: r.error,
            })),
          };
        })();
      },
      presentCall: (args) => ({
        card: 'generic',
        title: `执行发版计划 ${args.planId}`,
        kind: 'other',
        rawInput: args.planId,
      }),
    }),
  );

  ctx.tools.register(
    defineTool<MrsArgs, MrsValue>({
      name: 'release_mrs',
      description:
        '重新查询计划里各个 MR 的合并状态（可合并 / 有冲突 / 待审批 / CI 未通过）。'
        + '创建完 MR 后 GitLab 需要几秒计算可合并性，稍等再查一次能拿到准确结果。',
      parameters: {
        planId: { type: 'string', description: '要查询的计划 id，留空则查最近一次计划' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            total: { type: 'number', required: true },
            conflicts: { type: 'number', required: true },
            checking: { type: 'number', required: true },
            mrs: { type: 'array', items: { type: 'object', additionalProperties: true }, required: true },
          },
        },
        render: (_args, value) => {
          if (!value.total) return [{ type: 'text', text: '该计划里没有 MR。' }];
          const label: Record<string, string> = {
            mergeable: '可合并',
            conflict: '有冲突',
            'not-approved': '待审批',
            'ci-failed': 'CI 未通过',
            blocked: '不可合并',
            checking: '状态计算中',
            unknown: '状态未知',
          };
          const lines = value.mrs.map(
            (m) => `- ${m.project} · MR !${m.iid} · ${label[m.mergeStatus] ?? m.mergeStatus}${m.detail ? `（${m.detail}）` : ''}\n    ${m.url}`,
          );
          return [
            {
              type: 'text',
              text: [`共 ${value.total} 个 MR，其中冲突 ${value.conflicts} 个、计算中 ${value.checking} 个：`, ...lines].join('\n'),
            },
          ];
        },
      },
      execute(args) {
        return (async () => {
          const result = await service.refreshMrs(args.planId);
          return {
            total: result.total,
            conflicts: result.conflicts,
            checking: result.checking,
            mrs: result.mrs.map(({ project, mr }) => ({
              project,
              iid: mr.iid,
              state: mr.state,
              mergeStatus: mr.mergeStatus,
              ...(mr.detail ? { detail: mr.detail } : {}),
              url: mr.url,
            })),
          };
        })();
      },
      presentCall: () => ({ card: 'generic', title: '刷新 MR 状态', kind: 'read' }),
    }),
  );
}

function toCheckValue(plan: MergePlan): CheckValue {
  return {
    planId: plan.id,
    planHash: plan.hash,
    mode: plan.mode,
    sourceBranch: plan.sourceBranch,
    targetBranch: plan.targetBranch,
    title: plan.title ?? '',
    summary: plan.summary,
    checkDurationMs: plan.checkDurationMs,
    expiresAt: plan.expiresAt,
    items: plan.items.map((i) => ({
      project: i.name,
      projectId: i.projectId,
      target: i.targetBranch,
      executable: i.executable,
      noop: i.noop,
      ahead: i.ahead,
      behind: i.behind,
      mr: i.mr?.iid ?? null,
      blockers: i.blockers,
      warnings: i.warnings,
      checks: i.checks.map((c) => ({ label: c.label, status: c.status, ...(c.detail ? { detail: c.detail } : {}) })),
    })),
  };
}
