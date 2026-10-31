import { useEffect, useState } from 'react';
import type { NoteItem, ProjectItem, Store, TaskItem } from '../types/index';
import { taskRepo, noteRepo, projectRepo } from '../database/tasks';
import { ConfirmDialog, EmptyState } from '../components/Shared/ConfirmDialog';
import { Icon } from '../components/Shared/Icon';

type Tab = 'tasks' | 'notes' | 'projects';
type TaskFilter = 'all' | 'open' | 'done';

export function Workspace({ store }: { store: Store }) {
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [query, setQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('open');
  const [taskTitle, setTaskTitle] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [expandedId, setExpandedId] = useState('');
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
  const shownTasks = tasks.filter((t) => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(q)
    && (taskFilter === 'all' || (taskFilter === 'open' ? !t.done : t.done)));
  const shownNotes = notes.filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q));
  const shownProjects = projects.filter((p) => (p.name + ' ' + (p.description || '')).toLowerCase().includes(q));

  return (
    <div className="page">
      <header>
        <p className="eyebrow">Workspace</p>
        <h1 className="page-title">Tasks, notes, projects</h1>
        <p className="page-sub">Everything here lives on this device. Tap an item to see its detail.</p>
      </header>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="seg" role="tablist" aria-label="Workspace sections">
          {(['tasks', 'notes', 'projects'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : undefined} onClick={() => setTab(t)} style={{ flex: 1 }}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="glass pill-input" style={{ padding: '6px 6px 6px 16px' }}>
          <Icon name="search" size={20} label="Search" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workspace" aria-label="Search workspace" />
        </div>
      </div>

      {tab === 'tasks' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="chip-row" role="group" aria-label="Task filter">
            {(['open', 'all', 'done'] as TaskFilter[]).map((f) => (
              <button key={f} type="button" className={`chip ${taskFilter === f ? 'active' : ''}`} onClick={() => setTaskFilter(f)}>
                {f === 'open' ? 'Open' : f === 'all' ? 'All' : 'Done'}
              </button>
            ))}
          </div>
          <form className="glass pill-input" onSubmit={(e) => { e.preventDefault(); if (!taskTitle.trim()) return; void taskRepo(store).create(taskTitle.trim()).then(() => { setTaskTitle(''); void refresh(); }); }}>
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task title" aria-label="New task title" />
            <button type="submit" className="icon-btn primary" aria-label="Add task"><Icon name="plus" size={21} label="Add" /></button>
          </form>
          <section className="glass" style={{ padding: '6px 16px' }}>
            {shownTasks.length === 0 ? <EmptyState title="No tasks here" body="Add a task above. OCTO starts empty, nothing is seeded." /> : (
              <div className="list">
                {shownTasks.map((t) => (
                  <div key={t.id} className="list-row" style={{ alignItems: 'center' }}>
                    <input type="checkbox" checked={t.done} aria-label={`Complete ${t.title}`} style={{ width: 22, height: 22, accentColor: 'var(--cyan)', flex: '0 0 auto' }}
                      onChange={() => { void taskRepo(store).update(t.id, { done: !t.done }).then(() => { if (!t.done) playConfirm(); void refresh(); }); }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-title" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--secondary)' : 'var(--text)' }}>{t.title}</div>
                      <div className="row-meta">{t.done ? 'Done' : 'Open'}</div>
                    </div>
                    <button type="button" className="icon-btn" style={{ width: 40, height: 40, color: '#ffb3b3' }} aria-label={`Delete ${t.title}`} onClick={() => setToDelete({ kind: 'tasks', id: t.id, label: t.title })}><Icon name="trash" size={19} label="Delete" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'notes' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <form className="glass" style={{ padding: 16, display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (!noteTitle.trim() || !noteBody.trim()) return; void noteRepo(store).create(noteTitle.trim(), noteBody.trim()).then(() => { setNoteTitle(''); setNoteBody(''); void refresh(); }); }}>
            <input className="field" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" aria-label="Note title" />
            <textarea className="field" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Note body" aria-label="Note body" rows={3} />
            <button type="submit" className="btn-primary">Save note</button>
          </form>
          <section className="glass" style={{ padding: '6px 16px' }}>
            {shownNotes.length === 0 ? <EmptyState title="No notes yet" body="Save a note above." /> : (
              <div className="list">
                {shownNotes.map((n) => (
                  <div key={n.id}>
                    <button type="button" className="list-row" onClick={() => setExpandedId(expandedId === n.id ? '' : n.id)} aria-expanded={expandedId === n.id}>
                      <span className="row-dot violet" aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span className="row-title" style={{ display: 'block' }}>{n.title}</span>
                        <span className="row-sub" style={{ display: 'block' }}>{expandedId === n.id ? n.body : (n.body.length > 110 ? `${n.body.slice(0, 110)}...` : n.body)}</span>
                      </span>
                    </button>
                    {expandedId === n.id && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 12px 22px' }}>
                        <button type="button" className="btn-danger" onClick={() => setToDelete({ kind: 'notes', id: n.id, label: n.title })}>Delete note</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'projects' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <form className="glass" style={{ padding: 16, display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (!projectName.trim()) return; void projectRepo(store).create(projectName.trim(), projectDesc.trim()).then(() => { setProjectName(''); setProjectDesc(''); void refresh(); }); }}>
            <input className="field" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" aria-label="Project name" />
            <input className="field" value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} placeholder="Project description, optional" aria-label="Project description" />
            <button type="submit" className="btn-primary">Create project</button>
          </form>
          <section className="glass" style={{ padding: '6px 16px' }}>
            {shownProjects.length === 0 ? <EmptyState title="No projects yet" body="Create a project above." /> : (
              <div className="list">
                {shownProjects.map((p) => (
                  <div key={p.id}>
                    <button type="button" className="list-row" onClick={() => setExpandedId(expandedId === p.id ? '' : p.id)} aria-expanded={expandedId === p.id}>
                      <span className="row-dot" aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span className="row-title" style={{ display: 'block' }}>{p.name}</span>
                        {p.description && <span className="row-sub" style={{ display: 'block' }}>{expandedId === p.id ? p.description : (p.description.length > 110 ? `${p.description.slice(0, 110)}...` : p.description)}</span>}
                      </span>
                    </button>
                    {expandedId === p.id && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 12px 22px' }}>
                        <button type="button" className="btn-danger" onClick={() => setToDelete({ kind: 'projects', id: p.id, label: p.name })}>Delete project</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {toDelete && (
        <ConfirmDialog title={`Delete ${toDelete.label}?`} body="This deletes the item from this device. It cannot be undone unless you exported a backup first." confirmLabel="Delete"
          onCancel={() => setToDelete(null)} onConfirm={() => void deleteItem()} />
      )}
    </div>
  );
}
