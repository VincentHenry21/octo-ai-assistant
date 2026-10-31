import { useEffect, useState } from 'react';
import type { Conversation, OctoState, Store, TaskItem, ProjectItem } from '../types/index';
import { OctoCore } from '../components/OctoCore/OctoCore';
import { conversationRepo } from '../database/conversations';
import { taskRepo, projectRepo } from '../database/tasks';
import { executeTool } from '../services/actionEngine';
import { VoiceControl } from '../components/Voice/VoiceControl';
import { Icon } from '../components/Shared/Icon';

export function Home({ store, octoState, keyActive, model, workerStatus, onQuickAsk, onGoChat, onGoVision, onGoWorkspace }: {
  store: Store; octoState: OctoState; keyActive: boolean; model: string; workerStatus: string;
  onQuickAsk: (text: string) => void; onGoChat: () => void; onGoVision: () => void; onGoWorkspace: () => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [input, setInput] = useState('');
  const [plan, setPlan] = useState('');
  const [showPlan, setShowPlan] = useState(false);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const openTasks = tasks.filter((t) => !t.done);
  const connected = workerStatus === 'Worker connected';

  async function refresh() {
    setTasks(await taskRepo(store).list());
    setConversations(await conversationRepo(store).list());
    setProjects(await projectRepo(store).list());
  }
  useEffect(() => { void refresh(); }, [store]);

  return (
    <div className="page" style={{ gap: 20 }}>
      <header className="topbar">
        <div className="wordmark">O<span>C</span>TO</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="status-pill">
            <span className={`status-dot ${connected || keyActive ? '' : 'off'}`} aria-hidden="true" />
            {connected ? 'Worker connected' : keyActive ? 'Key active' : 'Not connected'}
          </span>
          <span className="avatar-btn" aria-hidden="true"><Icon name="avatar" size={22} label="Profile" /></span>
        </div>
      </header>

      <section className="hero">
        <OctoCore state={octoState} size={264} />
        <h1 className="greeting">{greeting}.</h1>
        <p className="core-sub" style={{ fontSize: 15 }}>
          {connected ? `Connected through your Worker. Model: ${model}.` : keyActive ? `Key active in this session. Model: ${model}.` : 'Add a key or connect a Worker in Settings to enable AI chat.'}
        </p>
      </section>

      <form className="glass pill-input" onSubmit={(e) => { e.preventDefault(); if (input.trim()) { onQuickAsk(input.trim()); setInput(''); } }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask OCTO anything" aria-label="Ask OCTO anything" />
        <button type="submit" className="icon-btn primary" aria-label="Send question"><Icon name="send" size={21} label="Send" /></button>
      </form>

      <div className="action-row">
        <VoiceControl compact
          onTranscript={(text) => { onQuickAsk(text); }}
          onStateChange={() => undefined}
          continuous={false} onContinuousChange={() => undefined} />
        <button type="button" className="icon-btn" aria-label="Open Live Vision" onClick={onGoVision}><Icon name="camera" size={22} label="Camera" /></button>
        <button type="button" className="icon-btn" aria-label="Open Chat" onClick={onGoChat}><Icon name="chat" size={22} label="Chat" /></button>
      </div>
      <p className="mini-line">Voice sends your words to Chat. Camera opens Live Vision, still-image analysis only.</p>

      <section className="glass" style={{ padding: '16px 18px' }}>
        <button type="button" onClick={onGoWorkspace} style={{ background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left', color: 'var(--text)' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Today at a glance</span>
            <span style={{ color: 'var(--cyan)', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Workspace</span>
          </span>
          <span style={{ display: 'block', color: 'var(--secondary)', fontSize: 14.5, marginTop: 6, lineHeight: 1.5 }}>
            {openTasks.length} open tasks · {projects.length} projects · {conversations.length} conversations
          </span>
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => {
            if (showPlan && plan) { setShowPlan(false); return; }
            void executeTool(store, 'generate_daily_plan', {}).then((r) => {
              if (r.ok && r.result && typeof r.result === 'object' && 'plan' in r.result) { setPlan(String((r.result as { plan: string }).plan)); setShowPlan(true); }
            });
          }}>
            {showPlan ? 'Hide daily plan' : 'Daily plan from real tasks'}
          </button>
        </div>
        {showPlan && plan && <p style={{ whiteSpace: 'pre-wrap', margin: '13px 0 0', lineHeight: 1.6, fontSize: 14.5 }}>{plan}</p>}
      </section>
    </div>
  );
}
