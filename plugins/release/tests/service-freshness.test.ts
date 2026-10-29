import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseService, type ResolvedConfig } from '../src/service.js';
import type { GitExecutor } from '../src/git.js';
import { GitLabAdapter } from '../src/gitlab.js';
import type { MrRef } from '../src/types.js';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const services: ReleaseService[] = [];
const directories: string[] = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'release-freshness-'));
  directories.push(dir);
  const repo = join(dir, 'repo'); mkdirSync(join(repo, '.git'), { recursive: true });
  const state = { source: OLD, target: OLD };
  const api = vi.spyOn(GitLabAdapter.prototype, 'getBranch').mockImplementation(async (_path, branch) => ({
    name: branch, sha: branch === 'feature/new' ? state.source : state.target, committedAt: null, author: null,
  }));
  vi.spyOn(GitLabAdapter.prototype, 'listOpenMrs').mockResolvedValue([]);
  const compare = vi.spyOn(GitLabAdapter.prototype, 'countAhead').mockRejectedValue(new Error('compare unavailable'));
  const git = {
    lsRemoteHeads: vi.fn().mockImplementation(async () => [
      { name: 'feature/new', sha: state.source }, { name: 'main', sha: state.target },
    ]),
    countBoth: vi.fn().mockImplementation(async (_dir, base, head) => ({ ahead: base === head ? 0 : 1, behind: 0 })),
    fetchBranches: vi.fn(), hasCommit: vi.fn().mockResolvedValue(true), updateRemoteRef: vi.fn().mockResolvedValue(undefined),
    mergeTree: vi.fn().mockResolvedValue({ clean: true, conflicts: [] }),
    ensureBareCache: vi.fn(), fetch: vi.fn(),
    revParse: vi.fn().mockImplementation(async (_dir, ref: string) => ref.endsWith('/feature/new') ? state.source : state.target),
    countRange: vi.fn().mockResolvedValue(1),
  };
  const config: ResolvedConfig = { roots: [], scanDepth: 2, gitlabBaseUrl: 'https://git.example.test',
    gitlabToken: 'test-only', projects: [{ remoteUrl: 'https://git.example.test/team/app.git', localPath: repo }],
    defaultTarget: 'main', concurrency: 8, headCacheTtlSec: 300, mergeStrategy: 'merge',
    deleteSourceBranch: false, dataDir: join(dir, 'data'), gitPath: 'git' };
  const service = new ReleaseService(config, git as unknown as GitExecutor);
  services.push(service);
  return { service, api, compare, git, state };
}

afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('MR auto-merge readiness', () => {
  const pendingMr: MrRef = { iid: 12, url: 'https://git.example.test/team/app/-/merge_requests/12',
    title: 'release', state: 'opened', sourceBranch: 'feature/new', targetBranch: 'main', pipeline: 'none',
    mergeStatus: 'checking', rawMergeStatus: 'preparing', detail: 'GitLab 正在计算可合并状态（preparing）', mergeCommitSha: null };

  it('waits for a newly created MR before merging the pinned source with the supplied message', async () => {
    const { service, state } = fixture(); state.source = NEW;
    vi.spyOn(GitLabAdapter.prototype, 'createMr').mockResolvedValue({ ...pendingMr });
    vi.spyOn(GitLabAdapter.prototype, 'getMr').mockResolvedValue({ ...pendingMr });
    let releaseWait!: (mr: MrRef) => void;
    const wait = vi.spyOn(GitLabAdapter.prototype, 'waitForMergeable').mockImplementation(() => new Promise((resolve) => { releaseWait = resolve; }));
    const merge = vi.spyOn(GitLabAdapter.prototype, 'mergeMr').mockResolvedValue({ ...pendingMr, state: 'merged', mergeStatus: 'mergeable' });
    const plan = await service.planMerge({ mode: 'merge-mr', sourceBranch: 'feature/new', title: 'XLS-21298:合并', description: '门店活动' });
    const execution = service.applyPlan({ planId: plan.id, planHash: plan.hash });
    await vi.waitFor(() => expect(wait).toHaveBeenCalledTimes(1));
    expect(merge).not.toHaveBeenCalled();
    releaseWait({ ...pendingMr, mergeStatus: 'mergeable', rawMergeStatus: 'mergeable' });
    const result = await execution;
    expect(result.succeeded).toBe(1);
    expect(merge).toHaveBeenCalledWith('team/app', 12, NEW, { deleteSourceBranch: false, message: 'XLS-21298:合并\n\n门店活动' });
  });

  it.each([
    { mergeStatus: 'checking' as const, rawMergeStatus: 'preparing', detail: 'GitLab 正在准备 MR（preparing）' },
    { mergeStatus: 'blocked' as const, rawMergeStatus: 'discussions_not_resolved', detail: '仍有未解决的讨论（discussions_not_resolved）' },
  ])('retains the MR link and original $rawMergeStatus on failure', async (status) => {
    const { service, state } = fixture(); state.source = NEW;
    vi.spyOn(GitLabAdapter.prototype, 'createMr').mockResolvedValue({ ...pendingMr });
    vi.spyOn(GitLabAdapter.prototype, 'getMr').mockResolvedValue({ ...pendingMr });
    vi.spyOn(GitLabAdapter.prototype, 'waitForMergeable').mockResolvedValue({ ...pendingMr, ...status });
    const merge = vi.spyOn(GitLabAdapter.prototype, 'mergeMr');
    const plan = await service.planMerge({ mode: 'merge-mr', sourceBranch: 'feature/new' });
    const result = await service.applyPlan({ planId: plan.id, planHash: plan.hash });
    expect(merge).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({ url: pendingMr.url, mr: { iid: 12, rawMergeStatus: status.rawMergeStatus } });
    expect(result.results[0].message).toContain(status.rawMergeStatus);
    expect(service.tasks[0].results[0].mr?.rawMergeStatus).toBe(status.rawMergeStatus);
  });
});

describe('precheck freshness', () => {
  it('rechecks remote heads after a previous no-change result, even within the 300-second cache TTL', async () => {
    const { service, api, git, state } = fixture();
    const first = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(first.items[0]?.noop).toBe(true);
    state.source = NEW;
    const second = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(second.items[0]).toMatchObject({ sourceSha: NEW, ahead: 1, noop: false, executable: true, cachedAgeMs: null });
    expect(api).toHaveBeenCalledTimes(4);
    expect(git.lsRemoteHeads).not.toHaveBeenCalled();
  });

  it('falls back to a fresh Git query if the GitLab branch API fails', async () => {
    const { service, api, git, state } = fixture();
    await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    state.source = NEW; api.mockRejectedValue(new Error('API unavailable'));
    const plan = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(plan.items[0]).toMatchObject({ sourceSha: NEW, ahead: 1, noop: false, executable: true });
    expect(git.lsRemoteHeads).toHaveBeenCalledTimes(1);
  });

  it('keeps missing local commit objects unknown rather than misreporting zero changes', async () => {
    const { service, git, state } = fixture(); state.source = NEW;
    git.countBoth.mockRejectedValue(new Error('missing object'));
    const plan = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(plan.items[0]).toMatchObject({ sourceSha: NEW, ahead: null, noop: false, executable: true });
    expect(git.fetchBranches).not.toHaveBeenCalled();
  });

  it('uses the pinned remote commits when the latest target is not available locally', async () => {
    const { service, compare, git, state } = fixture(); state.source = NEW;
    git.countBoth.mockRejectedValue(new Error('missing object'));
    compare.mockResolvedValue(1);
    const plan = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(plan.items[0]).toMatchObject({ ahead: 1, noop: false, executable: true });
    expect(compare).toHaveBeenCalledWith('team/app', OLD, NEW);
    expect(git.fetchBranches).not.toHaveBeenCalled();
  });

  it('recognizes a source already merged into a new target without local objects', async () => {
    const { service, compare, git, state } = fixture(); state.source = NEW;
    git.countBoth.mockRejectedValue(new Error('missing object'));
    compare.mockResolvedValue(0);
    const plan = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(plan.items[0]).toMatchObject({ ahead: 0, noop: true, executable: false });
  });

  it('does not report old cached no-change data when both live queries fail', async () => {
    const { service, api, git } = fixture();
    await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    api.mockRejectedValue(new Error('API unavailable'));
    git.lsRemoteHeads.mockRejectedValue(new Error('Git unavailable'));
    const plan = await service.planMerge({ mode: 'create-mr', sourceBranch: 'feature/new' });
    expect(plan.items[0]).toMatchObject({ ahead: null, noop: false, executable: false });
  });
});
