import { useEffect, useState } from 'react';
import type { MemoryCategory, MemoryItem, Store } from '../types/index';
import { MEMORY_CATEGORIES } from '../types/index';
import { createMemoryService } from '../services/memory';
import type { CryptoSession } from '../services/memory';
import { decryptText, encryptText } from '../services/encryption';
import { ConfirmDialog, EmptyState } from '../components/Shared/ConfirmDialog';

export function Memory({ store, cryptoSession }: { store: Store; cryptoSession: CryptoSession }) {
  const service = createMemoryService(store, cryptoSession);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState('');
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

  const shown = items.filter((m) => (m.category + ' ' + m.content).toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form className="glass" style={{ padding: 16, display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (!confirmedSave) { setMessage('Confirm that this memory should be saved permanently before saving.'); return; } void service.save(category, content, true).then(() => { setContent(''); setConfirmedSave(false); setMessage('Memory saved.'); void refresh(); }).catch((err: Error) => setMessage(err.message)); }}>
        <h2 style={{ margin: 0 }}>Save a memory</h2>
        <p style={{ color: 'var(--secondary)', margin: 0 }}>OCTO never auto-saves every conversation as a permanent fact. Only save what you confirm here.</p>
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)} aria-label="Memory category">
          {MEMORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <textarea className="field" value={content} onChange={(e) => setContent(e.target.value)} placeholder="What should OCTO remember?" aria-label="Memory content" rows={3} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={confirmedSave} onChange={(e) => setConfirmedSave(e.target.checked)} /> I confirm this should be saved permanently on this device.
        </label>
        <button type="submit" className="btn-primary">Save memory</button>
      </form>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="field" style={{ flex: '1 1 200px' }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memory" aria-label="Search memory" />
        <button type="button" className="btn-ghost" onClick={() => void exportData()}>Export</button>
        <label className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Import
          <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ''; }} />
        </label>
        <button type="button" className="btn-danger" onClick={() => setConfirmClear(true)}>Clear all memory</button>
      </div>
      {message && <p role="status" style={{ color: 'var(--secondary)' }}>{message}</p>}
      {shown.length === 0 ? <EmptyState title="No saved memories yet" body="Save a memory above, with confirmation. Conversations are not automatically saved as facts." /> : shown.map((m) => (
        <div key={m.id} className="glass" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{m.category}</strong><span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={() => { setEditingId(m.id); setEditingText(m.content); }}>Edit</button>
            <button type="button" className="btn-danger" onClick={() => setToDelete(m.id)}>Delete</button>
          </span></div>
          {editingId === m.id ? (
            <form style={{ display: 'grid', gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); void service.update(m.id, editingText).then(() => { setEditingId(''); void refresh(); }); }}>
              <textarea className="field" value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={3} />
              <button type="submit" className="btn-primary">Save edit</button>
            </form>
          ) : <p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>}
        </div>
      ))}
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
