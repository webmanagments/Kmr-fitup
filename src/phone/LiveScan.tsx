// Full-screen live camera. Watches every frame and takes the picture by itself the moment the
// sheet is steady, sharp, well lit and filling the view (or tap the shutter any time).
import {useEffect, useRef, useState} from 'react';
import {loadPhoto, type Photo} from './image.ts';
import {makeJudge, measure, type CheckId, type Verdict} from './live.ts';

const CHECKS: [CheckId, string][] = [
  ['sheet', 'Sheet'],
  ['light', 'Light'],
  ['steady', 'Steady'],
  ['sharp', 'Sharp'],
];

export default function LiveScan({title, target, closeUp, onPhoto, onClose}: {title: string; target?: string; closeUp?: boolean; onPhoto: (p: Photo) => void; onClose: () => void}) {
  const video = useRef<HTMLVideoElement>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [auto, setAuto] = useState(true);
  const stream = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  const snap = async () => {
    const v = video.current;
    if (!v || busy.current || !v.videoWidth) return;
    busy.current = true;
    setSnapping(true);
    try {
      // Take a short burst at full resolution and keep the sharpest frame.
      const full = document.createElement('canvas');
      full.width = v.videoWidth;
      full.height = v.videoHeight;
      const fctx = full.getContext('2d', {willReadFrequently: true})!;
      const probe = document.createElement('canvas');
      const pw = 640;
      probe.width = pw;
      probe.height = Math.round((pw * v.videoHeight) / v.videoWidth);
      const pctx = probe.getContext('2d', {willReadFrequently: true})!;
      let best: {blob: Blob; s: number} | null = null;
      for (let i = 0; i < 3; i++) {
        if (i) await new Promise(r => setTimeout(r, 110));
        fctx.drawImage(v, 0, 0);
        pctx.drawImage(full, 0, 0, probe.width, probe.height);
        const s = measure({w: probe.width, h: probe.height, data: pctx.getImageData(0, 0, probe.width, probe.height).data}, null).m.sharpness;
        if (!best || s > best.s) {
          const blob = await new Promise<Blob | null>(r => full.toBlob(r, 'image/jpeg', 0.95));
          if (blob) best = {blob, s};
        }
      }
      if (!best) throw new Error('no frame');
      navigator.vibrate?.(60);
      const photo = await loadPhoto(new File([best.blob], 'live.jpg', {type: 'image/jpeg'}));
      onPhoto(photo);
    } catch {
      setErr("Couldn't take the picture. Try the shutter again.");
      busy.current = false;
      setSnapping(false);
    }
  };
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    let stop = false;
    let timer = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('This browser has no live camera. Use Take photo instead.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 3840}, height: {ideal: 2160}}});
        if (stop) return s.getTracks().forEach(t => t.stop());
        stream.current = s;
        const track = s.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {torch?: boolean; focusMode?: string[]};
        if (caps.torch) setTorch(false);
        if (caps.focusMode?.includes('continuous')) void track.applyConstraints({advanced: [{focusMode: 'continuous'} as MediaTrackConstraintSet]}).catch(() => {});
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
      } catch (e) {
        const name = (e as Error).name;
        setErr(name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for this site in your browser settings, or use Take photo.' : "Couldn't open the camera. Use Take photo instead.");
        return;
      }
      const judge = makeJudge({needPaper: closeUp ? 0.45 : 0.32});
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d', {willReadFrequently: true})!;
      let prev: Float32Array | null = null;
      const tick = () => {
        if (stop) return;
        const v = video.current;
        if (v && v.videoWidth && !busy.current) {
          c.width = 200;
          c.height = Math.round((200 * v.videoHeight) / v.videoWidth);
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const r = measure({w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data}, prev);
          prev = r.g;
          const verdict = judge.push(r.m, performance.now());
          setVerdict(verdict);
          if (verdict.ready && autoRef.current) void snapRef.current();
        }
        timer = window.setTimeout(tick, 120);
      };
      tick();
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, [closeUp]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({advanced: [{torch: !torch} as MediaTrackConstraintSet]});
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const allOk = verdict && CHECKS.every(([k]) => verdict.ok[k]);
  return (
    <div className="live" role="dialog" aria-label={title}>
      <video ref={video} className="live-video" playsInline muted autoPlay />
      <div className={`live-frame ${allOk ? 'ok' : ''} ${closeUp ? 'close' : ''}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="live-top">
        <button className="live-x" onClick={onClose} aria-label="Close camera">
          ×
        </button>
        <div className="live-title">
          <b>{title}</b>
          {target && <small>{target}</small>}
        </div>
        {torch !== null && (
          <button className={`live-torch ${torch ? 'on' : ''}`} onClick={() => void toggleTorch()} aria-label="Flashlight">
            ⚡
          </button>
        )}
      </div>
      <div className="live-bottom">
        {err ? (
          <p className="live-tip err">{err}</p>
        ) : (
          <>
            <p className={`live-tip ${allOk ? 'ok' : ''}`}>{snapping ? 'Got it ✓' : (verdict?.tip ?? 'Starting camera…')}</p>
            <div className="live-checks">
              {CHECKS.map(([k, label]) => (
                <span key={k} className={verdict?.ok[k] ? 'on' : ''}>
                  {verdict?.ok[k] ? '✓' : '·'} {label}
                </span>
              ))}
            </div>
          </>
        )}
        <div className="live-row">
          <button className={`live-auto ${auto ? 'on' : ''}`} onClick={() => setAuto(a => !a)}>
            Auto {auto ? 'on' : 'off'}
          </button>
          <button className="live-shutter" onClick={() => void snap()} disabled={snapping || !!err} aria-label="Take the picture now" />
          <span className="live-spacer" />
        </div>
      </div>
    </div>
  );
}
