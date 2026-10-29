import { describe, expect, it, vi } from 'vitest';
import { BranchCatalog } from '../src/branch-catalog.js';
import { fuzzyScore } from '../src/search.js';
import type { GitExecutor, RemoteRef } from '../src/git.js';
import type { Project } from '../src/types.js';

const project = (id: string): Project => ({ id, name: id, namespace: 'team', remoteUrl: `https://git.example/team/${id}.git`,
  gitlabPath: `team/${id}`, localPath: `C:/code/${id}`, defaultTarget: null, enabled: true, source: 'scan' });
const ref = (name: string): RemoteRef => ({ name, sha: 'a'.repeat(40) });

describe('fuzzy matching', () => {
  it('ranks exact and substring above subsequence and supports case, tokens and separators', () => {
    expect(fuzzyScore('Release/ORDER-1026', 'order')).toBeLessThan(fuzzyScore('other/delivery', 'order'));
    expect(Number.isFinite(fuzzyScore('feature/order-1026', 'ftord126'))).toBe(true);
    expect(Number.isFinite(fuzzyScore('feature/order-1026', 'order 1026'))).toBe(true);
    expect(fuzzyScore('master', 'xyz')).toBe(Infinity);
    expect(fuzzyScore('master', '')).toBeLessThan(fuzzyScore('feature/x', ''));
    expect(fuzzyScore('master', 'mstr')).toBeLessThan(fuzzyScore('master_userLabelBugfix_20230301', 'mstr'));
  });
});

describe('BranchCatalog', () => {
  it('returns local candidates before the remote responds and shares in-flight reads across keywords', async () => {
    let finish!: (refs: RemoteRef[]) => void;
    const remote = new Promise<RemoteRef[]>((resolve) => { finish = resolve; });
    const git = { localRemoteHeads: vi.fn().mockResolvedValue([ref('master'), ref('feature/order-1026')]),
      lsRemoteHeads: vi.fn().mockReturnValue(remote) };
    const catalog = new BranchCatalog(git as unknown as GitExecutor);
    const first = await catalog.view([project('one')], 8, 300);
    expect(first.loading).toBe(true);
    expect(first.options.map((o) => o.name)).toContain('feature/order-1026');
    await catalog.view([project('one')], 8, 300);
    expect(catalog.snapshot([project('one')], 'ftord126').options[0]?.name).toBe('feature/order-1026');
    expect(catalog.matches([project('one')], 'ftord126', 200)[0]?.sha).toBe('a'.repeat(40));
    expect(git.lsRemoteHeads).toHaveBeenCalledTimes(1);
    finish([ref('master'), ref('feature/new')]); await catalog.wait();
    const latest = await catalog.view([project('one')], 8, 300);
    expect(latest.loading).toBe(false);
    expect(latest.options.map((o) => o.name)).not.toContain('feature/order-1026');
    expect(git.lsRemoteHeads).toHaveBeenCalledTimes(1);
    await catalog.view([project('one')], 8, 300, true); await catalog.wait();
    expect(git.lsRemoteHeads).toHaveBeenCalledTimes(2);
  });

  it('aggregates repository coverage and filters selected repositories without another remote read', async () => {
    const git = { localRemoteHeads: vi.fn().mockResolvedValue([ref('master')]), lsRemoteHeads: vi.fn().mockResolvedValue([ref('master')]) };
    const catalog = new BranchCatalog(git as unknown as GitExecutor);
    const projects = [project('one'), project('two')];
    await catalog.view(projects, 1, 300); await catalog.wait();
    expect(catalog.snapshot(projects).options[0]?.projectIds).toEqual(['one', 'two']);
    expect(catalog.snapshot([projects[1]!]).options[0]?.projectIds).toEqual(['two']);
    expect(git.lsRemoteHeads).toHaveBeenCalledTimes(2);
  });

  it('keeps local candidates and reports per-repository failures without hammering the remote', async () => {
    const git = { localRemoteHeads: vi.fn().mockResolvedValue([ref('master')]), lsRemoteHeads: vi.fn().mockRejectedValue(new Error('认证失败')) };
    const catalog = new BranchCatalog(git as unknown as GitExecutor);
    await catalog.view([project('one')], 8, 300); await catalog.wait();
    const view = await catalog.view([project('one')], 8, 300);
    expect(view.options[0]?.name).toBe('master');
    expect(view.errors).toEqual([{ project: 'one', message: '认证失败' }]);
    expect(view.loading).toBe(false);
    expect(git.lsRemoteHeads).toHaveBeenCalledTimes(1);
  });
});
