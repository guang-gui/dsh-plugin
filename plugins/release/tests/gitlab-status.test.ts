import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitLabAdapter } from '../src/gitlab.js';

const rawMr = (status: string) => ({
  iid: 12, web_url: 'https://git.example.test/team/app/-/merge_requests/12', title: 'release',
  state: 'opened', source_branch: 'feature/new', target_branch: 'main',
  detailed_merge_status: status, merge_status: 'checking', has_conflicts: false,
});
const adapter = () => new GitLabAdapter({ baseUrl: 'https://git.example.test', token: 'test-only' });
const reply = (status: string) => new Response(JSON.stringify(rawMr(status)), { status: 200 });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('GitLab MR readiness', () => {
  it.each(['preparing', 'approvals_syncing', 'checking', 'unchecked', 'cannot_be_merged_recheck'])(
    'keeps transient %s pending and preserves the original status', async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(status)));
      expect(await adapter().getMr('team/app', 12)).toMatchObject({ mergeStatus: 'checking', rawMergeStatus: status });
    },
  );

  it('keeps the actual blocker rather than inventing a branch-protection error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('discussions_not_resolved')));
    const mr = await adapter().getMr('team/app', 12);
    expect(mr).toMatchObject({ mergeStatus: 'blocked', rawMergeStatus: 'discussions_not_resolved' });
    expect(mr.detail).toContain('讨论');
    expect(mr.detail).toContain('discussions_not_resolved');
    expect(mr.detail).not.toContain('分支保护');
  });

  it('keeps an unfamiliar status unknown with its original value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('future_status')));
    expect(await adapter().getMr('team/app', 12)).toMatchObject({ mergeStatus: 'unknown', rawMergeStatus: 'future_status' });
  });

  it('polls a newly created MR until GitLab finishes preparing it', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(reply('preparing'))
      .mockResolvedValueOnce(reply('checking')).mockResolvedValueOnce(reply('mergeable'));
    vi.stubGlobal('fetch', fetch);
    const client = adapter();
    const first = await client.getMr('team/app', 12);
    const pending = client.waitForMergeable('team/app', first, 5000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toMatchObject({ mergeStatus: 'mergeable' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('stops polling on a real blocker', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(reply('preparing')).mockResolvedValueOnce(reply('not_approved'));
    vi.stubGlobal('fetch', fetch);
    const client = adapter();
    const first = await client.getMr('team/app', 12);
    const pending = client.waitForMergeable('team/app', first, 5000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ mergeStatus: 'not-approved' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds the wait and never treats a preparation timeout as a rejection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply('preparing')));
    const client = adapter();
    const first = await client.getMr('team/app', 12);
    const pending = client.waitForMergeable('team/app', first, 1500);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toMatchObject({ mergeStatus: 'checking', rawMergeStatus: 'preparing' });
  });
});
