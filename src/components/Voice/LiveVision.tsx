import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Shared/Icon';

export function LiveVision({ workerUrl, workerActive, appToken, onAnalysis, onCameraChange }: {
  workerUrl: string; workerActive: boolean; appToken: string; onAnalysis: (text: string) => void; onCameraChange?: (on: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [liveStatus, setLiveStatus] = useState('');

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => { onCameraChange?.(cameraOn); }, [cameraOn, onCameraChange]);

  async function startCamera(mode: 'environment' | 'user') {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera is not supported in this browser.'); return; }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
      streamRef.current = stream;
      setFacing(mode);
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
      const res = await fetch(`${workerUrl.trim().replace(/\/$/, '')}/api/live-token`, {
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
      const res = await fetch(`${workerUrl.trim().replace(/\/$/, '')}/api/vision`, {
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
    <div className="vision-stage">
      <div className="vision-viewport">
        {cameraOn ? (
          <video ref={videoRef} playsInline muted autoPlay />
        ) : (
          <div className="placeholder">
            <video ref={videoRef} playsInline muted autoPlay style={{ display: 'none' }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--ice)' }}><Icon name="camera" size={40} label="Camera" /></div>
              <p style={{ fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>Camera is off</p>
              <p style={{ margin: 0, lineHeight: 1.55 }}>Start the camera to preview a frame. No background recording happens, and the camera stops when you leave this screen or tap Stop.</p>
            </div>
          </div>
        )}
        <div className="vision-top">
          <span className="status-pill" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <span className={`status-dot ${cameraOn ? '' : 'off'}`} aria-hidden="true" />
            {cameraOn ? 'Camera on' : 'Camera off'}
          </span>
          <span className="status-pill" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <span className={`status-dot ${workerActive ? '' : 'warn'}`} aria-hidden="true" />
            {workerActive ? 'Worker connected' : 'Worker not connected'}
          </span>
        </div>
        <div className="vision-bottom">
          {!cameraOn ? (
            <button type="button" className="icon-btn primary" style={{ width: 64, height: 64 }} aria-label="Start camera" onClick={() => void startCamera(facing)}>
              <Icon name="camera" size={26} label="Start camera" />
            </button>
          ) : (
            <>
              <button type="button" className="icon-btn" aria-label="Switch front and rear camera" onClick={() => void startCamera(facing === 'environment' ? 'user' : 'environment')}>
                <Icon name="flip" size={22} label="Switch camera" />
              </button>
              <button type="button" className="icon-btn primary" style={{ width: 64, height: 64 }} disabled={analyzing} aria-label="Capture and analyze this frame" onClick={() => void analyzeFrame()}>
                {analyzing ? <span style={{ fontSize: 13, fontWeight: 800 }}>...</span> : <Icon name="eye" size={26} label="Analyze frame" />}
              </button>
              <button type="button" className="icon-btn" style={{ background: 'rgba(255,122,122,0.18)', borderColor: 'rgba(255,122,122,0.4)', color: '#ffb3b3' }} aria-label="Stop camera" onClick={stopCamera}>
                <Icon name="close" size={22} label="Stop camera" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="glass vision-mode">
        <div><strong>Mode: Still image analysis.</strong> The preview above is live, but analysis sends one still frame through the Worker. This is not presented as a Live connection, and it is not real-time video.</div>
        <div>Real-time video streaming: not implemented in this build. Real-time multimodal conversation: not implemented in this build. A Live token check only reports whether a short-lived token can be issued, it does not start a Live session.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={() => void checkLiveToken()}>Check Live token status</button>
          {cameraOn && <button type="button" className="btn-ghost" disabled={analyzing} onClick={() => void analyzeFrame()}>{analyzing ? 'Analyzing frame' : 'Analyze this frame'}</button>}
        </div>
        {liveStatus && <p style={{ margin: 0 }}>{liveStatus}</p>}
        {error && <p role="alert" style={{ color: '#ff9a9a', margin: 0 }}>{error}</p>}
      </div>

      {analysis && (
        <section className="glass" style={{ padding: '16px 18px' }}>
          <p className="section-label">Still-image analysis</p>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '10px 0 0' }}>{analysis}</p>
          <p style={{ color: 'var(--secondary)', fontSize: 13.5, margin: '10px 0 0' }}>This analysis is also added as context to your next chat message.</p>
        </section>
      )}
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>Vision needs a connected Worker. Chat can fall back to BYOK, Vision cannot in this slice.</p>
    </div>
  );
}
