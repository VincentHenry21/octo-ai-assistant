import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Shared/Icon';
import { speak, startRecognition, stopSpeaking, voiceSupport } from '../../services/voice';

export type VoiceMode = 'push' | 'continuous';

export function VoiceControl({ onTranscript, onStateChange, speakText, continuous, onContinuousChange }: {
  onTranscript: (text: string) => void;
  onStateChange: (listening: boolean, speaking: boolean) => void;
  speakText?: string;
  continuous: boolean;
  onContinuousChange: (on: boolean) => void;
}) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [continuousSupported, setContinuousSupported] = useState(true);
  const stopRef = useRef<{ stop: () => void } | null>(null);
  const continuousRef = useRef(continuous);
  const lastSpokenRef = useRef('');
  continuousRef.current = continuous;
  const support = voiceSupport();

  useEffect(() => { onStateChange(listening, speaking); }, [listening, speaking, onStateChange]);

  function startListening() {
    setError('');
    const handle = startRecognition(
      (text, isFinal) => { if (isFinal) onTranscript(text); },
      () => {
        setListening(false);
        if (continuousRef.current && !speaking) {
          // Continuous mode returns to listening after a turn, unless speaking is about to start.
          setTimeout(() => { if (continuousRef.current) startListening(); }, 300);
        }
      },
      (msg) => { setError(msg); setListening(false); if (/not supported/i.test(msg)) setContinuousSupported(false); },
    );
    if (!handle) return;
    stopRef.current = handle;
    setListening(true);
  }

  function stopAll() {
    stopRef.current?.stop();
    stopSpeaking();
    setListening(false);
    setSpeaking(false);
  }

  useEffect(() => {
    if (!speakText || speakText === lastSpokenRef.current) return;
    lastSpokenRef.current = speakText;
    if (!support.synthesis) return;
    setSpeaking(true);
    speak(speakText, 1, () => {
      setSpeaking(false);
      if (continuousRef.current) setTimeout(() => startListening(), 300);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakText]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn-ghost" onClick={() => (listening ? stopAll() : startListening())} disabled={!support.recognition} aria-label={listening ? 'Stop listening' : 'Push to talk'}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="mic" size={20} />{listening ? 'Listening, tap to stop' : 'Push to talk'}</span>
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--secondary)' }}>
          <input type="checkbox" checked={continuous} onChange={(e) => {
            const on = e.target.checked;
            onContinuousChange(on);
            if (on) startListening();
            else stopAll();
          }} /> Continuous conversation
        </label>
        <button type="button" className="btn-ghost" onClick={stopAll}>Stop voice</button>
        <span aria-live="polite" style={{ color: 'var(--secondary)', fontSize: 14 }}>
          {listening ? 'Microphone is active.' : speaking ? 'Speaking.' : 'Microphone is off. OCTO does not listen in the background.'}
        </span>
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 4, height: 28, alignItems: 'center', marginTop: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className={listening || speaking ? 'anim-responding-bar' : undefined} style={{ width: 5, height: listening || speaking ? 22 : 8, background: 'var(--cyan)', borderRadius: 3, animationDelay: `${i * 0.11}s`, display: 'inline-block' }} />
        ))}
      </div>
      {!support.recognition && <p style={{ color: 'var(--secondary)' }}>Speech recognition is not supported in this browser. Text input still works, and continuous conversation is not available here.</p>}
      {continuous && !continuousSupported && <p style={{ color: 'var(--secondary)' }}>This browser does not support continuous recognition reliably, so OCTO falls back to push-to-talk turns. Text input still works.</p>}
      {error && <p role="alert" style={{ color: '#ff9a9a' }}>{error}</p>}
    </div>
  );
}
