import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReleaseService, ResolvedConfig } from '../src/service.js';
import { buildResolved, createSettingsBridge, initialSettings, toPluginSettings } from '../src/settings-bridge.js';
import {
  coerceSettings,
  listDirectories,
  maskToken,
  normalizeSettings,
  SettingsStore,
  type PluginSettings,
} from '../src/settings.js';
import { registerWebUi, type SettingsBridge } from '../src/web.js';
import { JsonStore } from '../src/store.js';
import type { TaskRecord } from '../src/types.js';

const BASE_SETTINGS: PluginSettings = {
  gitlabBaseUrl: 'https://git.example.com',
  gitlabToken: 'glpat-abcdefgh1234',
  tokenEnv: 'GITLAB_TOKEN',
  roots: ['/srv/code'],
  scanDepth: 2,
  defaultTarget: 'master',
  concurrency: 8,
  headCacheTtlSec: 300,
  mergeStrategy: 'merge',
  deleteSourceBranch: false,
};

function baseConfig(patch: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    roots: [],
    scanDepth: 3,
    gitlabBaseUrl: '',
    gitlabToken: '',
    projects: [],
    defaultTarget: 'master',
    concurrency: 8,
    headCacheTtlSec: 300,
    mergeStrategy: 'merge',
    deleteSourceBranch: false,
    dataDir: join(tmpdir(), 'release-test'),
    gitPath: 'git',
    ...patch,
  };
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

describe('normalizeSettings', () => {
  it('空补丁不改任何东西', () => {
    const r = normalizeSettings({}, BASE_SETTINGS);
    expect(r.errors).toEqual([]);
    expect(r.settings).toEqual(BASE_SETTINGS);
  });

  it('GitLab 地址必须是 http(s) 并去掉尾部斜杠', () => {
    expect(normalizeSettings({ gitlabBaseUrl: 'https://git.x.com/' }, BASE_SETTINGS).settings.gitlabBaseUrl).toBe(
      'https://git.x.com',
    );
    expect(normalizeSettings({ gitlabBaseUrl: 'git.x.com' }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ gitlabBaseUrl: 'ftp://git.x.com' }, BASE_SETTINGS).errors).toHaveLength(1);
    // 空字符串合法：表示只用本地合并
    expect(normalizeSettings({ gitlabBaseUrl: '' }, BASE_SETTINGS).errors).toEqual([]);
  });

  it('令牌可以被清空（回落到环境变量）', () => {
    const r = normalizeSettings({ gitlabToken: '' }, BASE_SETTINGS);
    expect(r.errors).toEqual([]);
    expect(r.settings.gitlabToken).toBe('');
  });

  it('目录不存在时报错且不写入', () => {
    const r = normalizeSettings({ roots: ['/definitely/not/here'] }, BASE_SETTINGS);
    expect(r.errors[0]).toContain('目录不存在');
    expect(r.settings.roots).toEqual(BASE_SETTINGS.roots);
  });

  it('目录去重并规范化成绝对路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-roots-'));
    try {
      const r = normalizeSettings({ roots: [dir, `${dir}/`, join(dir, '.')] }, BASE_SETTINGS);
      expect(r.errors).toEqual([]);
      expect(r.settings.roots).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('数值范围越界报错', () => {
    expect(normalizeSettings({ scanDepth: 0 }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ scanDepth: 9 }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ concurrency: 17 }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ headCacheTtlSec: -1 }, BASE_SETTINGS).errors).toHaveLength(1);
  });

  it('分支名与环境变量名要合法', () => {
    expect(normalizeSettings({ defaultTarget: '' }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ defaultTarget: 'bad branch' }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ tokenEnv: '1BAD' }, BASE_SETTINGS).errors).toHaveLength(1);
    expect(normalizeSettings({ tokenEnv: 'MY_TOKEN' }, BASE_SETTINGS).settings.tokenEnv).toBe('MY_TOKEN');
  });

  it('未配置 GitLab 或目录时给警告而不是报错', () => {
    const r = normalizeSettings({ gitlabBaseUrl: '', gitlabToken: '', roots: [] }, BASE_SETTINGS);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('coerceSettings', () => {
  it('坏数据不会让整份设置作废', () => {
    const r = coerceSettings({ scanDepth: 99, mergeStrategy: 'nope', roots: ['/a', '/a'] }, BASE_SETTINGS);
    expect(r.scanDepth).toBe(8);
    expect(r.mergeStrategy).toBe(BASE_SETTINGS.mergeStrategy);
    expect(r.roots).toHaveLength(1);
  });

  it('非对象输入回落到基线', () => {
    expect(coerceSettings(null, BASE_SETTINGS)).toEqual(BASE_SETTINGS);
    expect(coerceSettings('oops', BASE_SETTINGS)).toEqual(BASE_SETTINGS);
  });

  it('读盘时不做目录存在性校验', () => {
    // 用 resolve 过的期望值，避免 Windows 把 /mnt/... 解析成 C:\mnt\...
    const raw = join(tmpdir(), 'not-mounted-yet');
    const r = coerceSettings({ roots: [raw] }, BASE_SETTINGS);
    expect(r.roots).toEqual([raw]);
  });
});

describe('maskToken', () => {
  it('只暴露末四位', () => {
    expect(maskToken('glpat-abcdefgh1234')).toBe('••••1234');
    expect(maskToken('abc')).toBe('••••');
    expect(maskToken('')).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* 令牌绝不从环境变量反向落盘                                           */
/* ------------------------------------------------------------------ */

describe('initialSettings', () => {
  it('settings.json 没存令牌时，不会把环境变量/YAML 的令牌写进设置', () => {
    const base = baseConfig({ gitlabToken: 'glpat-from-env', gitlabBaseUrl: 'https://git.env.com' });
    const s = initialSettings(base, null);
    expect(s.gitlabToken).toBe('');
    // 但生效配置仍然能用上那份令牌
    expect(buildResolved(base, s).gitlabToken).toBe('glpat-from-env');
  });

  it('settings.json 存了令牌则优先', () => {
    const base = baseConfig({ gitlabToken: 'glpat-from-env' });
    const s = initialSettings(base, { gitlabToken: 'glpat-saved' });
    expect(buildResolved(base, s).gitlabToken).toBe('glpat-saved');
  });

  it('YAML 的其余字段作为缺省值', () => {
    const base = baseConfig({ roots: ['/srv/x'], scanDepth: 4, defaultTarget: 'develop' });
    const s = initialSettings(base, null);
    expect(s.roots).toEqual(['/srv/x']);
    expect(s.scanDepth).toBe(4);
    expect(s.defaultTarget).toBe('develop');
  });
});

describe('settingsView', () => {
  it('不回传明文令牌', () => {
    const base = baseConfig();
    const view = createSettingsBridge({
      service: stubService(),
      store: new SettingsStore(join(tmpdir(), 'release-view')),
      base,
      initial: { ...BASE_SETTINGS, gitlabToken: 'glpat-secret-value' },
    }).bridge.view();
    expect(JSON.stringify(view)).not.toContain('glpat-secret-value');
    expect(view.tokenSet).toBe(true);
    expect(view.tokenHint).toBe('••••alue');
  });
});

/* ------------------------------------------------------------------ */
/* 目录浏览                                                            */
/* ------------------------------------------------------------------ */

describe('listDirectories', () => {
  let root = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'release-dirs-'));
    mkdirSync(join(root, 'repo-a', '.git'), { recursive: true });
    mkdirSync(join(root, 'plain-b'));
    mkdirSync(join(root, '.hidden'));
    writeFileSync(join(root, 'file.txt'), 'x');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('只列目录，标记 git 仓库与已选状态', () => {
    const listing = listDirectories(root, [join(root, 'plain-b')]);
    const names = listing.entries.map((e) => e.name);
    expect(names).toEqual(['plain-b', 'repo-a']);
    expect(listing.entries.find((e) => e.name === 'repo-a')?.isRepo).toBe(true);
    expect(listing.entries.find((e) => e.name === 'plain-b')?.selected).toBe(true);
    expect(listing.parent).not.toBeNull();
  });

  it('跳过隐藏目录与文件', () => {
    const names = listDirectories(root, []).entries.map((e) => e.name);
    expect(names).not.toContain('.hidden');
    expect(names).not.toContain('file.txt');
  });

  it('路径不存在时给出错误而不是抛异常', () => {
    const listing = listDirectories(join(root, 'nope'), []);
    expect(listing.error).toContain('目录不存在');
    expect(listing.entries).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 保存流程（桩服务）                                                   */
/* ------------------------------------------------------------------ */

interface StubCalls {
  reconfigure: Partial<ResolvedConfig>[];
  refresh: number;
  test: Array<{ baseUrl?: string; token?: string } | undefined>;
}

function stubService(overrides: { refreshThrows?: boolean; testResult?: unknown; tasks?: TaskRecord[] } = {}): {
  service: ReleaseService;
  calls: StubCalls;
} {
  const calls: StubCalls = { reconfigure: [], refresh: 0, test: [] };
  const stub = {
    reconfigure(patch: Partial<ResolvedConfig>) {
      calls.reconfigure.push(patch);
    },
    async ready() {},
    tasks: overrides.tasks ?? [],
    async refreshProjects() {
      calls.refresh += 1;
      if (overrides.refreshThrows) throw new Error('扫描炸了');
      return [{ id: 'a' }, { id: 'b' }];
    },
    async testGitLab(override?: { baseUrl?: string; token?: string }) {
      calls.test.push(override);
      return overrides.testResult ?? { ok: true, ms: 12, account: 'tester' };
    },
  };
  return { service: stub as unknown as ReleaseService, calls };
}

describe('settings bridge save', () => {
  it('校验失败时不写盘、不改配置', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-bridge-'));
    const store = new SettingsStore(dir);
    const { service, calls } = stubService();
    const { bridge, current } = createSettingsBridge({
      service,
      store,
      base: baseConfig(),
      initial: BASE_SETTINGS,
    });

    const r = await bridge.save({ gitlabBaseUrl: 'not-a-url' });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(calls.reconfigure).toHaveLength(0);
    expect(store.load()).toBeNull();
    expect(current()).toEqual(BASE_SETTINGS);
    rmSync(dir, { recursive: true, force: true });
  });

  it('保存成功时落盘 + 重配置，扫描参数变了才重扫', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-bridge-'));
    const store = new SettingsStore(dir);
    const { service, calls } = stubService();
    const { bridge, current } = createSettingsBridge({
      service,
      store,
      base: baseConfig(),
      initial: BASE_SETTINGS,
    });

    const only = await bridge.save({ concurrency: 4 });
    expect(only.ok).toBe(true);
    expect(only.rescan).toBeUndefined();
    expect(calls.refresh).toBe(0);
    expect(current().concurrency).toBe(4);
    expect(store.load()?.concurrency).toBe(4);

    const root = mkdtempSync(join(tmpdir(), 'release-root-'));
    const withRoots = await bridge.save({ roots: [root] });
    expect(withRoots.rescan).toEqual({ total: 2 });
    expect(calls.refresh).toBe(1);
    expect(withRoots.settings.roots).toEqual([root]);
    expect(calls.reconfigure.at(-1)?.roots).toEqual([root]);

    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  it('重扫失败不回滚设置，只加一条警告', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-bridge-'));
    const store = new SettingsStore(dir);
    const { service } = stubService({ refreshThrows: true });
    const { bridge, current } = createSettingsBridge({
      service,
      store,
      base: baseConfig(),
      initial: BASE_SETTINGS,
    });
    const root = mkdtempSync(join(tmpdir(), 'release-root-'));

    const r = await bridge.save({ roots: [root] });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toContain('重新扫描失败');
    expect(current().roots).toEqual([root]);
    expect(store.load()?.roots).toEqual([root]);

    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  it('测试连接把未保存的新值透传给服务', async () => {
    const { service, calls } = stubService({ testResult: { ok: false, ms: 5, error: '401' } });
    const { bridge } = createSettingsBridge({
      service,
      store: new SettingsStore(join(tmpdir(), 'release-test-unused')),
      base: baseConfig(),
      initial: BASE_SETTINGS,
    });
    const r = await bridge.test({ baseUrl: 'https://new.example.com', token: 'glpat-new' });
    expect(r.ok).toBe(false);
    expect(calls.test[0]).toEqual({ baseUrl: 'https://new.example.com', token: 'glpat-new' });
  });
});

/* ------------------------------------------------------------------ */
/* 任务中心                                                            */
/* ------------------------------------------------------------------ */

const SAMPLE_TASK: TaskRecord = {
  id: 't_sample',
  planId: 'plan_1',
  mode: 'create-mr',
  sourceBranch: 'release/20261022',
  targetBranch: 'master',
  mergeStrategy: 'merge',
  deleteSourceBranch: false,
  title: null,
  startedAt: '2026-10-26T10:00:00.000Z',
  finishedAt: '2026-10-26T10:00:08.000Z',
  durationMs: 8000,
  total: 3,
  succeeded: 2,
  failed: 1,
  skipped: 0,
  status: 'partial',
  results: [
    { projectId: 'a', name: 'common-base', ok: true, kind: 'mr', message: '已创建 MR', mr: null, sha: null, url: 'https://git.x/mr/1', error: null },
    { projectId: 'b', name: 'dc-biz', ok: true, kind: 'mr', message: '已创建 MR', mr: null, sha: null, url: null, error: null },
    { projectId: 'c', name: 'dc-base', ok: false, kind: 'failed', message: '源分支已更新', mr: null, sha: null, url: null, error: '源分支已更新' },
  ],
};

describe('任务中心存储', () => {
  it('新增记录写在最前，并落盘可重新读回', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-tasks-'));
    try {
      const store = new JsonStore(dir);
      store.load();
      expect(store.taskList).toEqual([]);

      store.addTask({ ...SAMPLE_TASK, id: 't_1' });
      store.addTask({ ...SAMPLE_TASK, id: 't_2' });
      expect(store.taskList.map((t) => t.id)).toEqual(['t_2', 't_1']);

      const reopened = new JsonStore(dir);
      reopened.load();
      expect(reopened.taskList.map((t) => t.id)).toEqual(['t_2', 't_1']);
      expect(reopened.taskList[0]?.results).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('同 id 重复写入只保留一条', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-tasks-'));
    try {
      const store = new JsonStore(dir);
      store.load();
      store.addTask({ ...SAMPLE_TASK, id: 'dup', succeeded: 1 });
      store.addTask({ ...SAMPLE_TASK, id: 'dup', succeeded: 2 });
      expect(store.taskList).toHaveLength(1);
      expect(store.taskList[0]?.succeeded).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tasks.json 坏掉不影响插件启动', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-tasks-'));
    try {
      writeFileSync(join(dir, 'tasks.json'), '{ not json');
      const store = new JsonStore(dir);
      expect(() => store.load()).not.toThrow();
      expect(store.taskList).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ */
/* HTTP 集成：真实 http server + 假 ctx                                 */
/* ------------------------------------------------------------------ */

describe('设置 HTTP 接口', () => {
  let server: ReturnType<typeof createServer>;
  let origin = '';
  let bridge: SettingsBridge;
  const dir = mkdtempSync(join(tmpdir(), 'release-http-'));

  beforeAll(async () => {
    const { service } = stubService({ tasks: [SAMPLE_TASK] });
    const created = createSettingsBridge({
      service,
      store: new SettingsStore(dir),
      base: baseConfig({ dataDir: dir }),
      initial: BASE_SETTINGS,
    });
    bridge = created.bridge;

    let handler: ((req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => unknown) | null =
      null;
    const fakeServer = {
      register(route: { handler: typeof handler }) {
        handler = route.handler;
        return () => {
          handler = null;
        };
      },
    };
    const ctx = {
      inject: (_deps: string[], cb: (c: unknown) => void) => cb(ctx),
      effect: (fn: () => unknown) => fn(),
      get: () => fakeServer,
    };
    registerWebUi(ctx as never, { service, settings: bridge });

    server = createServer((req, res) => {
      if (!handler) {
        res.writeHead(500).end('no route');
        return;
      }
      void handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/settings 返回脱敏视图', async () => {
    const res = await fetch(`${origin}/release-ui/api/settings`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.gitlabBaseUrl).toBe('https://git.example.com');
    expect(body.tokenSet).toBe(true);
    expect(JSON.stringify(body)).not.toContain(BASE_SETTINGS.gitlabToken);
  });

  it('拒绝其他网页跨站修改设置', async () => {
    const res = await fetch(`${origin}/release-ui/api/settings`, {
      method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify({ gitlabBaseUrl: 'https://changed.example' }),
    });
    expect(res.status).toBe(403);
    expect(bridge.view().gitlabBaseUrl).not.toBe('https://changed.example');
  });

  it('空仓库选择不能退化为全部仓库', async () => {
    const res = await fetch(`${origin}/release-ui/api/check`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'create-mr', sourceBranch: 'feature/test', projects: [] }),
    });
    expect((await res.json() as { error: string }).error).toContain('至少选择一个仓库');
  });

  it('POST /api/settings 校验失败返回 200 + ok=false', async () => {
    const res = await fetch(`${origin}/release-ui/api/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ concurrency: 99 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; errors: string[] };
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toContain('并发数');
  });

  it('POST /api/settings 成功后 GET 能看到新值', async () => {
    const res = await fetch(`${origin}/release-ui/api/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ concurrency: 6, defaultTarget: 'main' }),
    });
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const after = (await (await fetch(`${origin}/release-ui/api/settings`)).json()) as Record<string, unknown>;
    expect(after.concurrency).toBe(6);
    expect(after.defaultTarget).toBe('main');
  });

  it('POST /api/settings/test 空令牌时不覆盖已保存的令牌', async () => {
    const res = await fetch(`${origin}/release-ui/api/settings/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gitlabBaseUrl: 'https://git.example.com', gitlabToken: '' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('GET /api/settings/dirs 列出子目录', async () => {
    mkdirSync(join(dir, 'sub-repo', '.git'), { recursive: true });
    const res = await fetch(`${origin}/release-ui/api/settings/dirs?path=${encodeURIComponent(dir)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ name: string; isRepo: boolean }> };
    expect(body.entries.find((e) => e.name === 'sub-repo')?.isRepo).toBe(true);
  });

  it('未知接口返回 404 JSON', async () => {
    const res = await fetch(`${origin}/release-ui/api/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('未知接口');
  });

  it('GET /api/tasks 返回执行记录', async () => {
    const res = await fetch(`${origin}/release-ui/api/tasks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; tasks: TaskRecord[] };
    expect(body.total).toBe(1);
    expect(body.tasks[0]?.status).toBe('partial');
    expect(body.tasks[0]?.results).toHaveLength(3);
  });

  it('页面加载与 Harness 共用的 React 应用', async () => {
    const res = await fetch(`${origin}/release-ui`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="app"');
    expect(html).toContain('src="/release-ui/app.js"');
    expect(html).toContain('批量发版');
  });
});
