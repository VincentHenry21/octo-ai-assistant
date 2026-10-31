import { motion } from 'framer-motion';
import type { OctoState } from '../../types/index';
import { Icon } from '../Shared/Icon';

const LABELS: Record<OctoState, string> = {
  IDLE: 'OCTO is idle', LISTENING: 'OCTO is listening', THINKING: 'OCTO is thinking',
  RESPONDING: 'OCTO is responding', EXECUTING: 'OCTO is executing an action',
  VISION_ACTIVE: 'Vision is active, camera is on', ERROR: 'OCTO hit an error',
};
const COLORS: Record<OctoState, string> = {
  IDLE: '#35D9FF', LISTENING: '#9AEAFF', THINKING: '#8B7CFF',
  RESPONDING: '#35D9FF', EXECUTING: '#9AEAFF', VISION_ACTIVE: '#8B7CFF', ERROR: '#ff7a7a',
};

// Energy system, not a static circle. Rings, nucleus, waves, and the center
// element all change with the real app state passed in from Chat and Home.
export function OctoCore({ state, size = 260 }: { state: OctoState; size?: number }) {
  const color = COLORS[state];
  const spinning = state === 'THINKING' || state === 'EXECUTING';
  const spinMs = state === 'EXECUTING' ? 2200 : 4200;
  return (
    <div role="status" aria-label={LABELS[state]} style={{ textAlign: 'center', width: '100%' }}>
      <div className="core-wrap" style={{ width: size, height: size, maxWidth: '74vw' }}>
        <div className="core-glow" style={{ background: `radial-gradient(circle, ${color}66, transparent 68%)` }} />
        {state === 'LISTENING' && (
          <>
            <span className="core-wave" />
            <span className="core-wave w2" />
            <span className="core-wave w3" />
          </>
        )}
        <svg className="core-ring" viewBox="0 0 200 200" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="octoOrbit" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#35D9FF" />
              <stop offset="100%" stopColor="#8B7CFF" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <circle cx="100" cy="100" r="78" fill="none" stroke="url(#octoOrbit)" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="4 10" />
          <ellipse cx="100" cy="100" rx="92" ry="52" fill="none" stroke="rgba(139,124,255,0.40)" strokeWidth="1" transform="rotate(-24 100 100)" />
          <ellipse cx="100" cy="100" rx="92" ry="52" fill="none" stroke="rgba(53,217,255,0.30)" strokeWidth="1" transform="rotate(24 100 100)" />
        </svg>
        <motion.svg viewBox="0 0 200 200" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          animate={spinning ? { rotate: 360 } : { rotate: 0 }}
          transition={spinning ? { duration: spinMs / 1000, repeat: Infinity, ease: 'linear' } : { duration: 0.4 }}>
          <circle cx="100" cy="22" r="5" fill={color} />
          <circle cx="100" cy="22" r="9" fill={color} opacity="0.18" />
          <circle cx="178" cy="100" r="4" fill="#8B7CFF" />
          <circle cx="100" cy="178" r="4" fill="#35D9FF" />
        </motion.svg>
        <motion.svg viewBox="0 0 200 200" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          animate={state === 'THINKING' ? { rotate: -360 } : { rotate: 0 }}
          transition={state === 'THINKING' ? { duration: 7, repeat: Infinity, ease: 'linear' } : { duration: 0.4 }}>
          <circle cx="151" cy="49" r="3.5" fill="#8B7CFF" />
          <circle cx="49" cy="151" r="3.5" fill="#35D9FF" />
        </motion.svg>
        <div className={state === 'ERROR' ? 'core-orb err' : 'core-orb'} style={state === 'ERROR' ? undefined : { animationDuration: state === 'RESPONDING' ? '1.1s' : state === 'LISTENING' ? '1.8s' : '3.4s' }}>
          {state === 'VISION_ACTIVE' ? (
            <span style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06222e' }}>
              <span className="core-scanline" aria-hidden="true" />
              <Icon name="eye" size={44} label="Camera active" />
            </span>
          ) : state === 'RESPONDING' ? (
            <span className="core-bars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ animationDelay: `${i * 0.11}s` }} />
              ))}
            </span>
          ) : state === 'ERROR' ? (
            <span style={{ fontSize: 34, fontWeight: 800, color: '#ffd9d9' }}>!</span>
          ) : (
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.85)', boxShadow: '0 0 22px rgba(255,255,255,0.55)' }} />
          )}
        </div>
      </div>
      <p className="core-label" style={{ color }}>{state === 'VISION_ACTIVE' ? 'VISION ACTIVE' : state}</p>
      <p className="core-sub">{LABELS[state]}</p>
    </div>
  );
}
