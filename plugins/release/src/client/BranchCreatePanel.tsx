import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { api } from './api.js';
import type { BranchCreationItem, BranchCreationResult, Project } from '../types.js';

const STATUS: Record<BranchCreationItem['status'], { label: string; tone: string }> = {
  created: { label: '已创建', tone: 'ok' },
  exists: { label: '已存在', tone: 'plain' },
  failed: { label: '失败', tone: 'bad' },
  unknown: { label: '待确认', tone: 'warn' },
};

interface Props {
  projects: Pick<Project, 'id' | 'name' | 'gitlabPath' | 'enabled'>[];
  gitlabReady: boolean;
  loading: boolean;
  onBusyChange: (busy: boolean) => void;
  onCreated: () => void;
}

export function BranchCreatePanel({ projects, gitlabReady, loading, onBusyChange, onCreated }: Props): ReactElement {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [branchName, setBranchName] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BranchCreationResult | null>(null);
  const enabled = useMemo(() => projects.filter((p) => p.enabled), [projects]);
  const ids = enabled.filter((p) => selected[p.id]).map((p) => p.id);
  const visible = projects.filter((p) => `${p.name} ${p.gitlabPath}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function create(): Promise<void> {
    if (submitting.current || loading || !gitlabReady || !ids.length || !branchName.trim()) return;
    const name = branchName.trim();
    if (!window.confirm(`确认在 ${ids.length} 个项目中创建「${name}」？\n基于各项目当前默认分支，直接创建到 GitLab。已存在的分支会跳过。`)) return;
    submitting.current = true;
    setBusy(true); onBusyChange(true); setError(''); setResult(null);
    try {
      const value = await api<BranchCreationResult>('/branches/create', {
        method: 'POST', body: JSON.stringify({ branchName: name, projects: ids }),
      });
      setResult(value);
    } catch (e) {
      setError(`${(e as Error).message}。如请求已发出，部分项目可能已创建；可用同一分支名重试核实，已存在的分支会跳过。`);
    } finally {
      submitting.current = false;
      setBusy(false); onBusyChange(false); onCreated();
    }
  }

  return <>
    {!gitlabReady && <div className="rel-notice">请先在设置中配置 GitLab 地址和令牌。</div>}
    <div className="rel-card">
      <h2>创建分支</h2>
      <p className="rel-hint">从各项目 GitLab 当前默认分支（通常为 master）创建同名新分支。不会切换本地工作区。</p>
      <fieldset className="rel-settings-fields" disabled={busy || loading}>
        <div className="rel-grid">
          <label htmlFor="rel-create-projects">项目</label>
          <div>
            <div className="rel-inline" style={{ marginBottom: 10 }}>
              <input id="rel-create-projects" className="rel-input" placeholder="筛选项目名称或路径" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="rel-text-btn" onClick={() => setSelected(Object.fromEntries(enabled.map((p) => [p.id, true])))}>全选项目</button>
              <button className="rel-text-btn" onClick={() => setSelected({})}>清空项目</button>
            </div>
            <div className="rel-chips">
              {visible.map((project) => <label key={project.id} className={`rel-chip${selected[project.id] ? '' : ' off'}`} title={project.gitlabPath}>
                <input type="checkbox" checked={!!selected[project.id] && project.enabled} disabled={!project.enabled}
                  onChange={(e) => { const checked = e.target.checked; setSelected((prev) => ({ ...prev, [project.id]: checked })); }} />
                {project.name}{!project.enabled ? '（已停用）' : ''}
              </label>)}
              {!visible.length && <span className="rel-muted">{projects.length ? '没有匹配的项目' : '没有可用项目，请在设置中添加扫描目录'}</span>}
            </div>
            <div className="rel-hint">已选 {ids.length} / {enabled.length} 个可用项目</div>
          </div>
          <label htmlFor="rel-create-branch">新分支名称</label>
          <input id="rel-create-branch" className="rel-input rel-mono" value={branchName}
            placeholder="feature/XLS-xxxx_功能名称" onChange={(e) => setBranchName(e.target.value)} />
        </div>
        <div className="rel-actions">
          <button className="rel-btn" disabled={!gitlabReady || !ids.length || !branchName.trim()} onClick={() => void create()}>{busy ? '正在创建…' : '创建分支'}</button>
          <span className="rel-hint">{busy ? '正在逐个处理项目，请等待结果…' : '仅处理已选项目，已存在的分支自动跳过'}</span>
        </div>
      </fieldset>
      {error && <p role="alert" className="rel-error">{error}</p>}
    </div>
    {result && <div className="rel-card" aria-live="polite">
      <h2>创建结果 · <span className="rel-mono">{result.branchName}</span></h2>
      <div className="rel-summary">
        <span>项目 <b>{result.total}</b></span><span>已创建 <b>{result.created}</b></span>
        <span>已存在 <b>{result.exists}</b></span><span>失败 <b>{result.failed}</b></span><span>待确认 <b>{result.unknown}</b></span>
      </div>
      {result.unknown > 0 && <p className="rel-hint">部分请求结果待确认，可在 GitLab 核实，或用相同分支名重试；已存在的分支会跳过。</p>}
      <div className="rel-scroll"><table className="rel-table">
        <thead><tr><th>项目</th><th>基线分支</th><th>结果</th><th>分支提交</th><th>说明</th></tr></thead>
        <tbody>{result.items.map((item) => <tr key={item.projectId}>
          <td>{item.name}</td><td className="rel-mono">{item.baseBranch ?? '—'}</td>
          <td><span className={`rel-tag ${STATUS[item.status].tone}`}>{STATUS[item.status].label}</span></td>
          <td className="rel-mono">{item.url ? <a className="rel-link" href={item.url} target="_blank" rel="noreferrer">{item.sha?.slice(0, 10) ?? '查看分支'}</a> : '—'}</td>
          <td>{item.message}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
  </>;
}
