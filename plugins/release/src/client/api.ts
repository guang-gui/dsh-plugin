export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/release-ui/api${path}`, {
    ...init, headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const raw = await response.text();
  let value: unknown;
  try { value = raw ? JSON.parse(raw) : null; }
  catch { throw new Error(`接口返回异常（HTTP ${response.status}），请检查插件是否已加载`); }
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value
    ? String(value.error) : `请求失败 HTTP ${response.status}`);
  return value as T;
}
