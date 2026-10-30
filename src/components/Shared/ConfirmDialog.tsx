export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div className="glass-strong" style={{ maxWidth: 420, width: '100%', padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p style={{ color: 'var(--secondary)' }}>{body}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass" style={{ padding: 20, textAlign: 'center' }}>
      <h3 style={{ margin: '4px 0' }}>{title}</h3>
      <p style={{ color: 'var(--secondary)', margin: '4px 0' }}>{body}</p>
    </div>
  );
}
