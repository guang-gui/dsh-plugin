/**
 * 发版面板（浏览器端整页组件）。
 *
 * 直接调用宿主插件已暴露的 `/release-ui/api/*` 接口，与独立页面、对话工具
 * 共用同一套服务；组件本身不持有任何 Git/GitLab 逻辑。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { api } from './api.js';
import { BranchInput } from './BranchInput.js';
import { BranchCreatePanel } from './BranchCreatePanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { TasksPanel } from './TasksPanel.js';
import type { BranchOption } from '../branch-catalog.js';
import type { SettingsView } from '../web.js';

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
  status: 'ok' | 'warn' | 'danger' | 'unknown' | 'skipped';
  detail?: string;
}

interface PlanItem {
  projectId: string;
  name: string;
  sourceSha: string | null;
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
  results: Array<{ projectId: string; name: string; ok: boolean; message: string; url?: string }>;
}

interface MrsView {
  total: number;
  conflicts: number;
  checking: number;
  mrs: Array<{ project: string; mr: { iid: number; url: string; title: string; mergeStatus: string; pipeline: string; detail?: string } }>;
}

interface CatalogView {
  options: BranchOption[];
  totalProjects: number;
  remoteProjects: number;
  loading: boolean;
  errors: Array<{ project: string; message: string }>;
}

function sourceBranchOrder(item: PlanItem): number {
  if (item.sourceSha) return 0;
  return item.checks.some((check) => check.id === 'source-exists' && check.status === 'danger') ? 2 : 1;
}

/* ------------------------------------------------------------------ */
/* 样式                                                                */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'dsh-plugin-release-style';

const STYLE = `
.rel-page { height: 100%; overflow: auto; box-sizing: border-box; padding: 24px 28px 64px; font-family: var(--dsw-font-family, 'Segoe UI', 'Microsoft YaHei', sans-serif); color: var(--dsw-alias-label-primary); }
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
.rel-shell { display: grid; grid-template-columns: 148px minmax(0, 1fr); height: 100%; background: var(--dsw-alias-bg-base); }
.rel-nav { padding: 24px 12px; border-right: 1px solid var(--dsw-alias-settings-card-stroke); }
.rel-brand { padding: 4px 12px 22px; font-size: 11px; letter-spacing: .16em; color: var(--dsw-alias-label-tertiary); }
.rel-nav button { display: block; text-align: left; width: 100%; padding: 10px 12px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; margin-bottom: 5px; }
.rel-nav button[aria-current=page] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); color: var(--dsw-alias-state-business-primary); font-weight: 600; }
.rel-nav button:disabled { opacity: .5; cursor: default; }
.rel-content { max-width: 1160px; margin: 0 auto; }
.rel-head h1 { font-size: 20px; font-weight: 600; }
.rel-head { align-items: center; }
.rel-head > .rel-btn { flex: none; white-space: nowrap; }
.rel-head .rel-status { margin-top: 7px; display: block; line-height: 1.6; }
.rel-combo { position: relative; }
.rel-dropdown { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 10px; box-shadow: 0 10px 30px #0002; overflow: hidden; }
.rel-dropdown-title, .rel-dropdown-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.rel-options { max-height: 270px; overflow-y: auto; }
.rel-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left; padding: 9px 12px; border: 0; background: transparent; color: inherit; cursor: pointer; }
.rel-option.active { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); }
.rel-option span { overflow-wrap: anywhere; }
.rel-option small { white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
.rel-mono, .rel-root code, .rel-browser code { font-family: Consolas, monospace; font-size: 12px; }
.rel-text-btn { background: transparent; border: 0; color: var(--dsw-alias-link); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.rel-text-btn:disabled { opacity: .5; cursor: default; }
.rel-empty { padding: 14px; color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.rel-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rel-inline .rel-input { flex: 1; min-width: 160px; }
.rel-inline .rel-btn { white-space: nowrap; }
.rel-root-list { margin-bottom: 14px; }
.rel-root { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-settings-card-stroke); overflow-wrap: anywhere; }
.rel-browser { margin-top: 12px; border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 8px; padding: 12px; max-height: 280px; overflow: auto; }
.rel-dir { display: flex; justify-content: space-between; width: 100%; border: 0; background: transparent; padding: 9px; color: inherit; cursor: pointer; text-align: left; }
.rel-dir:hover { background: var(--dsw-alias-bg-base); }
.rel-save { display: flex; align-items: center; gap: 14px; position: sticky; bottom: 0; background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-settings-card-stroke); border-radius: 10px; padding: 14px; font-size: 13px; }
.rel-settings-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.rel-error { color: var(--dsw-alias-state-error-primary); font-size: 13px; }
.rel-success { color: var(--dsw-alias-state-success-primary); font-size: 13px; }
.rel-notice { padding: 12px 16px; border-left: 3px solid var(--dsw-alias-state-business-primary); margin-bottom: 16px; background: var(--dsw-alias-bg-module-platform); font-size: 13px; }
@media (max-width: 780px) { .rel-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); } .rel-nav { padding: 8px 12px; display: flex; gap: 6px; border-right: 0; border-bottom: 1px solid var(--dsw-alias-settings-card-stroke); } .rel-brand { display: none; } .rel-nav button { width: auto; margin: 0; } .rel-page { padding: 18px 14px 40px; } .rel-grid { grid-template-columns: 1fr; gap: 6px; } .rel-card { padding: 16px; } .rel-head { align-items: flex-start; } }
`;

/* ------------------------------------------------------------------ */
/* 接口调用                                                            */
/* ------------------------------------------------------------------ */

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

export function ReleasePage({ initialTab = 'release' }: { initialTab?: 'release' | 'branches' | 'settings' | 'tasks' } = {}): ReactElement {
  const [tab, setTab] = useState(initialTab);
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);
  const forceCatalog = useRef(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState('create-mr');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const planItems = useMemo(() => [...(plan?.items ?? [])]
    .sort((a, b) => sourceBranchOrder(a) - sourceBranchOrder(b)), [plan]);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [mrs, setMrs] = useState<MrsView | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [creatingBranches, setCreatingBranches] = useState(false);
  const checkRequest = useRef<{ controller: AbortController; timer: number } | null>(null);
  const formLocked = loadingProjects || applying || creatingBranches;
  const busy = formLocked || checking;
  const [status, setStatus] = useState('正在加载…');
  const hint = applying ? '执行中…' : loadingProjects ? '正在读取仓库…'
    : checking ? '预检中，可修改参数或取消…' : '';
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
    setLoadingProjects(true);
    try {
      const value = await api<{ total: number; enabled: number; roots: string[]; projects: ProjectRow[] }>(
        `/projects${refresh ? '?refresh=1' : ''}`,
      );
      setProjects(value.projects);
      setStatus(`共 ${String(value.total)} 个仓库，启用 ${String(value.enabled)} 个 · 根目录 ${value.roots.join('、') || '未配置'}`);
    } catch (error) {
      setStatus(`加载失败：${(error as Error).message}`);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => { void loadProjects(false); }, [loadProjects]);
  const loadSettings = useCallback(async () => {
    try { setSettings(await api<SettingsView>('/settings')); }
    catch (e) { notify(`读取设置失败：${(e as Error).message}`); }
  }, [notify]);
  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    const request = checkRequest.current;
    checkRequest.current = null;
    if (request) { window.clearTimeout(request.timer); request.controller.abort(); }
  }, []);

  const projectKey = projects.map((p) => p.id).join(',');
  useEffect(() => {
    if (!projectKey) { setCatalog(null); return; }
    const controller = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      try {
        const force = forceCatalog.current; forceCatalog.current = false;
        const value = await api<CatalogView>(`/branch-options${force ? '?refresh=1' : ''}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setCatalog(value); setCatalogError('');
        if (value.loading) timer = window.setTimeout(() => void load(), 1000);
      } catch (e) { if (!controller.signal.aborted) setCatalogError(`读取失败：${(e as Error).message}`); }
    };
    void load();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [projectKey, catalogVersion]);

  const selectedIds = useMemo(
    () => projects.filter((p) => p.enabled && selected[p.id] !== false).map((p) => p.id),
    [projects, selected],
  );
  const options = useMemo(() => {
    const ids = new Set(selectedIds);
    return (catalog?.options ?? []).map((o) => ({ ...o,
      projectIds: o.projectIds.filter((id) => ids.has(id)),
      projects: o.projects.filter((_, index) => ids.has(o.projectIds[index] ?? '')),
    })).filter((o) => o.projectIds.length);
  }, [catalog, selectedIds]);
  const refreshBranches = () => { forceCatalog.current = true; setCatalogVersion((n) => n + 1); };
  const cancelCheck = useCallback(() => {
    const request = checkRequest.current;
    checkRequest.current = null;
    if (request) { window.clearTimeout(request.timer); request.controller.abort(); }
    setChecking(false);
  }, []);
  const invalidatePlan = useCallback(() => { cancelCheck(); setPlan(null); setApplied(null); setMrs(null); }, [cancelCheck]);
  const savedSettings = () => { invalidatePlan(); setCatalog(null); void loadSettings(); void loadProjects(false); setCatalogVersion((n) => n + 1); };

  useEffect(invalidatePlan, [invalidatePlan, mode, source, target, title, description, selectedIds]);

  const doCheck = useCallback(async () => {
    if (!source.trim()) { notify('请先填源分支'); return; }
    if (!selectedIds.length) { notify('请至少选择一个仓库'); return; }
    cancelCheck();
    const request = { controller: new AbortController(), timer: 0 };
    checkRequest.current = request;
    request.timer = window.setTimeout(() => {
      if (checkRequest.current !== request) return;
      cancelCheck();
      notify('预检超时，请检查连接后重试');
    }, 120_000);
    setChecking(true);
    setPlan(null);
    setApplied(null);
    setMrs(null);
    try {
      const value = await api<MergePlan>('/check', {
        method: 'POST',
        signal: request.controller.signal,
        body: JSON.stringify({
          mode,
          sourceBranch: source.trim(),
          targetBranch: target.trim() || undefined,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          projects: selectedIds,
          refresh: true,
        }),
      });
      if (checkRequest.current !== request) return;
      setPlan(value);
      notify('预检完成');
    } catch (error) {
      if (checkRequest.current === request) notify(`预检失败：${(error as Error).message}`);
    } finally {
      window.clearTimeout(request.timer);
      if (checkRequest.current === request) { checkRequest.current = null; setChecking(false); }
    }
  }, [source, mode, target, title, description, selectedIds, notify, cancelCheck]);

  const doApply = useCallback(async () => {
    if (plan === null) return;
    const executable = plan.summary.executable;
    if (!executable) { notify('没有可执行的仓库'); return; }
    if (!window.confirm(`确认对 ${String(executable)} 个仓库执行「${plan.mode}」？此操作会写远端。`)) return;
    setApplying(true);
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
      setApplying(false);
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

  return (
    <div className="rel-shell">
      <nav className="rel-nav" aria-label="发版导航"><div className="rel-brand">RELEASE DESK</div>
        <button disabled={creatingBranches || applying} aria-current={tab === 'release' ? 'page' : undefined} onClick={() => setTab('release')}>批量发版</button>
        <button disabled={creatingBranches || applying} aria-current={tab === 'branches' ? 'page' : undefined} onClick={() => { cancelCheck(); setTab('branches'); }}>批量创建分支</button>
        <button disabled={creatingBranches || applying} aria-current={tab === 'tasks' ? 'page' : undefined} onClick={() => setTab('tasks')}>任务中心</button>
        <button disabled={creatingBranches || applying} aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')}>发版设置</button>
      </nav><div className="rel-page"><div className="rel-content">
      <div className="rel-head">
        <div><h1>{tab === 'settings' ? '发版设置' : tab === 'tasks' ? '任务中心' : tab === 'branches' ? '批量创建分支' : '批量发版'}</h1>
        <span className="rel-status">{status}</span></div>
        <button className="rel-btn secondary" disabled={creatingBranches || applying} onClick={() => setTab(tab === 'settings' ? 'release' : 'settings')}>{tab === 'settings' ? '返回发版' : '设置'}</button>
      </div>

      {tab === 'settings' && <SettingsPanel onSaved={savedSettings} />}
      {tab === 'tasks' && <TasksPanel onReuse={(task) => { setMode(task.mode); setSource(task.sourceBranch); setTarget(task.targetBranch); setTitle(task.title ?? ''); setSelected(Object.fromEntries(projects.map((p) => [p.id, task.results.some((r) => r.projectId === p.id)]))); invalidatePlan(); setTab('release'); }} />}
      <div hidden={tab !== 'branches'}><BranchCreatePanel projects={projects} gitlabReady={settings?.gitlabReady ?? false}
        loading={loadingProjects || applying} onBusyChange={(value) => { setCreatingBranches(value); if (value) invalidatePlan(); }} onCreated={refreshBranches} /></div>
      {tab === 'release' && <>
      {settings && (!settings.gitlabReady || !settings.roots.length) && <div className="rel-notice">{!settings.roots.length ? '请先添加扫描目录，发现本地仓库。' : 'GitLab 连接尚未配齐，请到设置中配置地址与令牌。'} <button className="rel-text-btn" onClick={() => setTab('settings')}>打开设置 →</button></div>}
      <div className="rel-card">
        <h2>发版参数</h2>
        <div className="rel-grid">
          <label>模式</label>
          <select className="rel-select" aria-label="模式" disabled={formLocked} value={mode} onChange={(e) => { invalidatePlan(); setMode(e.target.value); }}>
            <option value="create-mr">只建 MR（合并留给 GitLab）</option>
            <option value="merge-mr">在 GitLab 合并 MR</option>
            <option value="merge-git">本地合并后推送</option>
          </select>

          <label>源分支</label>
          <div>
            <BranchInput label="源分支" value={source} onChange={(value) => { invalidatePlan(); setSource(value); }} options={options} loading={projects.length > 0 && (catalog?.loading ?? !catalog)} error={catalogError || (catalog?.errors.length ? catalog.errors.length + ' 个仓库远端读取失败，保留本地候选' : '')} onRefresh={refreshBranches} placeholder="输入关键字，模糊匹配分支" disabled={formLocked} />
            <div className="rel-hint">匹配分支名后选择；候选仅用于辅助，预检会核实远端。</div>
          </div>
          <label>目标分支</label>
          <BranchInput label="目标分支" value={target} onChange={(value) => { invalidatePlan(); setTarget(value); }} options={options} loading={projects.length > 0 && (catalog?.loading ?? !catalog)} error={catalogError} onRefresh={refreshBranches} placeholder={settings ? '留空 = 各仓库默认（' + settings.defaultTarget + '）' : '留空 = 各仓库默认'} disabled={formLocked} />

          <label>标题</label>
          <input
            className="rel-input"
            value={title}
            disabled={formLocked}
            placeholder="MR 标题 / 合并提交信息，留空自动生成"
            onChange={(e) => { invalidatePlan(); setTitle(e.target.value); }}
          />

          <label>说明</label>
          <textarea
            className="rel-textarea"
            rows={2}
            value={description}
            disabled={formLocked}
            placeholder="MR 说明 / 合并提交正文（可选）"
            onChange={(e) => { invalidatePlan(); setDescription(e.target.value); }}
          />

          <label>仓库</label>
          <div>
            <div className="rel-inline" style={{ marginBottom: 10 }}><input className="rel-input" aria-label="搜索仓库" placeholder="筛选仓库名称或路径" value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} />
              <button className="rel-text-btn" disabled={formLocked} onClick={() => { invalidatePlan(); setSelected({}); }}>全选</button><button className="rel-text-btn" disabled={formLocked} onClick={() => { invalidatePlan(); setSelected(Object.fromEntries(projects.map((p) => [p.id, false]))); }}>清空</button></div>
            <div className="rel-chips">
              {projects.length === 0
                ? <span className="rel-muted">没有可用仓库，请在设置中添加扫描目录</span>
                : projects.filter((p) => (p.name + p.gitlabPath).toLowerCase().includes(projectQuery.toLowerCase())).map((project) => {
                  const checked = selected[project.id] !== false;
                  return (
                    <label key={project.id} className={`rel-chip${checked ? '' : ' off'}`} title={project.defaultTarget ? `${project.name} · 默认目标 ${project.defaultTarget}` : project.name}>
                      <input
                        type="checkbox"
                        checked={checked && project.enabled}
                        disabled={formLocked || !project.enabled}
                        onChange={(e) => { const checked = e.target.checked; invalidatePlan(); setSelected((prev) => ({ ...prev, [project.id]: checked })); }}
                      />
                      {project.name}
                    </label>
                  );
                })}
            </div>
            <div className="rel-hint">
              已选 {selectedIds.length} / {projects.filter((p) => p.enabled).length} 个可用仓库 · {options.length} 个候选分支{catalog?.loading ? ' · 远端更新中…' : ''}
            </div>
          </div>
        </div>

        <div className="rel-actions">
          <button className="rel-btn" disabled={busy || !selectedIds.length || !source.trim()} onClick={() => void doCheck()}>{checking ? '预检中…' : '预检'}</button>
          {checking && <button className="rel-btn secondary" onClick={() => { cancelCheck(); notify('已取消预检'); }}>取消预检</button>}
          <button className="rel-btn secondary" disabled={catalog?.loading || busy} onClick={refreshBranches}>刷新分支</button>
          <button className="rel-btn secondary" disabled={busy} onClick={() => { invalidatePlan(); void loadProjects(true).then(() => { setCatalog(null); setCatalogVersion((n) => n + 1); }); }}>重新扫描仓库</button>
          <span className="rel-hint">{hint}</span>
        </div>
      </div>

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
                {planItems.map((item) => (
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
                      {item.checks.filter((c) => (c.status === 'danger' || c.status === 'unknown')).map((c) => (
                        <Tag key={c.id} tone="bad">{c.label}{c.detail ? `：${c.detail}` : ''}</Tag>
                      ))}
                      {item.checks.filter((c) => c.status === 'warn').map((c) => (
                        <Tag key={c.id} tone="warn">{c.label}{c.detail ? `：${c.detail}` : ''}</Tag>
                      ))}
                      {item.blockers.length + item.warnings.length + item.checks.filter((c) => (c.status === 'danger' || c.status === 'unknown') || c.status === 'warn').length === 0
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
                  <tr key={row.projectId}>
                    <td>{row.name}</td>
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

      </>}
      {toast !== '' && <div className="rel-toast">{toast}</div>}
    </div></div></div>
  );
}
