import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseService, type ResolvedConfig } from '../src/service.js';
import { GitLabAdapter } from '../src/gitlab.js';
import { HttpError } from '../src/http.js';
import { registerWebUi } from '../src/web.js';
import type { GitExecutor } from '../src/git.js';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NAME = 'feature/XLS-21298_中文';
const services: ReleaseService[] = [];
const directories: string[] = [];
const ref = (name: string, sha = SHA) => ({ name, sha, committedAt: null, author: null });

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'release-create-'));
  directories.push(dir);
  const config: ResolvedConfig = { roots: [], scanDepth: 2, gitlabBaseUrl: 'https://git.example.test',
    gitlabToken: 'test-only', projects: [
      { path: 'team/a', defaultTarget: 'release/common' }, { path: 'team/b' },
      { path: 'team/off', enabled: false }, { remoteUrl: 'https://other.example.test/team/foreign.git' },
    ], defaultTarget: 'release/common', concurrency: 8, headCacheTtlSec: 300, mergeStrategy: 'merge',
    deleteSourceBranch: false, dataDir: dir, gitPath: 'git' };
  // No Git implementation: this operation must not fetch, checkout, or push local repositories.
  const service = new ReleaseService(config, {} as GitExecutor);
  services.push(service);
  const defaults = vi.spyOn(GitLabAdapter.prototype, 'getDefaultBranch')
    .mockImplementation(async (path) => path === 'team/a' ? 'main' : 'master');
  const existing = new Map<string, string>();
  const branches = vi.spyOn(GitLabAdapter.prototype, 'getBranch').mockImplementation(async (path, name) => {
    if (name === 'main' || name === 'master') return ref(name);
    const sha = existing.get(String(path));
    return sha ? ref(name, sha) : null;
  });
  const create = vi.spyOn(GitLabAdapter.prototype, 'createBranch').mockImplementation(async (_path, name, sha) => ref(name, sha));
  await service.ready();
  const id = (name: string) => service.projects.find((p) => p.name === name)!.id;
  return { service, id, defaults, branches, create, existing };
}

afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('bulk branch creation', () => {
  it('creates only selected projects from each live default SHA, independent of merge targets', async () => {
    const { service, id, defaults, branches, create } = await fixture();
    const result = await service.createBranches({ branchName: ` ${NAME} `, projectIds: [id('a'), id('b'), id('a')] });
    expect(result).toMatchObject({ branchName: NAME, total: 2, created: 2, failed: 0, exists: 0, unknown: 0 });
    expect(result.items.map((i) => i.baseBranch)).toEqual(['main', 'master']);
    expect(create.mock.calls).toEqual([['team/a', NAME, SHA], ['team/b', NAME, SHA]]);
    expect(defaults.mock.calls).toEqual([['team/a'], ['team/b']]);
    expect(branches).not.toHaveBeenCalledWith('team/a', 'release/common');
    expect(result.items[0]).toMatchObject({ baseSha: SHA, sha: SHA, status: 'created',
      url: `https://git.example.test/team/a/-/tree/${encodeURIComponent(NAME)}` });
  });

  it.each(['', 'bad name', '-bad', 'feature/a.lock', 'feature/../x'])('rejects invalid name %j before writing', async (branchName) => {
    const { service, id, create, defaults } = await fixture();
    await expect(service.createBranches({ branchName, projectIds: [id('a')] })).rejects.toThrow('不合法');
    expect(create).not.toHaveBeenCalled(); expect(defaults).not.toHaveBeenCalled();
  });

  it('rejects empty, unknown, or disabled selection without silently expanding to all projects', async () => {
    const { service, id, create, defaults } = await fixture();
    for (const projectIds of [[], [''], ['missing'], [id('a'), id('off')]]) {
      await expect(service.createBranches({ branchName: NAME, projectIds })).rejects.toThrow();
    }
    expect(create).not.toHaveBeenCalled(); expect(defaults).not.toHaveBeenCalled();
  });

  it('requires configured GitLab credentials', async () => {
    const { service, id, create } = await fixture(); service.reconfigure({ gitlabToken: '' });
    await expect(service.createBranches({ branchName: NAME, projectIds: [id('a')] })).rejects.toThrow('配置 GitLab');
    expect(create).not.toHaveBeenCalled();
  });

  it('reports an existing branch with a different SHA and never overwrites it', async () => {
    const { service, id, existing, create } = await fixture(); existing.set('team/a', OTHER);
    const result = await service.createBranches({ branchName: NAME, projectIds: [id('a')] });
    expect(result).toMatchObject({ exists: 1, created: 0 });
    expect(result.items[0]).toMatchObject({ status: 'exists', sha: OTHER });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a project on a different GitLab instance before any request', async () => {
    const { service, id, defaults, create } = await fixture();
    const result = await service.createBranches({ branchName: NAME, projectIds: [id('foreign')] });
    expect(result.items[0]).toMatchObject({ status: 'failed', message: '项目不属于当前配置的 GitLab，未创建分支' });
    expect(defaults).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });

  it('reports a missing base without attempting to create', async () => {
    const { service, id, branches, create } = await fixture(); branches.mockResolvedValue(null);
    const result = await service.createBranches({ branchName: NAME, projectIds: [id('a')] });
    expect(result.items[0]).toMatchObject({ status: 'failed', message: '基线分支 main 不存在' });
    expect(create).not.toHaveBeenCalled();
  });

  it('preserves per-project permission errors and continues with other selected projects', async () => {
    const { service, id, create } = await fixture();
    create.mockRejectedValueOnce(new HttpError(403, 'protected branch policy', 'test-only'));
    const result = await service.createBranches({ branchName: NAME, projectIds: [id('a'), id('b')] });
    expect(result).toMatchObject({ total: 2, created: 1, failed: 1 });
    expect(result.items[0].message).toContain('HTTP 403');
    expect(result.items[0].message).toContain('protected branch policy');
    expect(result.items[1].status).toBe('created');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([400, 409, 503, 'network'])('reconciles a lost response or concurrent creation (%s) without repeating POST', async (error) => {
    const { service, id, existing, create } = await fixture();
    create.mockImplementationOnce(async () => {
      existing.set('team/a', SHA);
      throw typeof error === 'number' ? new HttpError(error, 'create error', 'test-only') : new Error('connection lost');
    });
    const result = await service.createBranches({ branchName: NAME, projectIds: [id('a')] });
    expect(result).toMatchObject({ exists: 1, unknown: 0, failed: 0 });
    expect(result.items[0].sha).toBe(SHA);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps an unreconciled timeout unknown, without retrying the write', async () => {
    const { service, id, create } = await fixture(); create.mockRejectedValueOnce(new Error('timeout'));
    const result = await service.createBranches({ branchName: NAME, projectIds: [id('a')] });
    expect(result).toMatchObject({ unknown: 1, failed: 0, created: 0 });
    expect(result.items[0].message).toContain('待确认'); expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects overlapping submissions and releases the lock after completion', async () => {
    const { service, id, defaults, create } = await fixture();
    let release!: (branch: string) => void;
    defaults.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const input = { branchName: NAME, projectIds: [id('a')] };
    const first = service.createBranches(input);
    await expect(service.createBranches(input)).rejects.toThrow('任务执行中');
    release('main'); expect((await first).created).toBe(1);
    expect((await service.createBranches(input)).created).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('HTTP route enforces explicit selection, origin protection, and forwards the branch name', async () => {
    const { service, id, create } = await fixture();
    let handler!: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    const ctx = { inject: (_deps: string[], cb: (value: unknown) => void) => cb(ctx),
      effect: (fn: () => unknown) => fn(), get: () => ({ register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {}; } }) };
    registerWebUi(ctx as never, { service, settings: {} as never });
    const server = createServer((req, res) => { void handler(req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const send = (body: unknown, caller = origin) => fetch(`${origin}/release-ui/api/branches/create`, {
      method: 'POST', headers: { origin: caller, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    try {
      expect((await send({ branchName: NAME, projects: [id('a')] }, 'https://evil.test')).status).toBe(403);
      for (const projects of [undefined, [], [''], [42], 'a']) {
        const response = await send({ branchName: NAME, projects });
        expect(response.ok).toBe(false);
        expect((await response.json() as { error: string }).error).toContain('至少选择一个有效项目');
      }
      expect(create).not.toHaveBeenCalled();
      const response = await send({ branchName: NAME, projects: [id('b')] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ branchName: NAME, total: 1, created: 1 });
      expect(create).toHaveBeenCalledWith('team/b', NAME, SHA);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});

describe('GitLab branch creation API', () => {
  it('reads the default branch and sends an encoded project with JSON name and pinned SHA', async () => {
    const requests: Array<{ path: string; method: string; body: unknown }> = [];
    let defaultBranch: string | null = 'main';
    let incorrectSha = false;
    const server = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      requests.push({ path: req.url!, method: req.method!, body: raw ? JSON.parse(raw) : null });
      expect(req.headers['private-token']).toBe('test-only');
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.method === 'POST'
        ? { name: NAME, commit: { id: incorrectSha ? OTHER : SHA } } : { default_branch: defaultBranch }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const adapter = new GitLabAdapter({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token: 'test-only' });
    try {
      expect(await adapter.getDefaultBranch('team/中文')).toBe('main');
      defaultBranch = null; expect(await adapter.getDefaultBranch('team/中文')).toBe('master');
      expect(await adapter.createBranch('team/中文', NAME, SHA)).toEqual(ref(NAME));
      expect(requests[0].path).toBe('/api/v4/projects/team%2F%E4%B8%AD%E6%96%87');
      expect(requests[2]).toEqual({ path: '/api/v4/projects/team%2F%E4%B8%AD%E6%96%87/repository/branches', method: 'POST', body: { branch: NAME, ref: SHA } });
      incorrectSha = true; await expect(adapter.createBranch('team/中文', NAME, SHA)).rejects.toThrow('不一致');
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
