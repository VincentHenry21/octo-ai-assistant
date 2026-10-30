import { useEffect, useRef, useState } from 'react';
import { checkWorkerHealth, normalizeWorkerUrl } from '../../services/gemini';

export function LiveVision({ workerUrl, workerActive, appToken, onAnalysis }: {
  workerUrl: string; workerActive: boolean; appToken: string; onAnalysis: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [liveStatus, setLiveStatus] = useState('');

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera is not supported in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
      setCameraOn(true);
    } catch {
      setError('Camera permission was denied, or no camera was found. Allow camera access in Safari settings, then try again.');
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function checkLiveToken() {
    if (!workerActive) { setLiveStatus('Connect a Worker in Settings first.'); return; }
    try {
      const res = await fetch(`${normalizeWorkerUrl(workerUrl)}/api/live-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(appToken ? { 'X-Octo-App-Token': appToken } : {}) },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { available?: boolean; expiresAt?: string; reason?: string };
      if (data.available) {
        setLiveStatus(`Live token can be issued, expiring ${data.expiresAt || 'soon'}. Full Live WebSocket voice and video streaming is not implemented in this slice, so analysis below still uses still images, labeled as such.`);
      } else {
        setLiveStatus(`Live token is not available: ${data.reason || 'unavailable'}. Analysis below uses still images through the Worker, not a Live connection.`);
      }
    } catch {
      setLiveStatus('Could not reach the Worker live-token endpoint. Analysis below uses still images through the Worker when it is connected.');
    }
  }

  async function analyzeFrame() {
    if (!workerActive) { setError('Connect a Worker in Settings first. Still-image analysis runs through the Worker, not through BYOK in this slice.'); return; }
    if (!videoRef.current || !cameraOn) { setError('Start the camera first.'); return; }
    setError('');
    setAnalyzing(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1] || '';
      const res = await fetch(`${normalizeWorkerUrl(workerUrl)}/api/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(appToken ? { 'X-Octo-App-Token': appToken } : {}) },
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
      });
      const data = await res.json() as { analysis?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Vision returned HTTP ${res.status}.`);
      const text = data.analysis || '';
      setAnalysis(text);
      onAnalysis(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="glass" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Live Vision</h3>
      <p style={{ color: 'var(--secondary)' }}>
        Mode: Still image analysis. The camera preview below is live, but analysis is a still frame sent through the Worker. This is not presented as a Live connection.
        Use the voice controls above to talk about the latest analysis, which is added as context to your next chat message.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {!cameraOn
          ? <button type="button" className="btn-primary" onClick={() => void startCamera()}>Start camera</button>
          : <button type="button" className="btn-danger" onClick={stopCamera}>Stop camera</button>}
        <button type="button" className="btn-ghost" onClick={() => void checkLiveToken()}>Check Live token status</button>
        <button type="button" className="btn-primary" disabled={!cameraOn || analyzing} onClick={() => void analyzeFrame()}>{analyzing ? 'Analyzing' : 'Analyze this frame'}</button>
      </div>
      {cameraOn && <p role="status" style={{ color: '#ff9a9a', fontWeight: 700 }}>Camera is on. Recording indicator: the camera is active only while this section is open and you started it. Tap Stop camera to end it.</p>}
      <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 16, background: '#080B10', display: cameraOn ? 'block' : 'none' }} />
      {!cameraOn && <p style={{ color: 'var(--secondary)' }}>Camera preview appears here after you start it. No background recording happens.</p>}
      {liveStatus && <p style={{ color: 'var(--secondary)' }}>{liveStatus}</p>}
      {error && <p role="alert" style={{ color: '#ff9a9a' }}>{error}</p>}
      {analysis && <div><h4>Still-image analysis</h4><p style={{ whiteSpace: 'pre-wrap' }}>{analysis}</p></div>}
      <p style={{ color: 'var(--secondary)', fontSize: 13 }}>Worker health: {workerActive ? 'connected' : 'not connected'}. Vision needs a connected Worker. Chat can fall back to BYOK, Vision cannot in this slice.</p>
    </div>
  );
}
