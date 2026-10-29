import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BranchOption } from '../branch-catalog.js';
import { fuzzyScore } from '../search.js';

export function BranchInput({ label, value, onChange, options, loading, error, onRefresh, placeholder, disabled }: {
  label: string; value: string; onChange(value: string): void; options: BranchOption[];
  loading: boolean; error: string; onRefresh(): void; placeholder: string; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [composing, setComposing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => options.map((option) => ({ option, score: fuzzyScore(option.name, value) }))
    .filter((hit) => Number.isFinite(hit.score)).sort((a, b) => a.score - b.score
      || b.option.projectIds.length - a.option.projectIds.length || a.option.name.localeCompare(b.option.name))
    .slice(0, 60).map((hit) => hit.option), [options, value]);
  useEffect(() => { setCursor(0); }, [value]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${cursor}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open, id]);
  const choose = (name: string) => { onChange(name); setOpen(false); };
  return <div className="rel-combo" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <input className="rel-input rel-mono" role="combobox" aria-label={label} aria-autocomplete="list"
      aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && hits[cursor] ? `${id}-${cursor}` : undefined}
      value={value} placeholder={placeholder} autoComplete="off" spellCheck={false} disabled={disabled}
      onFocus={() => setOpen(true)} onChange={(e) => { onChange(e.target.value); setCursor(0); setOpen(true); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onKeyDown={(e) => {
        if (composing || e.nativeEvent.isComposing) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); setOpen(true);
          setCursor((n) => open ? Math.max(0, Math.min(hits.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))) : 0);
        } else if (e.key === 'Enter' && open) {
          e.preventDefault(); const hit = hits[cursor]; if (hit) choose(hit.name); else setOpen(false);
        } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      }} />
    {open && <div className="rel-dropdown">
      <div className="rel-dropdown-title">{label}候选 <span>{hits.length} / {options.length}</span></div>
      <div className="rel-options" role="listbox" id={`${id}-list`} aria-label={`${label}候选`}>
        {hits.map((hit, index) => <button type="button" tabIndex={-1} role="option" aria-selected={index === cursor}
          id={`${id}-${index}`} key={hit.name} className={`rel-option${index === cursor ? ' active' : ''}`}
          title={hit.projects.join('、')} onMouseMove={() => setCursor(index)}
          onMouseDown={(e) => e.preventDefault()} onClick={() => choose(hit.name)}>
          <span className="rel-mono">{hit.name}</span><small>{hit.projects.length} 个仓库</small>
        </button>)}
        {!hits.length && <p className="rel-empty">{loading ? '正在读取分支，可继续输入…' : '没有匹配候选，可手动输入分支名'}</p>}
      </div>
      <div className="rel-dropdown-foot"><span role="status">{error || (loading ? '本地候选可选，正在更新远端…' : '↑ ↓ 选择 · Enter 确认 · Esc 收起')}</span>
        <button type="button" className="rel-text-btn" disabled={loading} onMouseDown={(e) => e.preventDefault()} onClick={onRefresh}>刷新远端</button>
      </div>
    </div>}
  </div>;
}
