import { useEffect, useState } from 'react';
import type { Conversation, OctoState, Store, TaskItem, ProjectItem } from '../types/index';
import { OctoCore } from '../components/OctoCore/OctoCore';
import { Dashboard } from '../components/Dashboard/Dashboard';
import { conversationRepo } from '../database/conversations';
import { taskRepo, projectRepo } from '../database/tasks';
import { executeTool } from '../services/actionEngine';
import { TAGLINE } from '../config/index';

export function Home({ store, octoState, keyActive, model, onQuickAsk, onGoChat, onGoWorkspace }: {
  store: Store; octoState: OctoState; keyActive: boolean; model: string;
  onQuickAsk: (text: string) => void; onGoChat: () => void; onGoWorkspace: () => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [input, setInput] = useState('');
  const [plan, setPlan] = useState('');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  async function refresh() {
    setTasks(await taskRepo(store).list());
    setConversations(await conversationRepo(store).list());
    setProjects(await projectRepo(store).list());
  }
  useEffect(() => { void refresh(); }, [store]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <OctoCore state={octoState} />
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: '4px 0' }}>{greeting}, welcome to OCTO</h1>
        <p style={{ color: 'var(--secondary)', margin: 0 }}>{TAGLINE}</p>
        <p style={{ color: 'var(--secondary)', fontSize: 14 }}>{keyActive ? `Gemini key is active in this session. Model: ${model}.` : 'No Gemini key is active. Enter your key in Settings to enable AI chat.'}</p>
      </div>
      <form className="glass" style={{ padding: 12, display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (input.trim()) { onQuickAsk(input.trim()); setInput(''); } }}>
        <input className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask OCTO anything" aria-label="Ask OCTO anything" />
        <button type="submit" className="btn-primary">Ask</button>
      </form>
      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 8px' }}>Daily briefing</h2>
        <p style={{ color: 'var(--secondary)', margin: '0 0 8px' }}>
          {tasks.filter((t) => !t.done).length} open tasks, {projects.length} active projects, {conversations.length} conversations.
        </p>
        <button type="button" className="btn-ghost" onClick={() => { void executeTool(store, 'generate_daily_plan', {}).then((r) => { if (r.ok && r.result && typeof r.result === 'object' && 'plan' in r.result) setPlan(String((r.result as { plan: string }).plan)); }); }}>
          Generate daily plan from real tasks
        </button>
        {plan && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{plan}</p>}
      </section>
      <Dashboard tasks={tasks} conversations={conversations} health={{ ok: true, geminiConfigured: keyActive, model }} onOpenChat={onGoChat} onOpenWorkspace={onGoWorkspace} />
    </div>
  );
}
