import { useEffect, useState } from 'react';
import type { MemoryCategory, MemoryItem, Store } from '../types/index';
import { MEMORY_CATEGORIES } from '../types/index';
import { createMemoryService } from '../services/memory';
import type { CryptoSession } from '../services/memory';
import { decryptText, encryptText } from '../services/encryption';
import { ConfirmDialog, EmptyState } from '../components/Shared/ConfirmDialog';
import { Icon } from '../components/Shared/Icon';

export function Memory({ store, cryptoSession }: { store: Store; cryptoSession: CryptoSession }) {
  const service = createMemoryService(store, cryptoSession);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | 'all'>('all');
  const [category, setCategory] = useState<MemoryCategory>('user-provided facts');
  const [content, setContent] = useState('');
  const [confirmedSave, setConfirmedSave] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [editingText, setEditingText] = useState('');
  const [toDelete, setToDelete] = useState<string>('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() { setItems(await service.list()); }
  useEffect(() => { void refresh(); }, [store, cryptoSession.enabled, cryptoSession.passphrase]);

  async function exportData() {
    const raw = await service.list();
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories: raw }, null, 2);
    let blob: Blob;
    let filename = 'octo-memories.json';
    if (cryptoSession.enabled && cryptoSession.passphrase) {
      const encrypted = await encryptText(payload, cryptoSession.passphrase);
      blob = new Blob([JSON.stringify({ version: 1, encrypted: true, data: encrypted })], { type: 'application/json' });
      filename = 'octo-memories.encrypted.json';
    } else {
      blob = new Blob([payload], { type: 'application/json' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setMessage('Memory exported. Keep the file safe, it contains your saved facts.');
  }

  async function importData(file: File) {
    const text = await file.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { setMessage('Import failed: the file is not valid JSON.'); return; }
    if (!parsed || typeof parsed !== 'object') { setMessage('Import failed: unexpected file shape.'); return; }
    const obj = parsed as Record<string, unknown>;
    let memories: { category: string; content: string }[] = [];
    if (obj.encrypted === true) {
      if (!cryptoSession.enabled || !cryptoSession.passphrase) { setMessage('This backup is encrypted. Enable encryption and enter the same passphrase in Settings, then import again.'); return; }
      try {
        const plain = await decryptText(String(obj.data), cryptoSession.passphrase);
        const inner = JSON.parse(plain) as { memories?: { category: string; content: string }[] };
        memories = inner.memories || [];
      } catch { setMessage('Import failed: the passphrase did not match this encrypted backup.'); return; }
    } else if (Array.isArray(obj.memories)) {
      memories = obj.memories as { category: string; content: string }[];
    } else { setMessage('Import failed: no memories array was found.'); return; }
    let count = 0;
    for (const m of memories) {
      if (typeof m.content === 'string' && m.content.trim() && MEMORY_CATEGORIES.includes(m.category as MemoryCategory)) {
        await service.save(m.category as MemoryCategory, m.content, true);
        count += 1;
      }
    }
    setMessage(`Imported ${count} memories. Import merges, it does not overwrite existing memories.`);
    await refresh();
  }

  const shown = items.filter((m) => (categoryFilter === 'all' || m.category === categoryFilter)
    && (m.category + ' ' + m.content).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      <header>
        <p className="eyebrow">Memory</p>
        <h1 className="page-title">What OCTO remembers</h1>
        <p className="page-sub">Only memories you confirm here are saved permanently. Conversations are not automatically saved as facts.</p>
      </header>

      <form className="glass" style={{ padding: 18, display: 'grid', gap: 11 }} onSubmit={(e) => { e.preventDefault(); if (!confirmedSave) { setMessage('Confirm that this memory should be saved permanently before saving.'); return; } void service.save(category, content, true).then(() => { setContent(''); setConfirmedSave(false); setMessage('Memory saved.'); void refresh(); }).catch((err: Error) => setMessage(err.message)); }}>
        <p className="section-label">Save a memory</p>
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)} aria-label="Memory category">
          {MEMORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <textarea className="field" value={content} onChange={(e) => setContent(e.target.value)} placeholder="What should OCTO remember?" aria-label="Memory content" rows={3} />
        <label className="check-row">
          <input type="checkbox" checked={confirmedSave} onChange={(e) => setConfirmedSave(e.target.checked)} /> I confirm this should be saved permanently on this device.
        </label>
        <button type="submit" className="btn-primary">Save memory</button>
      </form>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="glass pill-input" style={{ padding: '6px 6px 6px 16px' }}>
          <Icon name="search" size={20} label="Search" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memory" aria-label="Search memory" />
        </div>
        <div className="chip-row" role="group" aria-label="Memory category filter">
          <button type="button" className={`chip ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>All</button>
          {MEMORY_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip ${categoryFilter === c ? 'active' : ''}`} onClick={() => setCategoryFilter(c)}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={() => void exportData()}>Export</button>
          <label className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Import
            <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ''; }} />
          </label>
          <button type="button" className="btn-danger" onClick={() => setConfirmClear(true)}>Clear all memory</button>
        </div>
      </div>

      {message && <p role="status" style={{ color: 'var(--secondary)', margin: 0 }}>{message}</p>}

      <section className="glass" style={{ padding: '6px 16px' }}>
        {shown.length === 0 ? <EmptyState title="No saved memories here" body="Save a memory above, with confirmation. Conversations are not automatically saved as facts." /> : (
          <div className="list">
            {shown.map((m) => (
              <div key={m.id} className="list-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                    <span className="row-dot violet" aria-hidden="true" />
                    <span className="row-title">{m.category}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                    <button type="button" className="btn-ghost" style={{ minHeight: 38, padding: '7px 12px' }} onClick={() => { setEditingId(m.id); setEditingText(m.content); }}>Edit</button>
                    <button type="button" className="btn-danger" style={{ minHeight: 38, padding: '7px 12px' }} onClick={() => setToDelete(m.id)}>Delete</button>
                  </span>
                </div>
                {editingId === m.id ? (
                  <form style={{ display: 'grid', gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void service.update(m.id, editingText).then(() => { setEditingId(''); void refresh(); }); }}>
                    <textarea className="field" value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={3} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn-primary">Save edit</button>
                      <button type="button" className="btn-ghost" onClick={() => setEditingId('')}>Cancel</button>
                    </div>
                  </form>
                ) : <p className="row-sub" style={{ margin: '8px 0 4px 22px' }}>{m.content}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {toDelete && (
        <ConfirmDialog title="Delete this memory?" body="This deletes the memory from this device. It cannot be undone unless you exported a backup first." confirmLabel="Delete"
          onCancel={() => setToDelete('')} onConfirm={() => { void service.remove(toDelete, true).then(() => { setToDelete(''); void refresh(); }); }} />
      )}
      {confirmClear && (
        <ConfirmDialog title="Clear all memory?" body="This deletes every saved memory from this device. It cannot be undone unless you exported a backup first." confirmLabel="Clear all"
          onCancel={() => setConfirmClear(false)} onConfirm={() => { void service.clear(true).then(() => { setConfirmClear(false); void refresh(); }); }} />
      )}
    </div>
  );
}
