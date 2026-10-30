import type { Conversation, TaskItem } from '../../types/index';
import { EmptyState } from '../Shared/ConfirmDialog';

export function Dashboard({ tasks, conversations, health, onOpenChat, onOpenWorkspace }: {
  tasks: TaskItem[]; conversations: Conversation[]; health: { ok: boolean; geminiConfigured: boolean; model: string } | null;
  onOpenChat: () => void; onOpenWorkspace: () => void;
}) {
  const openTasks = tasks.filter((t) => !t.done);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 8px' }}>Today</h2>
        {openTasks.length === 0 ? (
          <EmptyState title="No open tasks" body="Create your first task in Workspace. Nothing is seeded for you." />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {openTasks.slice(0, 5).map((t) => <li key={t.id}>{t.title}</li>)}
          </ul>
        )}
        <button type="button" className="btn-ghost" style={{ marginTop: 12 }} onClick={onOpenWorkspace}>Open Workspace</button>
      </section>
      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 8px' }}>Recent conversations</h2>
        {conversations.length === 0 ? (
          <EmptyState title="No conversations yet" body="Start a conversation in Chat. History is stored on this device until Supabase is connected." />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {conversations.slice(0, 5).map((c) => <li key={c.id}>{c.title} ({c.messages.length} messages)</li>)}
          </ul>
        )}
        <button type="button" className="btn-ghost" style={{ marginTop: 12 }} onClick={onOpenChat}>Open Chat</button>
      </section>
      <section className="glass" style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 8px' }}>System status</h2>
        <p style={{ color: 'var(--secondary)', margin: 0 }}>
          {health === null ? 'Checking backend health.' : health.geminiConfigured ? `Backend reachable. Gemini is configured. Model: ${health.model}.` : 'Backend reachable, but Gemini is not configured. Add GEMINI_API_KEY on the server to enable AI chat.'}
        </p>
      </section>
    </div>
  );
}
