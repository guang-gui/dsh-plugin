/**
 * 发版面板（浏览器端整页组件）。
 *
 * 直接调用宿主插件已暴露的 `/release-ui/api/*` 接口，与独立页面、对话工具
 * 共用同一套服务；组件本身不持有任何 Git/GitLab 逻辑。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* 类型（与宿主接口的返回结构对应）                                     */
/* ------------------------------------------------------------------ */

interface ProjectRow {
  id: string;
  name: string;
  namespace: string;
  gitlabPath: string;
  localPath: string | null;
  defaultTarget: string | null;
  enabled: boolean;
}

interface CheckRow {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'skipped';
  detail?: string;
}

interface PlanItem {
  projectId: string;
  name: string;
  ahead: number | null;
  behind: number | null;
  checks: CheckRow[];
  blockers: string[];
  warnings: string[];
  mr: { iid: number; url: string; mergeStatus: string } | null;
  executable: boolean;
  noop: boolean;
}

interface PlanSummary {
  total: number;
  executable: number;
  blocked?: number;
  noop?: number;
}

interface MergePlan {
  id: string;
  hash: string;
  mode: string;
  sourceBranch: string;
  targetBranch: string;
  items: PlanItem[];
  summary: PlanSummary;
  checkDurationMs: number;
  expiresAt: string;
}

interface ApplyResult {
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: Array<{ project: string; ok: boolean; message: string; url?: string }>;
}

interface MrsView {
  total: number;
  conflicts: number;
  checking: number;
  mrs: Array<{ project: string; mr: { iid: number; url: string; title: string; mergeStatus: string; pipeline: string; detail?: string } }>;
}

interface BranchHit {
  project: string;
  branch: string;
  sha: string | null;
}

/* ------------------------------------------------------------------ */
/* 样式                                                                */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'dsh-plugin-release-style';

const STYLE = `
.rel-page { height: 100%; overflow: auto; padding: 24px 28px 64px; font-family: var(--dsw-font-family); color: var(--dsw-alias-label-primary); }
.rel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.rel-head h1 { font-size: 16px; font-weight: 500; margin: 0; }
.rel-status { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.rel-card { background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-lg); padding: 18px 20px; margin-bottom: 16px; }
.rel-card h2 { font-size: 14px; font-weight: 500; margin: 0 0 14px; }
.rel-grid { display: grid; grid-template-columns: 88px 1fr; gap: 10px 14px; align-items: start; }
.rel-grid > label { color: var(--dsw-alias-label-tertiary); font-size: 13px; padding-top: 7px; }
.rel-input, .rel-select, .rel-textarea { width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.rel-input:focus, .rel-select:focus, .rel-textarea:focus { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
.rel-textarea { resize: vertical; }
.rel-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 4px; }
.rel-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 160px; overflow: auto; padding: 2px; }
.rel-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 999px; background: var(--dsw-alias-bg-base); cursor: pointer; font-size: 13px; user-select: none; }
.rel-chip.off { opacity: .5; }
.rel-chip input { margin: 0; }
.rel-actions { display: flex; gap: 10px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
.rel-btn { padding: 7px 18px; border-radius: var(--dsw-radius-md); border: 1px solid transparent; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
.rel-btn.secondary { background: transparent; color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-settings-card-stroke); }
.rel-btn:disabled { opacity: .5; cursor: default; }
.rel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rel-table th, .rel-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-settings-card-stroke); vertical-align: top; }
.rel-table th { color: var(--dsw-alias-label-tertiary); font-weight: 400; white-space: nowrap; }
.rel-table tr:last-child td { border-bottom: 0; }
.rel-tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap; margin-right: 4px; }
.rel-tag.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); color: var(--dsw-alias-state-success-primary); }
.rel-tag.warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent); color: var(--dsw-alias-state-warn-label); }
.rel-tag.bad { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); color: var(--dsw-alias-state-error-primary); }
.rel-tag.plain { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-tertiary); }
.rel-summary { display: flex; flex-wrap: wrap; gap: 18px; color: var(--dsw-alias-label-tertiary); font-size: 13px; margin-bottom: 12px; }
.rel-summary b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.rel-muted { color: var(--dsw-alias-label-tertiary); }
.rel-link { color: var(--dsw-alias-link); text-decoration: none; }
.rel-link:hover { text-decoration: underline; }
.rel-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); padding: 8px 18px; border-radius: 999px; font-size: 13px; z-index: 50; }
.rel-scroll { overflow: auto; }
`;

/* ------------------------------------------------------------------ */
/* 接口调用                                                            */
/* ------------------------------------------------------------------ */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/release-ui/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json' },
  });
  const raw = await response.text();
  const value = raw ? (JSON.parse(raw) as unknown) : null;
  if (!response.ok) {
    const message = value !== null && typeof value === 'object' && 'error' in value
      ? String((value as { error: unknown }).error)
      : `请求失败 HTTP ${String(response.status)}`;
    throw new Error(message);
  }
  return value as T;
}

/* ------------------------------------------------------------------ */
/* 小组件                                                              */
/* ------------------------------------------------------------------ */

function Tag({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'plain'; children: ReactNode }) {
  return <span className={`rel-tag ${tone}`}>{children}</span>;
}

function planTone(item: PlanItem): 'ok' | 'bad' | 'plain' {
  if (item.noop) return 'plain';
  return item.executable ? 'ok' : 'bad';
}

const MR_LABEL: Record<string, [string, 'ok' | 'warn' | 'bad' | 'plain']> = {
  mergeable: ['可合并', 'ok'],
  conflict: ['有冲突', 'bad'],
  'not-approved': ['待审批', 'warn'],
  'ci-failed': ['CI 未通过', 'bad'],
  blocked: ['不可合并', 'bad'],
  checking: ['计算中', 'plain'],
  unknown: ['未知', 'plain'],
};

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

export function ReleasePage(): ReactElement {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState('create-mr');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [mrs, setMrs] = useState<MrsView | null>(null);
  const [branchHits, setBranchHits] = useState<BranchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在加载…');
  const [hint, setHint] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    if (document.getElementById(STYLE_ID) !== null) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.plugin = 'dsh-plugin-release';
    style.textContent = STYLE;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const loadProjects = useCallback(async (refresh: boolean) => {
    setBusy(true);
    setHint(refresh ? '正在扫描本地仓库…' : '');
    try {
      const value = await api<{ total: number; enabled: number; roots: string[]; projects: ProjectRow[] }>(
        `/projects${refresh ? '?refresh=1' : ''}`,
      );
      setProjects(value.projects);
      setStatus(`共 ${String(value.total)} 个仓库，启用 ${String(value.enabled)} 个 · 根目录 ${value.roots.join('、') || '未配置'}`);
    } catch (error) {
      setStatus(`加载失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
      setHint('');
    }
  }, []);

  useEffect(() => { void loadProjects(false); }, [loadProjects]);

  const selectedIds = useMemo(
    () => projects.filter((p) => p.enabled && selected[p.id] !== false).map((p) => p.id),
    [projects, selected],
  );

  const doCheck = useCallback(async () => {
    if (!source.trim()) { notify('请先填源分支'); return; }
    setBusy(true);
    setHint('预检中，仓库多时需要一点时间…');
    setPlan(null);
    setApplied(null);
    try {
      const value = await api<MergePlan>('/check', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          sourceBranch: source.trim(),
          targetBranch: target.trim() || undefined,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          projects: selectedIds.length ? selectedIds : undefined,
        }),
      });
      setPlan(value);
      notify('预检完成');
    } catch (error) {
      notify(`预检失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
      setHint('');
    }
  }, [source, mode, target, title, description, selectedIds, notify]);

  const doApply = useCallback(async () => {
    if (plan === null) return;
    const executable = plan.summary.executable;
    if (!executable) { notify('没有可执行的仓库'); return; }
    if (!window.confirm(`确认对 ${String(executable)} 个仓库执行「${plan.mode}」？此操作会写远端。`)) return;
    setBusy(true);
    setHint('执行中…');
    try {
      const value = await api<ApplyResult>('/apply', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id, planHash: plan.hash }),
      });
      setApplied(value);
      notify(`执行完成：成功 ${String(value.succeeded)}，失败 ${String(value.failed)}`);
      void loadMrs();
    } catch (error) {
      notify(`执行失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
      setHint('');
    }
  }, [plan, notify]);

  const loadMrs = useCallback(async () => {
    try {
      const value = await api<MrsView>('/mrs');
      setMrs(value);
    } catch (error) {
      setMrs(null);
      notify(`MR 状态：${(error as Error).message}`);
    }
  }, [notify]);

  const doBranches = useCallback(async () => {
    setBusy(true);
    setHint('搜索分支…');
    try {
      const value = await api<{ matches: BranchHit[] }>(`/branches?keyword=${encodeURIComponent(source.trim())}`);
      setBranchHits(value.matches);
      if (!value.matches.length) notify('没有匹配的分支');
    } catch (error) {
      setBranchHits([]);
      notify(`搜索失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
      setHint('');
    }
  }, [source, notify]);

  const branchGroups = useMemo(() => {
    if (branchHits === null) return null;
    const groups = new Map<string, string[]>();
    for (const hit of branchHits) {
      const list = groups.get(hit.branch) ?? [];
      list.push(hit.project);
      groups.set(hit.branch, list);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [branchHits]);

  return (
    <div className="rel-page">
      <div className="rel-head">
        <h1>批量发版</h1>
        <span className="rel-status">{status}</span>
      </div>

      <div className="rel-card">
        <h2>发版参数</h2>
        <div className="rel-grid">
          <label>模式</label>
          <select className="rel-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="create-mr">只建 MR（合并留给 GitLab）</option>
            <option value="merge-mr">在 GitLab 合并 MR</option>
            <option value="merge-git">本地合并后推送</option>
          </select>

          <label>源分支</label>
          <div>
            <input
              className="rel-input"
              value={source}
              placeholder="例如 release/20261022"
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void doCheck(); }}
            />
            <div className="rel-hint">输入后可点「搜分支」确认哪些仓库有这条分支</div>
          </div>

          <label>目标分支</label>
          <input
            className="rel-input"
            value={target}
            placeholder="留空 = 各仓库默认（通常是 master）"
            onChange={(e) => setTarget(e.target.value)}
          />

          <label>标题</label>
          <input
            className="rel-input"
            value={title}
            placeholder="MR 标题 / 合并提交信息，留空自动生成"
            onChange={(e) => setTitle(e.target.value)}
          />

          <label>说明</label>
          <textarea
            className="rel-textarea"
            rows={2}
            value={description}
            placeholder="MR 说明 / 合并提交正文（可选）"
            onChange={(e) => setDescription(e.target.value)}
          />

          <label>仓库</label>
          <div>
            <div className="rel-chips">
              {projects.length === 0
                ? <span className="rel-muted">没有可用仓库，请检查插件配置的 roots</span>
                : projects.map((project) => {
                  const checked = selected[project.id] !== false;
                  return (
                    <label key={project.id} className={`rel-chip${checked ? '' : ' off'}`} title={project.defaultTarget ? `${project.name} · 默认目标 ${project.defaultTarget}` : project.name}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [project.id]: e.target.checked }))}
                      />
                      {project.name}
                    </label>
                  );
                })}
            </div>
            <div className="rel-hint">
              共 {projects.length} 个仓库（启用 {projects.filter((p) => p.enabled).length} 个）；不勾选则只处理勾选的
            </div>
          </div>
        </div>

        <div className="rel-actions">
          <button className="rel-btn" disabled={busy} onClick={() => void doCheck()}>预检</button>
          <button className="rel-btn secondary" disabled={busy} onClick={() => void doBranches()}>搜分支</button>
          <button className="rel-btn secondary" disabled={busy} onClick={() => void loadProjects(true)}>重新扫描仓库</button>
          <span className="rel-hint">{hint}</span>
        </div>
      </div>

      {branchGroups !== null && (
        <div className="rel-card">
          <h2>分支搜索结果</h2>
          {branchGroups.length === 0
            ? <span className="rel-muted">没有匹配的分支</span>
            : (
              <div className="rel-scroll">
                <table className="rel-table">
                  <thead><tr><th>分支</th><th>仓库</th></tr></thead>
                  <tbody>
                    {branchGroups.map(([branch, names]) => (
                      <tr key={branch}>
                        <td>{branch}</td>
                        <td>{names.join('、')}（{names.length}）</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {plan !== null && (
        <div className="rel-card">
          <h2>预检结果</h2>
          <div className="rel-summary">
            <span>仓库 <b>{plan.summary.total}</b></span>
            <span>可执行 <b>{plan.summary.executable}</b></span>
            <span>无变化 <b>{plan.summary.noop ?? 0}</b></span>
            <span>阻塞 <b>{plan.summary.blocked ?? plan.summary.total - plan.summary.executable}</b></span>
            <span>预检用时 <b>{plan.checkDurationMs}ms</b></span>
            <span className="rel-muted">计划 {plan.id.slice(0, 8)}… 有效至 {new Date(plan.expiresAt).toLocaleTimeString()}</span>
          </div>
          <div className="rel-scroll">
            <table className="rel-table">
              <thead>
                <tr><th>仓库</th><th>结果</th><th>提交</th><th>MR</th><th>说明</th></tr>
              </thead>
              <tbody>
                {plan.items.map((item) => (
                  <tr key={item.projectId}>
                    <td>{item.name}</td>
                    <td><Tag tone={planTone(item)}>{item.noop ? '无变化' : item.executable ? '可执行' : '阻塞'}</Tag></td>
                    <td>{item.ahead ?? '?'} ↑ / {item.behind ?? '?'} ↓</td>
                    <td>
                      {item.mr === null
                        ? <span className="rel-muted">—</span>
                        : <a className="rel-link" href={item.mr.url} target="_blank" rel="noreferrer">!{item.mr.iid}</a>}
                    </td>
                    <td>
                      {item.blockers.map((text) => <Tag key={text} tone="bad">{text}</Tag>)}
                      {item.warnings.map((text) => <Tag key={text} tone="warn">{text}</Tag>)}
                      {item.checks.filter((c) => c.status === 'fail').map((c) => (
                        <Tag key={c.id} tone="bad">{c.label}{c.detail ? `：${c.detail}` : ''}</Tag>
                      ))}
                      {item.checks.filter((c) => c.status === 'warn').map((c) => (
                        <Tag key={c.id} tone="warn">{c.label}{c.detail ? `：${c.detail}` : ''}</Tag>
                      ))}
                      {item.blockers.length + item.warnings.length + item.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length === 0
                        && <span className="rel-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rel-actions">
            <button className="rel-btn" disabled={busy || !plan.summary.executable} onClick={() => void doApply()}>确认执行</button>
            <span className="rel-hint">
              {plan.summary.executable ? `将处理 ${String(plan.summary.executable)} 个仓库，10 分钟内有效` : '没有可执行的仓库'}
            </span>
          </div>
        </div>
      )}

      {applied !== null && (
        <div className="rel-card">
          <h2>执行结果</h2>
          <div className="rel-summary">
            <span>成功 <b>{applied.succeeded}</b></span>
            <span>失败 <b>{applied.failed}</b></span>
            <span>跳过 <b>{applied.skipped}</b></span>
            <span>用时 <b>{applied.durationMs}ms</b></span>
          </div>
          <div className="rel-scroll">
            <table className="rel-table">
              <thead><tr><th>仓库</th><th>结果</th><th>说明</th></tr></thead>
              <tbody>
                {applied.results.map((row) => (
                  <tr key={row.project}>
                    <td>{row.project}</td>
                    <td><Tag tone={row.ok ? 'ok' : 'bad'}>{row.ok ? '成功' : '失败'}</Tag></td>
                    <td>
                      {row.message}
                      {row.url ? <> · <a className="rel-link" href={row.url} target="_blank" rel="noreferrer">打开</a></> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mrs !== null && (
        <div className="rel-card">
          <h2>MR 状态</h2>
          <div className="rel-summary">
            <span>MR <b>{mrs.total}</b></span>
            <span>冲突 <b>{mrs.conflicts}</b></span>
            <span>计算中 <b>{mrs.checking}</b></span>
          </div>
          <div className="rel-scroll">
            <table className="rel-table">
              <thead><tr><th>仓库</th><th>MR</th><th>状态</th><th>流水线</th></tr></thead>
              <tbody>
                {mrs.mrs.map((row) => {
                  const label = MR_LABEL[row.mr.mergeStatus] ?? [row.mr.mergeStatus, 'plain'];
                  return (
                    <tr key={row.project}>
                      <td>{row.project}</td>
                      <td><a className="rel-link" href={row.mr.url} target="_blank" rel="noreferrer">!{row.mr.iid} {row.mr.title}</a></td>
                      <td>
                        <Tag tone={label[1]}>{label[0]}</Tag>
                        {row.mr.detail ? <span className="rel-muted">{row.mr.detail}</span> : null}
                      </td>
                      <td>{row.mr.pipeline}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rel-actions">
            <button className="rel-btn secondary" disabled={busy} onClick={() => void loadMrs()}>刷新状态</button>
          </div>
        </div>
      )}

      {toast !== '' && <div className="rel-toast">{toast}</div>}
    </div>
  );
}
