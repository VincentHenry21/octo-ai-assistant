import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { OctoState, OctoSettings, Section, Store } from './types/index';
import { DEFAULT_SETTINGS } from './types/index';
import { useStore } from './hooks/useStore';
import { Sidebar, BottomTabBar } from './components/Navigation/Sidebar';
import { Home } from './pages/Home';
import { Chat } from './pages/Chat';
import { Workspace } from './pages/Workspace';
import { Memory } from './pages/Memory';
import { Settings } from './pages/Settings';
import { hasGeminiKey } from './services/gemini';
import type { IntelligenceMode } from './services/gemini';
import type { CryptoSession } from './services/memory';

export function App() {
  const store: Store | null = useStore();
  const [section, setSection] = useState<Section>('home');
  const [octoState, setOctoState] = useState<OctoState>('IDLE');
  const [settings, setSettings] = useState<OctoSettings>(DEFAULT_SETTINGS);
  const [defaultMode, setDefaultMode] = useState<IntelligenceMode | 'AUTO'>('AUTO');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cryptoSession, setCryptoSession] = useState<CryptoSession>({ enabled: false, passphrase: '' });
  const [keyActive, setKeyActive] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [workerUrl, setWorkerUrl] = useState('');
  const [workerRemembered, setWorkerRemembered] = useState(false);
  const [appToken, setAppToken] = useState('');
  const [workerStatus, setWorkerStatus] = useState('BYOK only');
  const setState = useCallback((s: OctoState) => setOctoState(s), []);

  useEffect(() => {
    if (!store) return;
    void store.getAll<{ id: string; value?: OctoSettings }>('settings').then((items) => {
      const found = items.find((i) => i.id === 'settings');
      if (found?.value) setSettings({ ...DEFAULT_SETTINGS, ...found.value });
    }).catch(() => undefined);
  }, [store]);

  useEffect(() => {
    if (!store) return;
    void store.put('settings', { id: 'settings', value: settings }).catch(() => undefined);
  }, [store, settings]);

  useEffect(() => { setKeyActive(hasGeminiKey()); }, [section]);
  useEffect(() => {
    try {
      const remembered = localStorage.getItem('octo-worker-url');
      const flag = localStorage.getItem('octo-worker-remembered');
      if (flag === '1' && remembered) { setWorkerUrl(remembered); setWorkerRemembered(true); }
    } catch { /* storage unavailable */ }
  }, []);
  function changeWorkerUrl(value: string) {
    setWorkerUrl(value);
    setWorkerStatus('BYOK only');
    try {
      if (workerRemembered) {
        if (value.trim()) localStorage.setItem('octo-worker-url', value.trim());
        else localStorage.removeItem('octo-worker-url');
      }
    } catch { /* storage unavailable */ }
  }
  function changeWorkerRemembered(value: boolean) {
    setWorkerRemembered(value);
    try {
      if (value && workerUrl.trim()) {
        localStorage.setItem('octo-worker-url', workerUrl.trim());
        localStorage.setItem('octo-worker-remembered', '1');
      } else {
        localStorage.removeItem('octo-worker-url');
        localStorage.removeItem('octo-worker-remembered');
      }
    } catch { /* storage unavailable */ }
  }

  if (!store) {
    return <main style={{ padding: 24 }}><p>Loading OCTO local database.</p></main>;
  }

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <div className="app-shell">
        <aside className="sidebar-col glass-strong" style={{ padding: 14 }}>
          <Sidebar section={section} onChange={setSection} />
        </aside>
        <main className="content-pad" style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {section === 'home' && (
                <Home store={store} octoState={octoState} keyActive={keyActive} model={settings.model}
                  onQuickAsk={(text) => { setPendingMessage(text); setSection('chat'); }}
                  onGoChat={() => setSection('chat')} onGoWorkspace={() => setSection('workspace')} />
              )}
              {section === 'chat' && (
                <Chat store={store} model={settings.model} defaultMode={defaultMode} onStateChange={setState}
                  pendingMessage={pendingMessage} onPendingConsumed={() => setPendingMessage('')}
                  workerUrl={workerUrl} workerActive={workerStatus === 'Worker connected'} appToken={appToken} />
              )}
              {section === 'workspace' && <Workspace store={store} />}
              {section === 'memory' && <Memory store={store} cryptoSession={cryptoSession} />}
              {section === 'settings' && (
                <Settings store={store} settings={settings} onSettingsChange={setSettings}
                  defaultMode={defaultMode} onDefaultModeChange={setDefaultMode}
                  reducedMotion={reducedMotion} onReducedMotionChange={setReducedMotion}
                  cryptoSession={cryptoSession} onCryptoSessionChange={setCryptoSession}
                  keyActive={keyActive} onKeyActiveChange={setKeyActive}
                  workerUrl={workerUrl} onWorkerUrlChange={changeWorkerUrl}
                  workerRemembered={workerRemembered} onWorkerRememberedChange={changeWorkerRemembered}
                  appToken={appToken} onAppTokenChange={setAppToken}
                  workerStatus={workerStatus} onWorkerStatusChange={setWorkerStatus} />
              )}
            </motion.div>
          </AnimatePresence>
          <p style={{ color: 'var(--secondary)', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            OCTO stores data on this device in IndexedDB. AI chat needs your own Gemini key in Settings. Offline AI responses are not available.
          </p>
        </main>
        <div className="bottom-nav">
          <BottomTabBar section={section} onChange={setSection} />
        </div>
      </div>
    </MotionConfig>
  );
}
