import { useState, type ReactNode } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE = 8;
/** Collapsible, paged list. Pass onClear only for non-essential logs; clearing always asks for confirmation. */
export function HistoryList<T>({ title, items, render, onClear, defaultOpen = true, protectedIndex, empty = 'Nothing here yet.' }: { title: string; items: T[]; render: (item: T, i: number) => ReactNode; onClear?: (indices: number[]) => void; defaultOpen?: boolean; protectedIndex?: number; empty?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const selectable = items.map((_, i) => i).filter(i => i !== protectedIndex);
  const allPicked = selectable.length > 0 && selectable.every(i => picked.has(i));
  const toggle = (i: number) => setPicked(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return <section className="history-list">
    <button type="button" className="history-head" aria-expanded={open} onClick={() => setOpen(!open)}><span className="section-label">{title} · {items.length}</span><ChevronDown className={open ? 'rotate-180 size-4' : 'size-4'} /></button>
    {open && <>
      {onClear && selectable.length > 0 && <div className="history-tools"><label><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(selectable))} /> Select all</label><Button size="sm" variant="gameOutline" disabled={!picked.size} onClick={() => setConfirm(true)}><Trash2 /> Clear{picked.size ? ` (${picked.size})` : ''}</Button></div>}
      <div className="history-scroll">{items.length ? items.slice(0, shown).map((it, i) => <div key={i} className="history-item">{onClear && i !== protectedIndex && <input type="checkbox" aria-label={`Select item ${i + 1}`} checked={picked.has(i)} onChange={() => toggle(i)} />}<div className="min-w-0 flex-1">{render(it, i)}</div></div>) : <p className="mini-note">{empty}</p>}</div>
      {shown < items.length && <Button size="sm" variant="gameQuiet" className="w-full" onClick={() => setShown(shown + PAGE)}>Show more ({items.length - shown} left)</Button>}
    </>}
    {confirm && <div className="modal-backdrop" onClick={() => setConfirm(false)}><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="clear-title" onClick={e => e.stopPropagation()}><div className="modal-head"><h2 id="clear-title">Clear {picked.size} {title.toLowerCase()} {picked.size === 1 ? 'entry' : 'entries'}?</h2></div><p>This removes them from this list only. Your career record, finances, elections and legal history are kept.</p><div className="modal-actions"><Button variant="game" onClick={() => { onClear?.([...picked]); setPicked(new Set()); setConfirm(false); }}>Clear history</Button><Button variant="gameOutline" onClick={() => setConfirm(false)}>Cancel</Button></div></section></div>}
  </section>;
}
