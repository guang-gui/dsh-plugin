import { describe, expect, it, vi } from 'vitest';
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../src/process.js', () => ({ run, ProcessStartError: class extends Error {} }));
import { GitExecutor } from '../src/git.js';

function output(stdout: string) { run.mockResolvedValue({ code: 0, stdout, stderr: '', timedOut: false }); }

describe('Git commit counts', () => {
  it('reads valid ahead/behind counts', async () => {
    output('150\t1\n');
    expect(await new GitExecutor().countBoth('repo', 'base', 'source')).toEqual({ ahead: 1, behind: 150 });
  });
  it.each(['', '150', '150 unknown', 'warning: no data', '0 -1'])('rejects malformed counts instead of returning zero: %j', async (value) => {
    output(value);
    await expect(new GitExecutor().countBoth('repo', 'base', 'source')).rejects.toThrow('无效的提交差异');
  });
  it('rejects an empty single-count response', async () => {
    output('');
    await expect(new GitExecutor().countRange('repo', 'base', 'source')).rejects.toThrow('无效的提交数量');
  });
});
