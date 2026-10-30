import { motion } from 'framer-motion';
import type { OctoState } from '../../types/index';

const LABELS: Record<OctoState, string> = {
  IDLE: 'OCTO is idle', LISTENING: 'OCTO is listening', THINKING: 'OCTO is thinking',
  RESPONDING: 'OCTO is responding', EXECUTING: 'OCTO is executing an action', ERROR: 'OCTO hit an error',
};
const COLORS: Record<OctoState, string> = {
  IDLE: '#35D9FF', LISTENING: '#9AEAFF', THINKING: '#8B7CFF',
  RESPONDING: '#35D9FF', EXECUTING: '#9AEAFF', ERROR: '#ff7a7a',
};

export function OctoCore({ state, size = 180 }: { state: OctoState; size?: number }) {
  const color = COLORS[state];
  return (
    <div role="status" aria-label={LABELS[state]} style={{ textAlign: 'center' }}>
      <motion.div
        style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}
        animate={state === 'IDLE' ? { scale: [1, 1.05, 1] } : state === 'ERROR' ? { scale: [1, 0.96, 1] } : { scale: 1 }}
        transition={state === 'IDLE' ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } : state === 'ERROR' ? { duration: 0.8, repeat: Infinity } : { duration: 0.3 }}
      >
        {state === 'LISTENING' && (
          <motion.div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}` }}
            animate={{ scale: [0.85, 1.45], opacity: [0.9, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
        )}
        <motion.svg width={size} height={size} viewBox="0 0 200 200"
          animate={state === 'THINKING' || state === 'EXECUTING' ? { rotate: 360 } : { rotate: 0 }}
          transition={state === 'THINKING' || state === 'EXECUTING' ? { duration: 4, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}>
          <circle cx="100" cy="100" r="72" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="100" cy="28" r="5" fill={color} />
          <circle cx="172" cy="100" r="5" fill={color} />
          <circle cx="100" cy="172" r="5" fill={color} />
          <circle cx="28" cy="100" r="5" fill={color} />
          <circle cx="151" cy="49" r="4" fill="#8B7CFF" />
          <circle cx="151" cy="151" r="4" fill="#8B7CFF" />
          <circle cx="49" cy="151" r="4" fill="#8B7CFF" />
          <circle cx="49" cy="49" r="4" fill="#8B7CFF" />
        </motion.svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {state === 'RESPONDING' ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 28 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span key={i} style={{ width: 5, background: '#080B10', borderRadius: 3, display: 'inline-block' }}
                  animate={{ height: [8, 24, 8] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }} />
              ))}
            </div>
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, opacity: 0.9 }} />
          )}
        </div>
      </motion.div>
      <p aria-live="polite" style={{ color: 'var(--secondary)', margin: '10px 0 0', fontWeight: 600 }}>{state}</p>
      <p style={{ color: 'var(--secondary)', margin: '2px 0 0', fontSize: 14 }}>{LABELS[state]}</p>
    </div>
  );
}
