/**
 * 远端分支 SHA 的持久缓存。
 *
 * 预检最贵的一步是「问远端这个分支现在指向哪个提交」：自建 GitLab 单次
 * `ls-remote` 要 4–10 秒，十几个项目即使并发也要二三十秒。但这些 SHA 在
 * 几十秒内几乎不会变，所以把结论落盘，下一次预检直接命中。
 *
 * 缓存只是加速手段，执行前仍会重新核对远端（见 executeItem 的 SHA 校验），
 * 因此过期数据不会导致错误合并。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface HeadEntry {
  /** 记录时间（毫秒时间戳） */
  at: number;
  /** 分支 SHA；null 表示当时确认「该分支不存在」 */
  sha: string | null;
}

/** 超过这个时间的条目在加载时直接丢弃，避免文件无限膨胀 */
const MAX_AGE_MS = 7 * 24 * 3600_000;
const MAX_ENTRIES = 5000;
const FLUSH_DELAY_MS = 300;

export type WarnFn = (message: string, detail?: Record<string, unknown>) => void;

export class HeadCacheStore {
  private entries = new Map<string, HeadEntry>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string,
    private readonly warn: WarnFn = () => {},
  ) {}

  load(): void {
    try {
      if (!existsSync(this.file)) return;
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, HeadEntry>;
      const cutoff = Date.now() - MAX_AGE_MS;
      for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value.at === 'number' && value.at > cutoff) {
          this.entries.set(key, { at: value.at, sha: value.sha ?? null });
        }
      }
    } catch (e) {
      this.warn('分支缓存读取失败，按空缓存处理', {
        file: this.file,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(projectId: string, ref: string): HeadEntry | undefined {
    return this.entries.get(key(projectId, ref));
  }

  set(projectId: string, ref: string, sha: string | null, at = Date.now()): void {
    this.entries.set(key(projectId, ref), { at, sha });
    if (this.entries.size > MAX_ENTRIES) {
      // 简单淘汰：按时间排序丢掉最旧的一批
      const sorted = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [k] of sorted.slice(0, sorted.length - MAX_ENTRIES)) this.entries.delete(k);
    }
    this.scheduleFlush();
  }

  clear(): void {
    this.entries.clear();
    this.flush();
  }

  /** 立即落盘（进程退出或测试时用） */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)), 'utf8');
      renameSync(tmp, this.file);
    } catch (e) {
      this.warn('分支缓存写入失败', {
        file: this.file,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
    this.timer.unref?.();
  }
}

function key(projectId: string, ref: string): string {
  return `${projectId}|${ref}`;
}
