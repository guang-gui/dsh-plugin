import { useEffect, useState } from 'react';
import type { TaskRecord } from '../types.js';
import { api } from './api.js';

export function TasksPanel({ onReuse }: { onReuse(task: TaskRecord): void }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setError('');
    try { setTasks((await api<{ tasks: TaskRecord[] }>('/tasks')).tasks); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  return <section id="taskCard" className="rel-card"><div className="rel-head"><h2>任务中心</h2><button className="rel-btn secondary" disabled={busy} onClick={() => void load()}>刷新记录</button></div>
    {error && <p className="rel-error" role="alert">{error}</p>}
    {!tasks.length && <p className="rel-empty">{busy ? '正在读取任务…' : '暂无执行记录。执行发版后可在这里查看结果。'}</p>}
    {tasks.map((task) => <details key={task.id} className="rel-card"><summary>{task.sourceBranch} → {task.targetBranch} · 成功 {task.succeeded} / 失败 {task.failed} / 跳过 {task.skipped} <span className="rel-hint">{new Date(task.startedAt).toLocaleString()}</span></summary>
      <div className="rel-scroll"><table className="rel-table"><thead><tr><th>仓库</th><th>结果</th></tr></thead><tbody>{task.results.map((row) => <tr key={row.projectId}><td>{row.name}</td><td>{row.message} {row.url && <a className="rel-link" href={row.url} target="_blank" rel="noreferrer">打开 MR</a>}</td></tr>)}</tbody></table></div>
      <button className="rel-btn secondary" onClick={() => onReuse(task)}>回填参数</button>
    </details>)}
  </section>;
}
