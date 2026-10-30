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

export function Chat({ store, model, defaultMode, onStateChange, pendingMessage, onPendingConsumed, workerUrl, workerActive, appToken }: {
  store: Store; model: string; defaultMode: IntelligenceMode | 'AUTO';
  onStateChange: (s: OctoState) => void; pendingMessage: string; onPendingConsumed: () => void;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [visionAnalysis, setVisionAnalysis] = useState('');
  const [workerNotice, setWorkerNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const active = conversations.find((c) => c.id === activeId) || null;

  async function refresh() {
    const list = await conversationRepo(store).list();
    setConversations(list);
    if (!activeId && list.length > 0) setActiveId(list[0].id);
  }
  useEffect(() => { void refresh(); }, [store]);
  useEffect(() => { if (pendingMessage) { setInput(pendingMessage); onPendingConsumed(); } }, [pendingMessage, onPendingConsumed]);
  useEffect(() => {
    if (voiceListening) onStateChange('LISTENING');
    else if (voiceSpeaking) onStateChange('RESPONDING');
    else if (loading) onStateChange('THINKING');
    else if (error) onStateChange('ERROR');
    else onStateChange('IDLE');
  }, [voiceListening, voiceSpeaking, loading, error, onStateChange]);

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

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-primary" onClick={() => void newConversation()}>New conversation</button>
        <select className="field" style={{ width: 'auto', flex: '1 1 200px' }} value={activeId} onChange={(e) => setActiveId(e.target.value)} aria-label="Choose conversation">
          {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select className="field" style={{ width: 'auto' }} value={mode} onChange={(e) => setMode(e.target.value as IntelligenceMode | 'AUTO')} aria-label="Intelligence mode">
          <option value="AUTO">Auto mode</option>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="button" className="btn-ghost" onClick={() => setShowTools((v) => !v)}>Tools</button>
        {active && <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete conversation</button>}
      </div>
      {showTools && <ToolRunner store={store} onDone={() => void refresh()} />}
      {!active ? (
        <EmptyState title="No conversation yet" body="Start a new conversation. History is stored on this device in IndexedDB until you export it." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {active.messages.map((m: ChatMessage) => (
            <MessageBubble key={m.id} message={m}
              onCopy={() => { void navigator.clipboard?.writeText(m.text).catch(() => undefined); }}
              onRegenerate={m.role === 'assistant' && m.id === active.messages[active.messages.length - 1]?.id ? () => void regenerate() : undefined} />
          ))}
          {loading && <p aria-live="polite" style={{ color: 'var(--secondary)' }}>OCTO is thinking, streaming will appear here.</p>}
          {error && <p role="alert" className="glass" style={{ padding: 14, color: '#ff9a9a' }}>{error}</p>}
        </div>
      )}
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message OCTO" aria-label="Message OCTO" rows={2} style={{ resize: 'vertical' }} />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>{loading ? 'Sending' : 'Send'}</button>
        {loading && <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>Stop</button>}
      </form>
      {workerNotice && <p role="status" className="glass" style={{ padding: 12, color: 'var(--ice)' }}>{workerNotice}</p>}
      {visionAnalysis && (
        <div className="glass" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ color: 'var(--secondary)' }}>Vision context will be included in your next message.</span>
          <button type="button" className="btn-ghost" onClick={() => setVisionAnalysis('')}>Clear vision context</button>
        </div>
      )}
      <VoiceControl
        onTranscript={(text) => { void send(text); }}
        onStateChange={(l, s) => { setVoiceListening(l); setVoiceSpeaking(s); }}
        speakText={active?.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.text}
        continuous={continuous} onContinuousChange={setContinuous} />
      <LiveVision workerUrl={workerUrl} workerActive={workerActive} appToken={appToken} onAnalysis={(text) => setVisionAnalysis(text)} />
      {confirmDelete && active && (
        <ConfirmDialog title="Delete this conversation?" body="This deletes the conversation from this device. It cannot be undone unless you exported a backup first." confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)} onConfirm={() => { void conversationRepo(store).remove(active.id).then(() => { setConfirmDelete(false); setActiveId(''); void refresh(); }); }} />
      )}
    </div>
  );
}
