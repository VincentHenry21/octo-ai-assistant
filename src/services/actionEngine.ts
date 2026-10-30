import type { Store, ToolResult } from '../types/index';
import { taskRepo, noteRepo, projectRepo } from '../database/tasks';
import { memoryRepo } from '../database/memories';
import { MEMORY_CATEGORIES } from '../types/index';
import type { MemoryCategory } from '../types/index';

export const TOOL_NAMES = [
  'create_task', 'list_tasks', 'update_task', 'complete_task',
  'create_note', 'search_notes', 'create_project', 'list_projects',
  'search_memory', 'save_memory', 'calculator', 'get_current_date', 'generate_daily_plan',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function needString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing or invalid argument: ${key}`);
  return v.trim();
}
function safeCalculate(expression: string): number {
  const clean = expression.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(clean) || clean.length > 200) throw new Error('Calculator accepts only numbers and + - * / ( )');
  if (/\*\*|\/\/|\(\)/.test(clean)) throw new Error('Unsupported calculator expression.');
  const fn = Function(`"use strict"; return (${clean});`) as () => unknown;
  const value = fn();
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Calculator did not return a finite number.');
  return value;
}

export async function executeTool(store: Store, tool: string, args: unknown, confirmed = false): Promise<ToolResult> {
  try {
    if (!TOOL_NAMES.includes(tool as ToolName)) return { ok: false, tool, error: `Unknown tool: ${tool}`, code: 'UNKNOWN_TOOL' };
    if (!isRecord(args)) return { ok: false, tool, error: 'Arguments must be an object.', code: 'INVALID_ARGS' };
    const tasks = taskRepo(store);
    const notes = noteRepo(store);
    const projects = projectRepo(store);
    const memories = memoryRepo(store);

    switch (tool as ToolName) {
      case 'create_task': return { ok: true, tool, result: await tasks.create(needString(args, 'title'), typeof args.notes === 'string' ? args.notes : '') };
      case 'list_tasks': return { ok: true, tool, result: await tasks.list() };
      case 'update_task': {
        const patch: Record<string, unknown> = {};
        if (typeof args.title === 'string') patch.title = args.title;
        if (typeof args.notes === 'string') patch.notes = args.notes;
        const updated = await tasks.update(needString(args, 'id'), patch);
        if (!updated) return { ok: false, tool, error: 'Task not found.', code: 'NOT_FOUND' };
        return { ok: true, tool, result: updated };
      }
      case 'complete_task': {
        const updated = await tasks.update(needString(args, 'id'), { done: true });
        if (!updated) return { ok: false, tool, error: 'Task not found.', code: 'NOT_FOUND' };
        return { ok: true, tool, result: updated };
      }
      case 'create_note': return { ok: true, tool, result: await notes.create(needString(args, 'title'), needString(args, 'body')) };
      case 'search_notes': return { ok: true, tool, result: await notes.search(needString(args, 'query')) };
      case 'create_project': return { ok: true, tool, result: await projects.create(needString(args, 'name'), typeof args.description === 'string' ? args.description : '') };
      case 'list_projects': return { ok: true, tool, result: await projects.list() };
      case 'search_memory': return { ok: true, tool, result: await memories.search(needString(args, 'query')) };
      case 'save_memory': {
        if (!confirmed) return { ok: false, tool, error: 'Saving a memory requires explicit user confirmation.', code: 'CONFIRMATION_REQUIRED' };
        const category = needString(args, 'category') as MemoryCategory;
        if (!MEMORY_CATEGORIES.includes(category)) return { ok: false, tool, error: 'Memory category is not valid.', code: 'INVALID_ARGS' };
        return { ok: true, tool, result: await memories.create(category, needString(args, 'content'), false) };
      }
      case 'calculator': return { ok: true, tool, result: { expression: needString(args, 'expression'), value: safeCalculate(needString(args, 'expression')) } };
      case 'get_current_date': return { ok: true, tool, result: { iso: new Date().toISOString(), local: new Date().toLocaleString() } };
      case 'generate_daily_plan': {
        const open = (await tasks.list()).filter((t) => !t.done);
        const done = (await tasks.list()).filter((t) => t.done);
        const projs = await projects.list();
        const lines: string[] = [`Daily plan for ${new Date().toLocaleDateString()}.`];
        if (open.length === 0 && projs.length === 0) {
          lines.push('You have no open tasks and no projects yet, so the plan is open. Add a task in Workspace, then generate the plan again.');
        } else {
          lines.push(`Morning: start with ${open.slice(0, 2).map((t) => t.title).join(', ') || 'reviewing your projects'}.`);
          if (open.length > 2) lines.push(`Afternoon: continue with ${open.slice(2, 5).map((t) => t.title).join(', ')}.`);
          if (projs.length > 0) lines.push(`Projects in focus: ${projs.map((p) => p.name).join(', ')}.`);
          if (done.length > 0) lines.push(`Already done today in your list: ${done.length} task${done.length === 1 ? '' : 's'}.`);
          lines.push('Evening: review what is left and move unfinished items to tomorrow. No task was invented for this plan.');
        }
        return { ok: true, tool, result: { plan: lines.join('\n'), openTaskCount: open.length, projectCount: projs.length } };
      }
      default: return { ok: false, tool, error: 'Tool not implemented.', code: 'NOT_IMPLEMENTED' };
    }
  } catch (err) {
    return { ok: false, tool, error: err instanceof Error ? err.message : 'Tool execution failed.', code: 'EXECUTION_FAILED' };
  }
}
