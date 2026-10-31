import type { Section } from '../../types/index';
import { Icon } from '../Shared/Icon';

const ITEMS: { id: Section; label: string; icon: 'home' | 'chat' | 'tasks' | 'memory' | 'settings' }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'workspace', label: 'Workspace', icon: 'tasks' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
  { id: 'settings', label: 'Control Center', icon: 'settings' },
];

export function Sidebar({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  return (
    <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px 18px' }}>
        <span style={{ width: 40, height: 40, borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(53,217,255,0.30), rgba(139,124,255,0.30))', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--ice)', fontWeight: 900, letterSpacing: '0.08em', fontSize: 13 }}>O</span>
        <div><div style={{ fontWeight: 900, fontSize: 19, letterSpacing: '0.20em' }}>OCTO</div><div style={{ color: 'var(--secondary)', fontSize: 12.5, lineHeight: 1.4 }}>Your intelligence. Your ecosystem.</div></div>
      </div>
      {ITEMS.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-current={section === item.id ? 'page' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '12px', borderRadius: 15, border: '1px solid transparent', background: section === item.id ? 'rgba(53,217,255,0.13)' : 'transparent', color: section === item.id ? 'var(--text)' : 'var(--secondary)', minHeight: 48, fontWeight: 700, fontSize: 15 }}>
          <Icon name={item.icon} />{item.label}
        </button>
      ))}
    </nav>
  );
}

export function BottomTabBar({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  return (
    <nav aria-label="Main navigation" className="tabbar glass-strong">
      {ITEMS.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-current={section === item.id ? 'page' : undefined}
          className={section === item.id ? 'active' : undefined}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'transparent', border: 0, color: section === item.id ? 'var(--cyan)' : 'var(--secondary)', fontSize: 11, fontWeight: 700 }}>
          <Icon name={item.icon} size={22} />{item.label}
        </button>
      ))}
    </nav>
  );
}
