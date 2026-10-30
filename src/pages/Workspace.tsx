import { useEffect, useState } from 'react';
import type { NoteItem, ProjectItem, Store, TaskItem } from '../types/index';
import { taskRepo, noteRepo, projectRepo } from '../database/tasks';
import { ConfirmDialog, EmptyState } from '../components/Shared/ConfirmDialog';

type Tab = 'tasks' | 'notes' | 'projects';

export function Workspace({ store }: { store: Store }) {
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [query, setQuery] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [toDelete, setToDelete] = useState<{ kind: Tab; id: string; label: string } | null>(null);

  async function refresh() {
    setTasks(await taskRepo(store).list());
    setNotes(await noteRepo(store).list());
    setProjects(await projectRepo(store).list());
  }
  useEffect(() => { void refresh(); }, [store]);

  function playConfirm() {
    try { const audio = new Audio(`${import.meta.env.BASE_URL}sounds/confirm.wav`); void audio.play().catch(() => undefined); } catch { /* sound is optional */ }
  }

  async function deleteItem() {
    if (!toDelete) return;
    if (toDelete.kind === 'tasks') await taskRepo(store).remove(toDelete.id);
    if (toDelete.kind === 'notes') await noteRepo(store).remove(toDelete.id);
    if (toDelete.kind === 'projects') await projectRepo(store).remove(toDelete.id);
    setToDelete(null);
    await refresh();
  }

  const q = query.toLowerCase();
  const shownTasks = tasks.filter((t) => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(q));
  const shownNotes = notes.filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q));
  const shownProjects = projects.filter((p) => (p.name + ' ' + (p.description || '')).toLowerCase().includes(q));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['tasks', 'notes', 'projects'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
        <input className="field" style={{ flex: '1 1 200px' }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workspace" aria-label="Search workspace" />
      </div>

      {tab === 'tasks' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <form className="glass" style={{ padding: 14, display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!taskTitle.trim()) return; void taskRepo(store).create(taskTitle.trim()).then(() => { setTaskTitle(''); void refresh(); }); }}>
            <input className="field" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task title" aria-label="New task title" />
            <button type="submit" className="btn-primary">Add task</button>
          </form>
          {shownTasks.length === 0 ? <EmptyState title="No tasks yet" body="Add a task above. OCTO starts empty, nothing is seeded." /> : shownTasks.map((t) => (
            <div key={t.id} className="glass" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={t.done} aria-label={`Complete ${t.title}`} onChange={() => { void taskRepo(store).update(t.id, { done: !t.done }).then(() => { if (!t.done) playConfirm(); void refresh(); }); }} />
              <span style={{ flex: 1, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--secondary)' : 'var(--text)' }}>{t.title}</span>
              <button type="button" className="btn-danger" onClick={() => setToDelete({ kind: 'tasks', id: t.id, label: t.title })}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'notes' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <form className="glass" style={{ padding: 14, display: 'grid', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!noteTitle.trim() || !noteBody.trim()) return; void noteRepo(store).create(noteTitle.trim(), noteBody.trim()).then(() => { setNoteTitle(''); setNoteBody(''); void refresh(); }); }}>
            <input className="field" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" aria-label="Note title" />
            <textarea className="field" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Note body" aria-label="Note body" rows={3} />
            <button type="submit" className="btn-primary">Save note</button>
          </form>
          {shownNotes.length === 0 ? <EmptyState title="No notes yet" body="Save a note above." /> : shownNotes.map((n) => (
            <div key={n.id} className="glass" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{n.title}</strong><button type="button" className="btn-danger" onClick={() => setToDelete({ kind: 'notes', id: n.id, label: n.title })}>Delete</button></div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'projects' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <form className="glass" style={{ padding: 14, display: 'grid', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!projectName.trim()) return; void projectRepo(store).create(projectName.trim(), projectDesc.trim()).then(() => { setProjectName(''); setProjectDesc(''); void refresh(); }); }}>
            <input className="field" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" aria-label="Project name" />
            <input className="field" value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} placeholder="Project description, optional" aria-label="Project description" />
            <button type="submit" className="btn-primary">Create project</button>
          </form>
          {shownProjects.length === 0 ? <EmptyState title="No projects yet" body="Create a project above." /> : shownProjects.map((p) => (
            <div key={p.id} className="glass" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{p.name}</strong><button type="button" className="btn-danger" onClick={() => setToDelete({ kind: 'projects', id: p.id, label: p.name })}>Delete</button></div>
              {p.description && <p style={{ color: 'var(--secondary)' }}>{p.description}</p>}
            </div>
          ))}
        </div>
      )}

      {toDelete && (
        <ConfirmDialog title={`Delete ${toDelete.label}?`} body="This deletes the item from this device. It cannot be undone unless you exported a backup first." confirmLabel="Delete"
          onCancel={() => setToDelete(null)} onConfirm={() => void deleteItem()} />
      )}
    </div>
  );
}
