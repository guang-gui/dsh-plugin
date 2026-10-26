/**
 * 子进程封装：只接受参数数组，不拼接 shell 字符串，避免注入。
 * 超时与取消都会杀掉整个进程树（Windows 上 git 会再拉起子进程）。
 */
import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class ProcessStartError extends Error {
  constructor(
    readonly file: string,
    cause: unknown,
  ) {
    super(`无法启动进程 ${file}：${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ProcessStartError';
  }
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).unref();
    } catch {
      /* 忽略：进程可能已经退出 */
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* 忽略 */
    }
  }
}

export function run(file: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { cwd, timeoutMs = 120_000, env, signal } = opts;
  return new Promise<RunResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, {
        cwd,
        windowsHide: true,
        // POSIX 下建独立进程组，方便整组杀掉
        detached: process.platform !== 'win32',
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      reject(new ProcessStartError(file, e));
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    timer.unref?.();

    const onAbort = (): void => {
      killTree(child.pid);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    // 输出上限：防止超大仓库的 ls-remote 把内存吃光
    const LIMIT = 8 * 1024 * 1024;
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < LIMIT) stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < LIMIT) stderr += chunk;
    });

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new ProcessStartError(file, e));
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}
