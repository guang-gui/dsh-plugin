/**
 * 项目发现：扫描根目录，识别 Git 仓库与 worktree，按 remote 去重。
 * 同一 GitLab 项目的多个副本/worktree 合并为一个条目，保留最先命中的路径作为工作区。
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { normalizeRemoteUrl, parseRemoteUrl } from './domain.js';
import type { GitExecutor } from './git.js';
import type { Project } from './types.js';

const IGNORED = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  'out',
  'coverage',
  'vendor',
  '.idea',
  '.vscode',
  '.git',
  '.gradle',
  '.next',
  '.nuxt',
  '.cache',
  '.workbuddy-ai',
  'logs',
  '.mvn',
  '.settings',
]);

export interface ScannedProject extends Project {
  /** 同一项目的全部本地副本 */
  paths: string[];
  worktreeCount: number;
}

export interface ScanResult {
  projects: ScannedProject[];
  roots: string[];
  scannedDirs: number;
  errors: Array<{ path: string; message: string }>;
  scannedAt: string;
  durationMs: number;
}

export function projectId(remoteKey: string): string {
  return `p_${createHash('sha256').update(remoteKey).digest('hex').slice(0, 10)}`;
}

/**
 * 直接读 `.git/config` 拿 origin，比 `git remote get-url` 快一个数量级：
 * 21 个仓库逐个子进程要 10 秒，读文件只要几十毫秒。
 * worktree（`.git` 是文件）与解析失败的情况回落到 git 命令。
 */
function originFromConfig(dir: string): string | null {
  try {
    const gitEntry = join(dir, '.git');
    if (!statSync(gitEntry).isDirectory()) return null;
    const text = readFileSync(join(gitEntry, 'config'), 'utf8');
    const section = text.split(/^\[/m).find((s) => s.startsWith('remote "origin"'));
    if (!section) return null;
    const url = /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1]?.trim();
    return url || null;
  } catch {
    return null;
  }
}

export async function scanRoots(roots: string[], depth: number, git: GitExecutor): Promise<ScanResult> {
  const started = Date.now();
  const scannedAt = new Date().toISOString();
  let scannedDirs = 0;
  const errors: Array<{ path: string; message: string }> = [];
  const byRemote = new Map<string, ScannedProject>();
  const seenPaths = new Set<string>();

  const visit = async (dir: string, level: number): Promise<void> => {
    if (seenPaths.has(dir)) return;
    seenPaths.add(dir);
    scannedDirs += 1;
    const gitEntry = join(dir, '.git');
    if (existsSync(gitEntry)) {
      let isWorktree = false;
      try {
        isWorktree = statSync(gitEntry).isFile();
      } catch {
        isWorktree = false;
      }
      try {
        const remote = originFromConfig(dir) ?? (await git.remoteUrl(dir));
        if (!remote) {
          // 容器目录（如工作区根目录）本身也可能是仓库，只记录提示并继续向下发现
          errors.push({ path: dir, message: '未配置 origin remote，已跳过该目录' });
        } else {
          const key = normalizeRemoteUrl(remote);
          const parsed = parseRemoteUrl(remote);
          const existing = byRemote.get(key);
          if (existing) {
            existing.paths.push(dir);
            if (isWorktree) existing.worktreeCount += 1;
          } else {
            byRemote.set(key, {
              id: projectId(key),
              name: parsed?.name ?? basename(dir),
              namespace: parsed?.namespace ?? basename(resolve(dir, '..')),
              remoteUrl: remote,
              localPath: dir,
              gitlabPath: parsed?.path ?? `${basename(resolve(dir, '..'))}/${basename(dir)}`,
              defaultTarget: null,
              enabled: true,
              source: 'scan',
              paths: [dir],
              worktreeCount: isWorktree ? 1 : 0,
            });
          }
        }
      } catch (e) {
        errors.push({ path: dir, message: e instanceof Error ? e.message : String(e) });
      }
      // 不在此 return：目录可能既是仓库又是子项目容器，继续向下扫描
    }
    if (level >= depth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (e) {
      errors.push({ path: dir, message: e instanceof Error ? e.message : String(e) });
      return;
    }
    for (const name of entries) {
      if (IGNORED.has(name) || name.startsWith('.')) continue;
      const child = join(dir, name);
      try {
        if (!statSync(child).isDirectory()) continue;
      } catch {
        continue;
      }
      await visit(child, level + 1);
    }
  };

  for (const root of roots) {
    if (!existsSync(root)) {
      errors.push({ path: root, message: '根目录不存在' });
      continue;
    }
    await visit(resolve(root), 0);
  }

  return {
    projects: [...byRemote.values()],
    roots,
    scannedDirs,
    errors,
    scannedAt,
    durationMs: Date.now() - started,
  };
}
