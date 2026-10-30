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
    <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 14px' }}>
        <img src="/icons/icon-180.png" alt="OCTO icon" width="36" height="36" style={{ borderRadius: 10 }} />
        <div><div style={{ fontWeight: 800, fontSize: 20 }}>OCTO</div><div style={{ color: 'var(--secondary)', fontSize: 12 }}>Your intelligence. Your ecosystem. Your assistant.</div></div>
      </div>
      {ITEMS.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-current={section === item.id ? 'page' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '12px', borderRadius: 12, border: '1px solid transparent', background: section === item.id ? 'rgba(53,217,255,0.14)' : 'transparent', color: 'var(--text)', minHeight: 44 }}>
          <Icon name={item.icon} />{item.label}
        </button>
      ))}
    </nav>
  );
}

export function BottomTabBar({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  return (
    <nav aria-label="Main navigation" className="tabbar glass-strong" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, display: 'flex', justifyContent: 'space-around', padding: '8px 4px', zIndex: 40, borderRadius: 24 }}>
      {ITEMS.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-current={section === item.id ? 'page' : undefined}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'transparent', border: 0, color: section === item.id ? 'var(--cyan)' : 'var(--secondary)', fontSize: 11, minWidth: 56, minHeight: 44 }}>
          <Icon name={item.icon} size={22} />{item.label}
        </button>
      ))}
    </nav>
  );
}
