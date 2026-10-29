import { useEffect, useState } from 'react';
import type { DirListing, SettingsPatch } from '../settings.js';
import type { GitLabTestResult, SaveResult, SettingsView } from '../web.js';
import { api } from './api.js';

export function SettingsPanel({ onSaved }: { onSaved(): void }) {
  const [form, setForm] = useState<SettingsView | null>(null);
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [path, setPath] = useState('');
  const [dirs, setDirs] = useState<DirListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [test, setTest] = useState<GitLabTestResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<SettingsView>('/settings', { signal: controller.signal }).then(setForm).catch((e: Error) => {
      if (!controller.signal.aborted) setMessage(e.message);
    });
    return () => controller.abort();
  }, []);
  const change = <K extends keyof SettingsView>(key: K, value: SettingsView[K]) => setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  const browse = async (next: string) => {
    setMessage('');
    try { const value = await api<DirListing>(`/settings/dirs?path=${encodeURIComponent(next)}`); setDirs(value); setPath(value.path); }
    catch (e) { setMessage((e as Error).message); }
  };
  const addRoot = (next: string) => { if (form && next.trim()) change('roots', [...new Set([...form.roots, next.trim()])]); };
  const save = async () => {
    if (!form) return;
    setBusy(true); setMessage('');
    const patch: SettingsPatch = {
      gitlabBaseUrl: form.gitlabBaseUrl, gitlabAccount: form.gitlabAccount, tokenEnv: form.tokenEnv,
      roots: form.roots, scanDepth: form.scanDepth, defaultTarget: form.defaultTarget,
      concurrency: form.concurrency, headCacheTtlSec: form.headCacheTtlSec,
      mergeStrategy: form.mergeStrategy, deleteSourceBranch: form.deleteSourceBranch,
      ...(clearToken ? { gitlabToken: '' } : token.trim() ? { gitlabToken: token.trim() } : {}),
    };
    try {
      const result = await api<SaveResult>('/settings', { method: 'POST', body: JSON.stringify(patch) });
      if (!result.ok) { setMessage(result.errors.join('；')); return; }
      setForm(result.settings); setToken(''); setClearToken(false);
      setMessage(`设置已保存并生效${result.rescan ? `，发现 ${result.rescan.total} 个仓库` : ''}${result.warnings.length ? `。${result.warnings.join('；')}` : ''}`);
      onSaved();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  const testConnection = async () => {
    if (!form) return;
    setBusy(true); setTest(null);
    try {
      const result = await api<GitLabTestResult>('/settings/test', { method: 'POST', body: JSON.stringify({
        gitlabBaseUrl: form.gitlabBaseUrl, ...(token.trim() ? { gitlabToken: token.trim() } : {}),
      }) });
      setTest(result);
      if (result.ok && result.account) change('gitlabAccount', result.account);
    } catch (e) { setTest({ ok: false, ms: 0, error: (e as Error).message }); }
    finally { setBusy(false); }
  };
  if (!form) return <div className="rel-card" role="status">{message || '正在读取设置…'}</div>;
  return <section id="settingsCard" aria-label="发版设置"><fieldset disabled={busy} className="rel-settings-fields">
    <div className="rel-card"><h2>GitLab 连接</h2><p className="rel-hint">配置地址和个人访问令牌，测试后自动识别账号。保存后立即生效。</p>
      <div className="rel-grid">
        <label htmlFor="rel-url">GitLab 地址</label><input id="rel-url" className="rel-input" value={form.gitlabBaseUrl} placeholder="https://git.example.com" onChange={(e) => change('gitlabBaseUrl', e.target.value)} />
        <label htmlFor="rel-account">账号</label><input id="rel-account" className="rel-input" value={form.gitlabAccount ?? ''} placeholder="账号名称，测试连接后自动识别" onChange={(e) => change('gitlabAccount', e.target.value)} />
        <label htmlFor="rel-token">访问令牌</label><div><input id="rel-token" className="rel-input" type="password" autoComplete="new-password" value={token} onChange={(e) => { setToken(e.target.value); setClearToken(false); }} placeholder={form.tokenSet ? `已配置 ${form.tokenHint}，留空保留` : '填写 Personal Access Token（api 权限）'} />
          <div className="rel-hint">{form.tokenSource === 'env' ? `使用环境变量 ${form.tokenEnv}` : form.tokenSet ? `已保存 ${form.tokenHint}` : '尚未配置令牌'} · 接口不返回明文</div>
          <label className="rel-hint"><input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} /> 清除已保存令牌，使用环境变量</label></div>
        <label htmlFor="rel-env">环境变量</label><input id="rel-env" className="rel-input" value={form.tokenEnv} onChange={(e) => change('tokenEnv', e.target.value)} />
      </div>
      <div className="rel-actions"><button className="rel-btn secondary" disabled={busy || clearToken} onClick={() => void testConnection()}>测试 GitLab 连接</button>
        {test && <span role="status" className={test.ok ? 'rel-success' : 'rel-error'}>{test.ok ? `连接成功 · ${test.account ?? 'GitLab'} · ${test.ms}ms${test.note ? ` · ${test.note}` : ''}` : test.error}</span>}
      </div>
    </div>
    <div className="rel-card"><h2>扫描目录</h2><p className="rel-hint">添加项目所在的父目录。保存后自动重新扫描，也可以逐级浏览目录。</p>
      <div className="rel-root-list">{form.roots.map((root) => <div className="rel-root" key={root}><code>{root}</code><button type="button" className="rel-text-btn" onClick={() => change('roots', form.roots.filter((r) => r !== root))} aria-label={`移除 ${root}`}>移除</button></div>)}</div>
      <div className="rel-inline"><input className="rel-input" aria-label="扫描目录路径" value={path} placeholder="例如 D:\\xls-code" onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void browse(path); } }} />
        <button className="rel-btn secondary" onClick={() => void browse(path)}>浏览目录</button><button className="rel-btn secondary" disabled={!path.trim()} onClick={() => addRoot(path)}>添加目录</button></div>
      {dirs && <div className="rel-browser"><div className="rel-inline"><code>{dirs.path}</code>{dirs.parent && <button className="rel-text-btn" onClick={() => void browse(dirs.parent!)}>上一级</button>}<button className="rel-text-btn" onClick={() => addRoot(dirs.path)}>添加当前目录</button></div>
        {dirs.error && <p className="rel-error">{dirs.error}</p>}
        {dirs.entries.map((dir) => <button key={dir.path} className="rel-dir" onClick={() => void browse(dir.path)}><span>▸ {dir.name}</span><small>{dir.isRepo ? 'Git 仓库' : '目录'}</small></button>)}
        {!dirs.entries.length && !dirs.error && <p className="rel-hint">没有子目录</p>}
      </div>}
    </div>
    <div className="rel-card"><h2>发版与性能</h2><div className="rel-grid">
      <label htmlFor="rel-depth">扫描深度</label><input id="rel-depth" className="rel-input" type="number" min={1} max={8} value={form.scanDepth} onChange={(e) => change('scanDepth', Number(e.target.value))} />
      <label htmlFor="rel-default">默认目标分支</label><input id="rel-default" className="rel-input" value={form.defaultTarget} onChange={(e) => change('defaultTarget', e.target.value)} />
      <label htmlFor="rel-concurrency">并发数</label><input id="rel-concurrency" className="rel-input" type="number" min={1} max={16} value={form.concurrency} onChange={(e) => change('concurrency', Number(e.target.value))} />
      <label htmlFor="rel-ttl">缓存有效期 / 秒</label><input id="rel-ttl" className="rel-input" type="number" min={0} max={86400} value={form.headCacheTtlSec} onChange={(e) => change('headCacheTtlSec', Number(e.target.value))} />
      <label htmlFor="rel-strategy">合并策略</label><select id="rel-strategy" className="rel-select" value={form.mergeStrategy} onChange={(e) => change('mergeStrategy', e.target.value as SettingsView['mergeStrategy'])}><option value="merge">普通合并</option><option value="ff-only">仅快进</option><option value="no-ff">总是创建合并提交</option></select>
      <span /><label><input type="checkbox" checked={form.deleteSourceBranch} onChange={(e) => change('deleteSourceBranch', e.target.checked)} /> 合并后删除源分支</label>
    </div></div>
    </fieldset><div className="rel-save"><button id="saveBtn" className="rel-btn" disabled={busy} onClick={() => void save()}>{busy ? '处理中…' : '保存设置'}</button><span role="status">{message}</span></div>
  </section>;
}
