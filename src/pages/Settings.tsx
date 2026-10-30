import { useState } from 'react';
import type { OctoSettings, Store } from '../types/index';
import { MODEL_ALLOWLIST } from '../types/index';
import { clearGeminiKey, hasGeminiKey, setGeminiKey, validateConnection, checkWorkerHealth, MODES } from '../services/gemini';
import type { IntelligenceMode } from '../services/gemini';
import { voiceSupport } from '../services/voice';
import { ConfirmDialog } from '../components/Shared/ConfirmDialog';

export function Settings({ store, settings, onSettingsChange, defaultMode, onDefaultModeChange, reducedMotion, onReducedMotionChange, cryptoSession, onCryptoSessionChange, keyActive, onKeyActiveChange, workerUrl, onWorkerUrlChange, workerRemembered, onWorkerRememberedChange, appToken, onAppTokenChange, workerStatus, onWorkerStatusChange }: {
  store: Store; settings: OctoSettings; onSettingsChange: (s: OctoSettings) => void;
  defaultMode: IntelligenceMode | 'AUTO'; onDefaultModeChange: (m: IntelligenceMode | 'AUTO') => void;
  reducedMotion: boolean; onReducedMotionChange: (v: boolean) => void;
  cryptoSession: { enabled: boolean; passphrase: string }; onCryptoSessionChange: (c: { enabled: boolean; passphrase: string }) => void;
  keyActive: boolean; onKeyActiveChange: (v: boolean) => void;
  workerUrl: string; onWorkerUrlChange: (v: string) => void;
  workerRemembered: boolean; onWorkerRememberedChange: (v: boolean) => void;
  appToken: string; onAppTokenChange: (v: string) => void;
  workerStatus: string; onWorkerStatusChange: (v: string) => void;
}) {
  const [keyInput, setKeyInput] = useState('');
  const [validation, setValidation] = useState('');
  const [validating, setValidating] = useState(false);
  const [workerValidation, setWorkerValidation] = useState('');
  const [validatingWorker, setValidatingWorker] = useState(false);

  async function validateWorker() {
    setValidatingWorker(true);
    const result = await checkWorkerHealth(workerUrl);
    setValidatingWorker(false);
    if (result.ok) {
      onWorkerStatusChange('Worker connected');
      setWorkerValidation(result.geminiConfigured
        ? `Worker connected. Gemini secret is configured on the Worker. App token required: ${result.appTokenRequired ? 'yes' : 'no'}.`
        : 'Worker connected, but the Gemini secret is not configured on the Worker. Add GEMINI_API_KEY in Cloudflare Dashboard, then validate again. Chat will fall back to BYOK.');
    } else {
      onWorkerStatusChange('Worker not connected');
      setWorkerValidation(result.error || 'Worker not connected. Chat uses BYOK only.');
    }
  }
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const support = voiceSupport();
  const swStatus = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? (navigator.serviceWorker.controller ? 'Service worker is active.' : 'Service worker is registered on load, or not yet active on this first visit.')
    : 'Service workers are not supported in this browser.';

  async function validate() {
    if (!keyInput.trim()) { setValidation('Enter a key first.'); return; }
    setGeminiKey(keyInput.trim());
    setValidating(true);
    const result = await validateConnection(settings.model);
    setValidating(false);
    setValidation(result.message);
    onKeyActiveChange(result.ok);
    if (!result.ok) clearGeminiKey();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Backend Connection (Cloudflare Worker)</h2>
        <p style={{ color: 'var(--secondary)' }}>
          Status: {workerStatus}. When a Worker URL is validated, Chat and Live prefer the Worker backend. When it is not set or fails, Chat falls back to BYOK with a clear label, never silently mixing the two.
          The Worker holds the permanent Gemini secret server-side only. The frontend never sees it.
        </p>
        <label style={{ display: 'block', marginBottom: 10 }}>Worker URL
          <input className="field" type="url" value={workerUrl} onChange={(e) => onWorkerUrlChange(e.target.value)} placeholder="https://octo-ai-assistant.your-subdomain.workers.dev" style={{ marginTop: 4 }} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input type="checkbox" checked={workerRemembered} onChange={(e) => onWorkerRememberedChange(e.target.checked)} /> Remember Worker URL on this device (off by default)
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>App token, optional (memory only, never persisted)
          <input className="field" type="password" autoComplete="off" value={appToken} onChange={(e) => onAppTokenChange(e.target.value)} placeholder="Only if OCTO_APP_TOKEN is set on the Worker" style={{ marginTop: 4 }} />
        </label>
        <p style={{ color: 'var(--secondary)' }}>The app token is kept in app memory only, even if you remember the Worker URL. Re-enter it each session when the Worker requires it.</p>
        <button type="button" className="btn-primary" disabled={validatingWorker} onClick={() => void validateWorker()}>{validatingWorker ? 'Validating' : 'Validate Worker'}</button>
        {workerValidation && <p role="status" style={{ color: 'var(--secondary)', whiteSpace: 'pre-wrap' }}>{workerValidation}</p>}
      </section>
      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Gemini configuration (Bring Your Own Key)</h2>
        <p style={{ color: 'var(--secondary)' }}>
          Enter your own Gemini key here. It is kept in application memory only, never stored in LocalStorage or IndexedDB by default, never committed, and cleared when you disconnect or the session ends.
          Warning: a browser key can be inspected in the browser, so it is not equivalent to a server-side secret. In Google AI Studio, restrict the key to the Gemini API and set usage limits.
          Gemini receives your prompts and, at most, a few relevant memory snippets, never your entire database.
        </p>
        <p role="status" style={{ color: keyActive ? 'var(--cyan)' : 'var(--secondary)' }}>
          {keyActive ? 'A Gemini key is active in this session.' : 'No Gemini key is active in this session.'}
        </p>
        <label style={{ display: 'block', marginBottom: 10 }}>Gemini API key
          <input className="field" type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste your key from Google AI Studio" style={{ marginTop: 4 }} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" disabled={validating} onClick={() => void validate()}>{validating ? 'Validating' : 'Validate connection'}</button>
          <button type="button" className="btn-danger" onClick={() => { clearGeminiKey(); setKeyInput(''); onKeyActiveChange(false); setValidation('Key cleared from this session.'); }}>Disconnect and clear key</button>
        </div>
        {validation && <p role="status" style={{ color: 'var(--secondary)', whiteSpace: 'pre-wrap' }}>{validation}</p>}
        <label style={{ display: 'block', marginTop: 12 }}>Model
          <select className="field" value={settings.model} onChange={(e) => onSettingsChange({ ...settings, model: e.target.value })} style={{ marginTop: 4 }}>
            {MODEL_ALLOWLIST.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={{ display: 'block', marginTop: 12 }}>Default intelligence mode
          <select className="field" value={defaultMode} onChange={(e) => onDefaultModeChange(e.target.value as IntelligenceMode | 'AUTO')} style={{ marginTop: 4 }}>
            <option value="AUTO">Auto (choose from your message)</option>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </section>

      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Voice</h2>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={settings.voiceEnabled} onChange={(e) => onSettingsChange({ ...settings, voiceEnabled: e.target.checked })} /> Voice enabled</label>
        <label style={{ display: 'block', marginTop: 10 }}>Speech rate: {settings.voiceRate}
          <input className="field" type="range" min="0.5" max="1.5" step="0.1" value={settings.voiceRate} onChange={(e) => onSettingsChange({ ...settings, voiceRate: Number(e.target.value) })} style={{ marginTop: 4 }} />
        </label>
        <p style={{ color: 'var(--secondary)' }}>Speech recognition: {support.recognition ? 'supported' : 'not supported in this browser'}. Speech output: {support.synthesis ? 'supported' : 'not supported in this browser'}. Continuous conversation starts only when you turn it on, and it stops when you tap Stop voice.</p>
      </section>

      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Memory and security</h2>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cryptoSession.enabled} onChange={(e) => onCryptoSessionChange({ ...cryptoSession, enabled: e.target.checked })} /> Encrypt new memories with a passphrase</label>
        <label style={{ display: 'block', marginTop: 10 }}>Encryption passphrase (memory only, never stored)
          <input className="field" type="password" autoComplete="off" value={cryptoSession.passphrase} onChange={(e) => onCryptoSessionChange({ ...cryptoSession, passphrase: e.target.value })} placeholder="Enter a passphrase for encrypted memories and exports" style={{ marginTop: 4 }} />
        </label>
        <p style={{ color: 'var(--secondary)' }}>If you forget this passphrase, encrypted memories and encrypted exports cannot be recovered. The passphrase itself is never stored in browser storage.</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}><input type="checkbox" checked={reducedMotion} onChange={(e) => onReducedMotionChange(e.target.checked)} /> Reduce motion (also follows your device setting)</label>
        <p style={{ color: 'var(--secondary)' }}>Appearance is dark-first. This build keeps the dark Liquid Glass theme for readability.</p>
      </section>

      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Account and diagnostics</h2>
        <p style={{ color: 'var(--secondary)' }}>Account is local-only in this build. There is no cloud account, no Supabase login, and no sync yet. Your data lives in IndexedDB on this device, and separate devices have separate databases unless you transfer an exported backup.</p>
        <ul style={{ color: 'var(--secondary)' }}>
          <li>Gemini key active: {hasGeminiKey() ? 'yes, in this session only' : 'no'}</li>
          <li>Model: {settings.model}</li>
          <li>{swStatus}</li>
          <li>IndexedDB: {typeof indexedDB !== 'undefined' ? 'available' : 'not available'}</li>
        </ul>
        <button type="button" className="btn-danger" onClick={() => setConfirmClearAll(true)}>Clear all local data</button>
      </section>

      {confirmClearAll && (
        <ConfirmDialog title="Clear all local data?" body="This deletes conversations, memories, tasks, notes, and projects from this device. It cannot be undone unless you exported a backup first. Your Gemini key in memory is also cleared."
          confirmLabel="Clear everything" onCancel={() => setConfirmClearAll(false)}
          onConfirm={() => { void Promise.all(['conversations', 'memories', 'tasks', 'notes', 'projects', 'settings', 'action_logs'].map((t) => store.clear(t))).then(() => { clearGeminiKey(); onKeyActiveChange(false); setConfirmClearAll(false); window.location.reload(); }); }} />
      )}
    </div>
  );
}
