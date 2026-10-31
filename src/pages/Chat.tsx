import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Conversation, OctoState, Store } from '../types/index';
import { conversationRepo, newMessage } from '../database/conversations';
import { memoryRepo } from '../database/memories';
import { streamChat, streamChatViaWorker, hasGeminiKey, ChatError, recoveryFor, autoMode, MODES } from '../services/gemini';
import type { IntelligenceMode } from '../services/gemini';
import { MessageBubble } from '../components/Chat/ChatWindow';
import { VoiceControl } from '../components/Voice/VoiceControl';
import { LiveVision } from '../components/Voice/LiveVision';
import { ToolRunner } from '../components/Chat/ToolRunner';
import { ConfirmDialog, EmptyState } from '../components/Shared/ConfirmDialog';
import { Icon } from '../components/Shared/Icon';

export function Chat({ store, model, defaultMode, onStateChange, pendingMessage, onPendingConsumed, visionRequested, onVisionConsumed, workerUrl, workerActive, appToken }: {
  store: Store; model: string; defaultMode: IntelligenceMode | 'AUTO';
  onStateChange: (s: OctoState) => void; pendingMessage: string; onPendingConsumed: () => void;
  visionRequested: boolean; onVisionConsumed: () => void;
  workerUrl: string; workerActive: boolean; appToken: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<IntelligenceMode | 'AUTO'>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [continuous, setContinuous] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [visionAnalysis, setVisionAnalysis] = useState('');
  const [visionOn, setVisionOn] = useState(false);
  const [view, setView] = useState<'chat' | 'vision'>('chat');
  const [workerNotice, setWorkerNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const active = conversations.find((c) => c.id === activeId) || null;

  async function refresh() {
    const list = await conversationRepo(store).list();
    setConversations(list);
    if (!activeId && list.length > 0) setActiveId(list[0].id);
  }
  useEffect(() => { void refresh(); }, [store]);
  useEffect(() => { if (pendingMessage) { setInput(pendingMessage); onPendingConsumed(); } }, [pendingMessage, onPendingConsumed]);
  useEffect(() => { if (visionRequested) { setView('vision'); onVisionConsumed(); } }, [visionRequested, onVisionConsumed]);
  useEffect(() => {
    if (voiceListening) onStateChange('LISTENING');
    else if (voiceSpeaking) onStateChange('RESPONDING');
    else if (visionOn) onStateChange('VISION_ACTIVE');
    else if (loading) onStateChange('THINKING');
    else if (error) onStateChange('ERROR');
    else onStateChange('IDLE');
  }, [voiceListening, voiceSpeaking, visionOn, loading, error, onStateChange]);
  useEffect(() => {
    if (view !== 'chat') return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.messages.length, loading, view]);

  async function newConversation() {
    const created = await conversationRepo(store).create();
    setActiveId(created.id);
    await refresh();
    setActiveId(created.id);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    let convo = active;
    if (!convo) { convo = await conversationRepo(store).create(); setActiveId(convo.id); }
    const userMsg = newMessage('user', trimmed);
    await conversationRepo(store).addMessage(convo.id, userMsg);
    const history = [...(convo.messages), userMsg];
    const assistantMsg = newMessage('assistant', '');
    await conversationRepo(store).addMessage(convo.id, assistantMsg);
    await refresh();
    setInput('');
    setError('');
    setLoading(true);
    try {
      const words = trimmed.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const snippets: string[] = [];
      for (const w of [...new Set(words)].slice(0, 5)) {
        const found = await memoryRepo(store).search(w);
        for (const m of found.slice(0, 2)) {
          const snippet = `${m.category}: ${m.content.slice(0, 200)}`;
          if (!snippets.includes(snippet)) snippets.push(snippet);
        }
        if (snippets.length >= 3) break;
      }
      const turns = history.map((m) => ({ role: m.role === 'assistant' ? 'model' as const : 'user' as const, text: m.text }));
      const chosenMode: IntelligenceMode = mode === 'AUTO' ? autoMode(trimmed) : mode;
      const allSnippets = visionAnalysis ? [`Latest vision analysis: ${visionAnalysis.slice(0, 500)}`, ...snippets.slice(0, 3)] : snippets.slice(0, 3);
      const controller = new AbortController();
      abortRef.current = controller;
      let full = '';
      const onDelta = (delta: string) => {
        full += delta;
        void conversationRepo(store).updateMessages(convo!.id, [...history, { ...assistantMsg, text: full }]);
        setConversations((prev) => prev.map((c) => (c.id === convo!.id ? { ...c, messages: [...history, { ...assistantMsg, text: full }] } : c)));
      };
      setWorkerNotice('');
      if (workerActive) {
        try {
          await streamChatViaWorker(workerUrl, appToken, turns, model, chosenMode, allSnippets, onDelta, controller.signal);
        } catch (workerErr) {
          if (hasGeminiKey()) {
            setWorkerNotice('Worker failed, falling back to BYOK for this message. Worker and BYOK are not mixed silently, this notice is the record of the fallback.');
            full = '';
            await conversationRepo(store).updateMessages(convo!.id, [...history, { ...assistantMsg, text: '' }]);
            await streamChat(turns, model, chosenMode, allSnippets, onDelta, controller.signal);
          } else {
            throw workerErr;
          }
        }
      } else {
        await streamChat(turns, model, chosenMode, allSnippets, onDelta, controller.signal);
      }
      await refresh();
    } catch (err) {
      const chatErr = err instanceof ChatError ? err : new ChatError('SERVER', 'Chat failed.');
      setError(`${chatErr.message} ${recoveryFor(chatErr.code)}`);
      await conversationRepo(store).updateMessages(convo.id, [...history, { ...assistantMsg, text: '' }].filter((m) => m.text !== ''));
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    if (!active || active.messages.length < 2) return;
    const lastUser = [...active.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const trimmed = active.messages.slice(0, active.messages.findIndex((m) => m.id === lastUser.id) + 1);
    await conversationRepo(store).updateMessages(active.id, trimmed);
    await refresh();
    await send(lastUser.text);
  }

  if (view === 'vision') {
    return (
      <div className="page" style={{ gap: 14 }}>
        <header className="chat-top">
          <h1>Live Vision</h1>
          <button type="button" className="btn-ghost" onClick={() => setView('chat')}>Back to Chat</button>
        </header>
        <p className="page-sub">Point the camera at something, capture one frame, and OCTO describes it. Still-image analysis only, not real-time video.</p>
        <LiveVision workerUrl={workerUrl} workerActive={workerActive} appToken={appToken}
          onAnalysis={(text) => setVisionAnalysis(text)} onCameraChange={setVisionOn} />
        {visionAnalysis && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={() => setView('chat')}>Discuss this in Chat</button>
            <button type="button" className="btn-ghost" onClick={() => setVisionAnalysis('')}>Clear vision context</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chat-shell">
      <header className="chat-top">
        <h1>Chat</h1>
        <span className="status-pill"><span className={`status-dot ${workerActive ? '' : 'warn'}`} aria-hidden="true" />{workerActive ? 'Worker' : 'BYOK'}</span>
        <button type="button" className="icon-btn" style={{ width: 44, height: 44 }} aria-label="Open Live Vision" onClick={() => setView('vision')}>
          <Icon name="camera" size={20} label="Camera" />
        </button>
        <div style={{ position: 'relative' }}>
          <button type="button" className="icon-btn" style={{ width: 44, height: 44 }} aria-label="Chat options" aria-expanded={showMenu} onClick={() => setShowMenu((v) => !v)}>
            <Icon name="more" size={20} label="More options" />
          </button>
          {showMenu && (
            <div className="menu-pop glass-strong" role="menu">
              <button type="button" role="menuitem" onClick={() => { void newConversation(); setShowMenu(false); }}>New conversation</button>
              <button type="button" role="menuitem" onClick={() => { setShowTools((v) => !v); setShowMenu(false); }}>{showTools ? 'Hide tools' : 'Show tools'}</button>
              <button type="button" role="menuitem" onClick={() => { setShowVoice((v) => !v); setShowMenu(false); }}>{showVoice ? 'Hide voice controls' : 'Show voice controls'}</button>
              {active && <button type="button" role="menuitem" className="danger" onClick={() => { setConfirmDelete(true); setShowMenu(false); }}>Delete conversation</button>}
            </div>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <select className="pill-select" style={{ flex: '1 1 180px' }} value={activeId} onChange={(e) => setActiveId(e.target.value)} aria-label="Choose conversation">
          {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select className="pill-select" value={mode} onChange={(e) => setMode(e.target.value as IntelligenceMode | 'AUTO')} aria-label="Intelligence mode">
          <option value="AUTO">Auto mode</option>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {showTools && <ToolRunner store={store} onDone={() => void refresh()} />}

      <div className="chat-scroll" ref={scrollRef}>
        {!active ? (
          <EmptyState title="No conversation yet" body="Start a new conversation from the options menu. History is stored on this device in IndexedDB until you export it." />
        ) : (
          <>
            {active.messages.map((m: ChatMessage) => (
              <MessageBubble key={m.id} message={m} streaming={loading && m.role === 'assistant' && m.id === active.messages[active.messages.length - 1]?.id && Boolean(m.text)}
                onCopy={() => { void navigator.clipboard?.writeText(m.text).catch(() => undefined); }}
                onRegenerate={m.role === 'assistant' && m.id === active.messages[active.messages.length - 1]?.id ? () => void regenerate() : undefined} />
            ))}
            {loading && active.messages[active.messages.length - 1]?.text === '' && (
              <div className="bubble-row assistant"><div className="bubble assistant" style={{ color: 'var(--secondary)' }}>OCTO is thinking, streaming will appear here.</div></div>
            )}
          </>
        )}
        {error && <p role="alert" className="glass" style={{ padding: 14, color: '#ff9a9a', lineHeight: 1.55 }}>{error}</p>}
        {workerNotice && <p role="status" className="glass" style={{ padding: 13, color: 'var(--ice)', lineHeight: 1.55 }}>{workerNotice}</p>}
        {visionAnalysis && (
          <div className="glass" style={{ padding: 13, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <span style={{ color: 'var(--secondary)', fontSize: 14, lineHeight: 1.5 }}>Vision context will be included in your next message.</span>
            <button type="button" className="btn-ghost" style={{ minHeight: 38 }} onClick={() => setVisionAnalysis('')}>Clear</button>
          </div>
        )}
      </div>

      <form className="glass composer" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message OCTO" aria-label="Message OCTO" rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
        <VoiceControl compact
          onTranscript={(text) => { void send(text); }}
          onStateChange={(l, s) => { setVoiceListening(l); setVoiceSpeaking(s); }}
          continuous={false} onContinuousChange={() => undefined} />
        {loading
          ? <button type="button" className="icon-btn" aria-label="Stop generation" onClick={() => abortRef.current?.abort()}><Icon name="close" size={20} label="Stop" /></button>
          : <button type="submit" className="icon-btn primary" disabled={!input.trim()} aria-label="Send message"><Icon name="send" size={21} label="Send" /></button>}
      </form>

      {showVoice && (
        <div className="glass" style={{ padding: '14px 16px', marginTop: 10 }}>
          <VoiceControl
            onTranscript={(text) => { void send(text); }}
            onStateChange={(l, s) => { setVoiceListening(l); setVoiceSpeaking(s); }}
            speakText={active?.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.text}
            continuous={continuous} onContinuousChange={setContinuous} />
        </div>
      )}

      {confirmDelete && active && (
        <ConfirmDialog title="Delete this conversation?" body="This deletes the conversation from this device. It cannot be undone unless you exported a backup first." confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)} onConfirm={() => { void conversationRepo(store).remove(active.id).then(() => { setConfirmDelete(false); setActiveId(''); void refresh(); }); }} />
      )}
    </div>
  );
}
