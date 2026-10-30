import { useState } from 'react';
import type { Store, ToolResult } from '../../types/index';
import { executeTool, TOOL_NAMES } from '../../services/actionEngine';
import { ConfirmDialog } from '../Shared/ConfirmDialog';

export function ToolRunner({ store, onDone }: { store: Store; onDone: () => void }) {
  const [tool, setTool] = useState<string>('list_tasks');
  const [argsText, setArgsText] = useState('{}');
  const [result, setResult] = useState<ToolResult | null>(null);
  const [pending, setPending] = useState<{ tool: string; args: Record<string, unknown> } | null>(null);
  const needsConfirm = tool === 'save_memory';

  async function run(confirmed: boolean) {
    let args: unknown;
    try { args = JSON.parse(argsText); } catch { setResult({ ok: false, tool, error: 'Arguments must be valid JSON.', code: 'INVALID_ARGS' }); return; }
    const out = await executeTool(store, tool, args, confirmed);
    setResult(out);
    if (out.ok) onDone();
  }

  return (
    <div className="glass" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Run a tool</h3>
      <p style={{ color: 'var(--secondary)' }}>Tools are validated before they run. Saving a memory needs your confirmation. No tool runs arbitrary code from a model.</p>
      <label style={{ display: 'block', marginBottom: 8 }}>Tool
        <select className="field" value={tool} onChange={(e) => setTool(e.target.value)} style={{ marginTop: 4 }}>
          {TOOL_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>Arguments as JSON
        <textarea className="field" rows={3} value={argsText} onChange={(e) => setArgsText(e.target.value)} style={{ marginTop: 4, fontFamily: 'monospace' }} />
      </label>
      <button type="button" className="btn-primary" onClick={() => {
        if (needsConfirm) {
          try { setPending({ tool, args: JSON.parse(argsText) as Record<string, unknown> }); } catch { setResult({ ok: false, tool, error: 'Arguments must be valid JSON.', code: 'INVALID_ARGS' }); }
        } else void run(false);
      }}>Run tool</button>
      {result && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#080B10', padding: 12, borderRadius: 12, overflow: 'auto' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {pending && (
        <ConfirmDialog title="Confirm saving this memory" body="This will save the memory permanently in this device database. Confirm only if you want OCTO to remember it." confirmLabel="Save memory"
          onCancel={() => setPending(null)} onConfirm={() => { setPending(null); void executeTool(store, pending.tool, pending.args, true).then((out) => { setResult(out); if (out.ok) onDone(); }); }} />
      )}
    </div>
  );
}
