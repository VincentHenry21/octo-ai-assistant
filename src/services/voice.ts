// Web Speech API only. No continuous background listening. Listening starts only
// when the user taps push-to-talk, and stops on tap, on result, or on error.
export type VoiceSupport = { recognition: boolean; synthesis: boolean };

export function voiceSupport(): VoiceSupport {
  const w = window as unknown as Record<string, unknown>;
  return {
    recognition: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    synthesis: 'speechSynthesis' in window,
  };
}

export function requestMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function startRecognition(
  onResult: (text: string, isFinal: boolean) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): { stop: () => void } | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => {
    lang: string; interimResults: boolean; continuous: boolean;
    onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    start: () => void; stop: () => void;
  }) | undefined;
  if (!Ctor) { onError('Speech recognition is not supported in this browser.'); return null; }
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    if (last) onResult(last[0].transcript, last.isFinal);
  };
  rec.onend = onEnd;
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError('Microphone permission was denied. Allow microphone access in Safari settings, then try again.');
    else if (e.error === 'audio-capture') onError('No microphone was found.');
    else onError(`Speech recognition failed: ${e.error}.`);
  };
  try { rec.start(); } catch { onError('Speech recognition could not start.'); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

export function speak(text: string, rate = 1, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  if (onEnd) utter.onend = onEnd;
  window.speechSynthesis.speak(utter);
}
export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
