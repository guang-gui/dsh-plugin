/**
 * 极小的 HTTP JSON 客户端：只覆盖 GitLab REST 需要的部分。
 * 用全局 fetch，不引第三方依赖，插件安装后即可用。
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${describe(status)}：${body.slice(0, 300) || '(空响应)'}`);
    this.name = 'HttpError';
  }
}

function describe(status: number): string {
  if (status === 401) return '未授权';
  if (status === 403) return '禁止访问';
  if (status === 404) return '资源不存在';
  if (status === 409) return '冲突';
  if (status === 422) return '参数无法处理';
  if (status >= 500) return '服务端错误';
  return '请求失败';
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** 分支名里可能含 `/` 和中文，GitLab 要求整段 URL 编码 */
export function encodeBranch(branch: string): string {
  return encodeURIComponent(branch);
}

export interface JsonRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function httpJson<T>(url: string, init: JsonRequest = {}): Promise<T> {
  const timeout = init.timeoutMs ?? 20_000;
  const signals: AbortSignal[] = [AbortSignal.timeout(timeout)];
  if (init.signal) signals.push(init.signal);
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`请求超时（${timeout}ms）：${url}`);
    }
    throw new Error(`无法连接 ${url}：${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await response.text();
  if (!response.ok) throw new HttpError(response.status, text, url);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`响应不是合法 JSON：${url}`);
  }
}
