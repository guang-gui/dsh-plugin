/**
 * Git 适配器。所有命令通过参数数组执行，不拼接 shell；
 * 错误按类别返回，由发版逻辑决定可重试性与用户提示。
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ProcessStartError, run, type RunResult } from './process.js';

export interface RemoteRef {
  sha: string;
  name: string;
}

export interface CommitInfo {
  sha: string;
  subject: string;
  author: string;
  date: string;
}

export type GitErrorCode =
  | 'GIT_NOT_FOUND'
  | 'NOT_A_REPOSITORY'
  | 'REMOTE_UNREACHABLE'
  | 'AUTH_FAILED'
  | 'BRANCH_NOT_FOUND'
  | 'CONFLICT'
  | 'NON_FAST_FORWARD'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class GitError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    readonly retryable = false,
    readonly detail?: { stderr?: string; exitCode?: number },
  ) {
    super(message);
    this.name = 'GitError';
  }
}

const AUTH_PATTERNS = [
  /authentication failed/i,
  /permission denied/i,
  /could not read (username|password)/i,
  /access denied/i,
  /fatal: could not read from remote repository/i,
];
const NETWORK_PATTERNS = [
  /could not resolve host/i,
  /connection (refused|timed out|reset)/i,
  /network is unreachable/i,
  /failed to connect/i,
  /operation timed out/i,
  /ssh: connect to host/i,
];

function classify(result: RunResult): GitError {
  const text = `${result.stderr}\n${result.stdout}`;
  if (result.timedOut) return new GitError('TIMEOUT', 'Git 命令执行超时', true, { stderr: result.stderr });
  // 远端名字未配置或路径不存在时，Git 也会提示 "could not read from remote repository"，
  // 必须先于鉴权判断，否则会被误报为凭据问题。
  if (/does not appear to be a git repository/i.test(text))
    return new GitError('REMOTE_UNREACHABLE', '远端仓库不存在或未配置', false, {
      stderr: result.stderr,
      exitCode: result.code,
    });
  if (AUTH_PATTERNS.some((r) => r.test(text)))
    return new GitError('AUTH_FAILED', '没有访问权限或凭据不可用', false, {
      stderr: result.stderr,
      exitCode: result.code,
    });
  if (NETWORK_PATTERNS.some((r) => r.test(text)))
    return new GitError('REMOTE_UNREACHABLE', '无法连接远端仓库', true, {
      stderr: result.stderr,
      exitCode: result.code,
    });
  if (/not a git repository/i.test(text))
    return new GitError('NOT_A_REPOSITORY', '目录不是 Git 仓库', false, { stderr: result.stderr });
  if (/CONFLICT|would be overwritten|Automatic merge failed/i.test(text))
    return new GitError('CONFLICT', '合并存在冲突', false, { stderr: result.stderr });
  if (/non-fast-forward|\[rejected\]|failed to push some refs/i.test(text))
    return new GitError('NON_FAST_FORWARD', '推送被拒绝：远端目标分支已更新', false, { stderr: result.stderr });
  if (/unknown revision|bad revision|not a valid object name|couldn't find remote ref/i.test(text))
    return new GitError('BRANCH_NOT_FOUND', '分支或提交不存在', false, { stderr: result.stderr });
  return new GitError('UNKNOWN', `Git 执行失败（退出码 ${result.code}）`, false, {
    stderr: result.stderr,
    exitCode: result.code,
  });
}

const GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
};

export class GitExecutor {
  constructor(
    private readonly gitPath = 'git',
    private readonly timeoutMs = 120_000,
  ) {}

  private async exec(args: string[], timeoutMs = this.timeoutMs, signal?: AbortSignal): Promise<RunResult> {
    try {
      return await run(this.gitPath, args, { timeoutMs, env: GIT_ENV, signal });
    } catch (e) {
      if (e instanceof ProcessStartError) {
        throw new GitError('GIT_NOT_FOUND', `未找到 Git 可执行文件：${this.gitPath}`, false, { stderr: e.message });
      }
      throw e;
    }
  }

  private async must(args: string[], timeoutMs?: number, signal?: AbortSignal): Promise<string> {
    const result = await this.exec(args, timeoutMs, signal);
    if (result.code !== 0) throw classify(result);
    return result.stdout;
  }

  async version(): Promise<string> {
    const out = await this.must(['--version'], 10_000);
    return out.trim().replace(/^git version\s*/i, '');
  }

  async remoteUrl(repoPath: string): Promise<string | null> {
    const result = await this.exec(['-C', repoPath, 'remote', 'get-url', 'origin'], 15_000);
    if (result.code !== 0) return null;
    return result.stdout.trim() || null;
  }

  async currentBranch(repoPath: string): Promise<string | null> {
    const result = await this.exec(['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'], 10_000);
    if (result.code !== 0) return null;
    const name = result.stdout.trim();
    return name && name !== 'HEAD' ? name : null;
  }

  /**
   * 远端分支查询。`repoPath` 为空时直接用 remote（URL 或远端名）发起；
   * pattern 用 refs/heads/... 形式，可传多个以减少网络往返。
   */
  async lsRemoteHeads(repoPath: string | undefined, remote: string, pattern?: string | string[]): Promise<RemoteRef[]> {
    const args = repoPath
      ? ['-c', 'protocol.version=2', '-C', repoPath, 'ls-remote', '--heads', remote]
      : ['-c', 'protocol.version=2', 'ls-remote', '--heads', remote];
    const patterns = Array.isArray(pattern) ? pattern : pattern ? [pattern] : [];
    args.push(...patterns);
    const out = await this.must(args, 45_000);
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split('\t');
        return { sha: sha ?? '', name: (ref ?? '').replace(/^refs\/heads\//, '') };
      })
      .filter((r) => r.sha && r.name);
  }

  /** 本地已有的远端跟踪分支：纯本地读取，毫秒级 */
  async localRemoteHeads(repoDir: string, remote = 'origin'): Promise<RemoteRef[]> {
    const result = await this.exec(
      ['-C', repoDir, 'for-each-ref', `refs/remotes/${remote}`, '--format=%(refname:short) %(objectname)'],
      15_000,
    );
    if (result.code !== 0) return [];
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [ref, sha] = line.split(' ');
        const name = (ref ?? '').replace(new RegExp(`^${remote}/`), '');
        return { sha: sha ?? '', name };
      })
      .filter((r) => r.sha && r.name && r.name !== 'HEAD');
  }

  async ensureBareCache(cacheDir: string, remote: string): Promise<void> {
    if (!existsSync(join(cacheDir, 'HEAD'))) {
      mkdirSync(join(cacheDir, '..'), { recursive: true });
      rmSync(cacheDir, { recursive: true, force: true });
      const result = await this.exec(['clone', '--bare', '--no-tags', remote, cacheDir], 300_000);
      if (result.code !== 0) throw classify(result);
      return;
    }
    const setUrl = await this.exec(['-C', cacheDir, 'remote', 'set-url', 'origin', remote], 15_000);
    if (setUrl.code !== 0) throw classify(setUrl);
  }

  async fetch(cacheDir: string, signal?: AbortSignal): Promise<void> {
    const result = await this.exec(
      [
        '-c',
        'protocol.version=2',
        '-C',
        cacheDir,
        'fetch',
        '--prune',
        '--no-tags',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
      ],
      300_000,
      signal,
    );
    if (result.code !== 0) throw classify(result);
  }

  /** 只取需要的分支，避免大仓库全量拉取 */
  async fetchBranches(repoDir: string, branches: string[]): Promise<void> {
    const unique = [...new Set(branches.filter(Boolean))];
    if (!unique.length) return;
    const refspecs = unique.map((b) => `+refs/heads/${b}:refs/remotes/origin/${b}`);
    const result = await this.exec(['-c', 'protocol.version=2', '-C', repoDir, 'fetch', '--no-tags', 'origin', ...refspecs], 300_000);
    if (result.code !== 0) throw classify(result);
  }

  /** 距上次 fetch 过了多久（毫秒）；读不到返回 null */
  async lastFetchAge(repoDir: string): Promise<number | null> {
    const result = await this.exec(['-C', repoDir, 'rev-parse', '--absolute-git-dir'], 10_000);
    if (result.code !== 0) return null;
    const gitDir = result.stdout.trim();
    if (!gitDir) return null;
    for (const name of ['FETCH_HEAD', 'logs/HEAD']) {
      try {
        return Date.now() - statSync(join(gitDir, name)).mtimeMs;
      } catch {
        continue;
      }
    }
    return null;
  }

  async revParse(cacheDir: string, ref: string): Promise<string | null> {
    const result = await this.exec(['-C', cacheDir, 'rev-parse', '--verify', '--quiet', ref], 20_000);
    if (result.code !== 0) return null;
    return result.stdout.trim() || null;
  }

  /** 一次读取多个引用，缺失的引用不会出现在结果里 */
  async refsOf(repoDir: string, refs: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!refs.length) return map;
    const result = await this.exec(['-C', repoDir, 'for-each-ref', '--format=%(refname) %(objectname)', ...refs], 20_000);
    if (result.code !== 0) return map;
    for (const line of result.stdout.split('\n')) {
      const [name, sha] = line.trim().split(' ');
      if (name && sha) map.set(name, sha);
    }
    return map;
  }

  /** 本地对象库是否已包含该提交；用于跳过重复 fetch */
  async hasCommit(repoDir: string, sha: string): Promise<boolean> {
    if (!/^[0-9a-f]{7,64}$/i.test(sha)) return false;
    const result = await this.exec(['-C', repoDir, 'cat-file', '-e', `${sha}^{commit}`], 15_000);
    return result.code === 0;
  }

  /** 本地更新远端跟踪引用，不产生网络请求 */
  async updateRemoteRef(repoDir: string, branch: string, sha: string): Promise<void> {
    await this.must(['-C', repoDir, 'update-ref', `refs/remotes/origin/${branch}`, sha], 15_000);
  }

  async countRange(cacheDir: string, from: string, to: string): Promise<number> {
    const out = await this.must(['-C', cacheDir, 'rev-list', '--count', `${from}..${to}`], 60_000);
    const n = Number(out.trim());
    if (!/^\d+$/.test(out.trim()) || !Number.isSafeInteger(n)) throw new GitError('UNKNOWN', 'Git 返回了无效的提交数量');
    return n;
  }

  /** 一次遍历同时算出领先/落后提交数，比两次 countRange 省一半时间 */
  async countBoth(cacheDir: string, base: string, head: string): Promise<{ ahead: number; behind: number }> {
    const out = await this.must(['-C', cacheDir, 'rev-list', '--count', '--left-right', `${base}...${head}`], 60_000);
    const [left, right] = out.trim().split(/\s+/);
    const behind = Number(left);
    const ahead = Number(right);
    if (!/^\d+\s+\d+$/.test(out.trim()) || !Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
      throw new GitError('UNKNOWN', 'Git 返回了无效的提交差异，无法判定是否有变化');
    }
    return {
      ahead,
      behind,
    };
  }

  /** 冲突预演：不创建工作区，直接得到合并树结果 */
  async mergeTree(cacheDir: string, ours: string, theirs: string): Promise<{ clean: boolean; conflicts: string[] }> {
    const result = await this.exec(['-C', cacheDir, 'merge-tree', '--write-tree', '--name-only', ours, theirs], 120_000);
    if (result.code === 0) return { clean: true, conflicts: [] };
    if (result.code === 1) {
      const lines = result.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // 第一行是树 OID，其后为冲突文件路径
      const conflicts = lines.slice(1).filter((l) => !l.startsWith('CONFLICT'));
      return { clean: false, conflicts: [...new Set(conflicts)] };
    }
    const err = classify(result);
    if (err.code === 'UNKNOWN') {
      // 旧版本 Git 不支持 merge-tree --write-tree 时按未知处理，不推断为无冲突
      throw new GitError('UNKNOWN', '当前 Git 版本不支持冲突预演', false, { stderr: result.stderr });
    }
    throw err;
  }

  async log(cacheDir: string, ref: string, limit = 8): Promise<CommitInfo[]> {
    const out = await this.must(['-C', cacheDir, 'log', `-${limit}`, '--format=%H%x1f%s%x1f%an%x1f%cI', ref], 30_000);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, subject, author, date] = line.split('\x1f');
        return { sha: sha ?? '', subject: subject ?? '', author: author ?? '', date: date ?? '' };
      })
      .filter((c) => c.sha);
  }

  async addWorktree(cacheDir: string, worktreeDir: string, sha: string, branch: string): Promise<void> {
    rmSync(worktreeDir, { recursive: true, force: true });
    const result = await this.exec(
      ['-C', cacheDir, 'worktree', 'add', '--force', '-B', branch, worktreeDir, sha],
      120_000,
    );
    if (result.code !== 0) throw classify(result);
  }

  async merge(
    worktreeDir: string,
    sha: string,
    strategy: 'merge' | 'ff-only' | 'no-ff',
    message: string,
  ): Promise<CommitInfo> {
    const args = ['-C', worktreeDir, 'merge', '--no-edit'];
    if (strategy === 'ff-only') args.push('--ff-only');
    if (strategy === 'no-ff') args.push('--no-ff');
    if (strategy !== 'ff-only') args.push('-m', message);
    args.push(sha);
    const result = await this.exec(args, 180_000);
    if (result.code !== 0) throw classify(result);
    const head = await this.must(['-C', worktreeDir, 'rev-parse', 'HEAD'], 20_000);
    const info = await this.log(worktreeDir, head.trim(), 1);
    return info[0] ?? { sha: head.trim(), subject: message, author: '', date: new Date().toISOString() };
  }

  async push(worktreeDir: string, refspec: string): Promise<void> {
    const result = await this.exec(['-C', worktreeDir, 'push', 'origin', refspec], 300_000);
    if (result.code !== 0) throw classify(result);
  }

  async deleteRemoteBranch(cacheDir: string, branch: string): Promise<void> {
    const result = await this.exec(['-C', cacheDir, 'push', 'origin', '--delete', branch], 120_000);
    if (result.code !== 0) throw classify(result);
  }

  async removeWorktree(cacheDir: string, worktreeDir: string): Promise<void> {
    await this.exec(['-C', cacheDir, 'worktree', 'remove', '--force', worktreeDir], 60_000);
    rmSync(worktreeDir, { recursive: true, force: true });
    await this.exec(['-C', cacheDir, 'worktree', 'prune'], 30_000);
  }

  /** 判断 commit 是否为 ancestor 的祖先，用于推送后核验 */
  async isAncestor(cacheDir: string, ancestor: string, descendant: string): Promise<boolean> {
    const result = await this.exec(['-C', cacheDir, 'merge-base', '--is-ancestor', ancestor, descendant], 30_000);
    return result.code === 0;
  }

  async isGitRepository(path: string): Promise<boolean> {
    const result = await this.exec(['-C', path, 'rev-parse', '--git-dir'], 10_000);
    return result.code === 0;
  }
}
