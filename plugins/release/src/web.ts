/**
 * 发版控制台的 Web 入口：把同一个 ReleaseService 暴露成浏览器可直接操作的页面。
 *
 * 设计要点：
 * - 注册在 `/release-ui` 前缀下，命名路由优先于前端静态资源的鉴权兜底，
 *   所以页面本身不需要 DSH 的 token（仍限制只允许本机访问）。
 * - 全程不经过模型：页面按钮 → HTTP → ReleaseService，与工具调用共用同一套逻辑。
 * - 不硬依赖 webServer 服务：用 ctx.inject 延迟绑定，headless 环境里插件照常只注册工具。
 * - 设置接口与工具共用同一份运行时配置，保存后立刻生效，不需要重启 dsh。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type { Context } from '@deepseek-ai/cordis';
import type { ReleaseService } from './service.js';
import type { DirListing, SettingsPatch } from './settings.js';
import type { MergeStrategy } from './types.js';
import { WEB_PAGE } from './web-page.js';

/** 页面与 API 共用的路径前缀。 */
export const WEB_UI_PATH = '/release-ui';

/** 请求体上限，预检参数远小于此值。 */
const MAX_BODY_BYTES = 256 * 1024;

/* ------------------------------------------------------------------ */
/* 设置接口的契约（由宿主侧实现，见 index.ts）                          */
/* ------------------------------------------------------------------ */

/** 对外的设置视图：令牌只给「是否已设置 + 末四位」，永不回传明文。 */
export interface SettingsView {
  gitlabBaseUrl: string;
  gitlabAccount?: string;
  tokenSet: boolean;
  tokenHint: string;
  /** saved=界面保存的；env=来自 YAML 或环境变量；none=都没有 */
  tokenSource: 'saved' | 'env' | 'none';
  tokenEnv: string;
  roots: string[];
  scanDepth: number;
  defaultTarget: string;
  concurrency: number;
  headCacheTtlSec: number;
  mergeStrategy: MergeStrategy;
  deleteSourceBranch: boolean;
  dataDir: string;
  gitlabReady: boolean;
}

export interface SaveResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  settings: SettingsView;
  /** 扫描参数变化时触发的重扫结果 */
  rescan?: { total: number };
}

export interface GitLabTestResult {
  ok: boolean;
  ms: number;
  account?: string;
  version?: string;
  error?: string;
  note?: string;
}

export interface SettingsBridge {
  view(): SettingsView;
  save(patch: SettingsPatch): Promise<SaveResult>;
  test(override?: { baseUrl?: string; token?: string }): Promise<GitLabTestResult>;
  browse(path: string): DirListing;
}

export interface WebUiDeps {
  service: ReleaseService;
  settings: SettingsBridge;
}

/** 宿主 webserver 的最小结构契约（避免为类型引入额外依赖）。 */
interface WebRouteLike {
  kind: 'exact' | 'prefix';
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

interface WebServerLike {
  register(route: WebRouteLike): () => void;
}

/**
 * 把发版控制台挂到当前 profile 的 web 服务上。
 * @param ctx 插件上下文
 * @param deps 与工具共用的发版服务 + 设置桥
 */
export function registerWebUi(ctx: Context, deps: WebUiDeps): void {
  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx.get('webServer') as WebServerLike | undefined;
    if (!server) return;
    // register 返回 disposer，交给 effect 在插件卸载时自动撤销
    webCtx.effect(() =>
      server.register({
        kind: 'prefix',
        path: WEB_UI_PATH,
        handler: (req, res) => handle(req, res, deps),
      }),
    );
    console.info(`[release] 发版控制台已挂载：${WEB_UI_PATH}`);
  });
}

/* ------------------------------------------------------------------ */
/* 路由分发                                                            */
/* ------------------------------------------------------------------ */

async function handle(req: IncomingMessage, res: ServerResponse, deps: WebUiDeps): Promise<void> {
  const { service, settings } = deps;
  try {
    if (!isLoopbackHost(req.headers.host) || !isLoopbackAddress(req.socket.remoteAddress)) {
      json(res, 403, { error: '发版控制台只允许从本机访问' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname.replace(/\/+$/, '') || WEB_UI_PATH;
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`
      && req.headers.origin !== `https://${req.headers.host}`) {
      json(res, 403, { error: '不允许跨站调用发版接口' });
      return;
    }

    if (method === 'GET' && path === `${WEB_UI_PATH}/app.js`) {
      const script = readFileSync(new URL('./standalone.js', import.meta.url));
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(script);
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && (path === WEB_UI_PATH || path === `${WEB_UI_PATH}/index.html`)) {
      sendHtml(res, WEB_PAGE);
      return;
    }

    /* ---- 设置 ---- */
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/settings`) {
      json(res, 200, settings.view());
      return;
    }
    if (method === 'POST' && path === `${WEB_UI_PATH}/api/settings`) {
      const body = await readJson(req);
      json(res, 200, await settings.save(body as SettingsPatch));
      return;
    }
    if (method === 'POST' && path === `${WEB_UI_PATH}/api/settings/test`) {
      const body = await readJson(req);
      const baseUrl = text(body.gitlabBaseUrl);
      const token = text(body.gitlabToken);
      json(
        res,
        200,
        await settings.test({
          ...(typeof body.gitlabBaseUrl === 'string' ? { baseUrl } : {}),
          // 空令牌表示「用已保存的那把」，不覆盖
          ...(token ? { token } : {}),
        }),
      );
      return;
    }
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/settings/dirs`) {
      json(res, 200, settings.browse(url.searchParams.get('path') ?? ''));
      return;
    }

    /* ---- 仓库与分支 ---- */
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/projects`) {
      await listProjects(res, service, url.searchParams.get('refresh') === '1');
      return;
    }
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/branches`) {
      await searchBranches(res, service, url.searchParams.get('keyword') ?? '');
      return;
    }
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/branch-options`) {
      const ids = url.searchParams.getAll('project');
      json(res, 200, await service.branchOptions(url.searchParams.get('keyword') ?? '',
        ids.length ? ids : undefined, url.searchParams.get('refresh') === '1'));
      return;
    }
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/mrs`) {
      const planId = url.searchParams.get('planId') ?? undefined;
      json(res, 200, await service.refreshMrs(planId));
      return;
    }

    /* ---- 任务中心 ---- */
    if (method === 'GET' && path === `${WEB_UI_PATH}/api/tasks`) {
      await service.ready();
      const tasks = service.tasks;
      json(res, 200, {
        total: tasks.length,
        tasks,
      });
      return;
    }

    /* ---- 预检与执行 ---- */
    if (method === 'POST' && path === `${WEB_UI_PATH}/api/check`) {
      await runCheck(req, res, service);
      return;
    }
    if (method === 'POST' && path === `${WEB_UI_PATH}/api/apply`) {
      await runApply(req, res, service);
      return;
    }
    json(res, 404, { error: `未知接口：${method} ${path}` });
  } catch (error) {
    json(res, 500, { error: errorMessage(error) });
  }
}

async function listProjects(res: ServerResponse, service: ReleaseService, refresh: boolean): Promise<void> {
  await service.ready();
  const projects = refresh ? await service.refreshProjects(true) : service.projects;
  json(res, 200, {
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
  });
}

async function searchBranches(res: ServerResponse, service: ReleaseService, keyword: string): Promise<void> {
  const matches = await service.findBranches(keyword.trim());
  json(res, 200, {
    total: matches.length,
    matches: matches.map((m) => ({
      projectId: m.projectId,
      project: m.project,
      branch: m.branch,
      sha: m.sha ?? null,
    })),
  });
}

async function runCheck(req: IncomingMessage, res: ServerResponse, service: ReleaseService): Promise<void> {
  const body = await readJson(req);
  const mode = body.mode;
  if (mode !== 'create-mr' && mode !== 'merge-mr' && mode !== 'merge-git') {
    throw new Error('mode 必须是 create-mr、merge-mr 或 merge-git');
  }
  const sourceBranch = text(body.sourceBranch);
  if (!sourceBranch) throw new Error('sourceBranch 必填');
  if (Array.isArray(body.projects) && body.projects.length === 0) throw new Error('请至少选择一个仓库');
  const plan = await service.planMerge({
    mode,
    sourceBranch,
    targetBranch: text(body.targetBranch) || undefined,
    projectIds: stringArray(body.projects),
    title: text(body.title) || undefined,
    description: text(body.description) || undefined,
    refresh: body.refresh !== false,
  });
  json(res, 200, plan);
}

async function runApply(req: IncomingMessage, res: ServerResponse, service: ReleaseService): Promise<void> {
  const body = await readJson(req);
  const planId = text(body.planId);
  const planHash = text(body.planHash);
  if (!planId || !planHash) throw new Error('planId 与 planHash 必填（先预检）');
  const result = await service.applyPlan({
    planId,
    planHash,
    title: text(body.title) || undefined,
    description: text(body.description) || undefined,
  });
  json(res, 200, result);
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

/** Host 头只允许回环地址，防止 DNS rebinding 把本地接口暴露给外部页面。 */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').trim().toLowerCase();
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1';
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length ? items : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('请求体必须是 JSON 对象');
  }
  return value as Record<string, unknown>;
}

function sendHtml(res: ServerResponse, html: string): void {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(body);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  });
  res.end(body);
}
