// The 3D spool. Swipe left/right to step through the parts (pipes and fittings in order),
// swipe down to change the view, pinch for the full details of the part.
import {useEffect, useMemo, useRef, useState} from 'react';
import type {Solution} from '../core/solve.ts';
import type {Sheet} from '../core/types.ts';
import {formatLength} from '../core/units.ts';
import {dirOf} from '../lib/spatial.ts';
import {drawModel, fitCamera, ISO_PITCH, ISO_YAW, lerpCam, type Camera} from '../render/draw.ts';
import {buildModel, type Part} from '../render/scene.ts';
import {useCapture} from './keys.ts';

export const VIEWS = [
  {name: 'Iso', yaw: ISO_YAW, pitch: ISO_PITCH, spin: false},
  {name: 'Spin', yaw: ISO_YAW, pitch: 0.42, spin: true},
  {name: 'Top', yaw: 0, pitch: Math.PI / 2 - 0.0001, spin: false},
  {name: 'Look N', yaw: 0, pitch: 0.0001, spin: false},
  {name: 'Look W', yaw: Math.PI / 2, pitch: 0.0001, spin: false},
] as const;

interface Props {
  sheet: Sheet;
  sol: Solution;
  width: number;
  height: number;
  done: Set<string>;
  fused: Set<string>;
  selected: number; // -1 = whole spool
  onSelect: (i: number) => void;
  view: number;
  onView: (i: number) => void;
  onOpen: (part: Part | null) => void;
}

export function useParts(sheet: Sheet, sol: Solution) {
  return useMemo(() => buildModel(sheet, sol), [sheet, sol]);
}

export default function ModelView({sheet, sol, width, height, done, fused, selected, onSelect, view, onView, onOpen}: Props) {
  const model = useParts(sheet, sol);
  const canvas = useRef<HTMLCanvasElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cam = useRef<Camera | null>(null);
  const spin = useRef(0);
  const [focused, setFocused] = useState(false);
  const part = selected >= 0 ? (model.parts[selected] ?? null) : null;
  const live = useRef({part, view, done, fused, model});
  live.current = {part, view, done, fused, model};

  useCapture(e => {
    if (document.activeElement !== btn.current) return false;
    const d = dirOf(e);
    const n = model.parts.length;
    if (d === 'right') onSelect(selected + 1 >= n ? -1 : selected + 1);
    else if (d === 'left') onSelect(selected - 1 < -1 ? n - 1 : selected - 1);
    else if (d === 'down') onView((view + 1) % VIEWS.length);
    else return false;
    return true;
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let idle = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const {part: p, view: vi, model: m} = live.current;
      const V = VIEWS[vi];
      if (V.spin) spin.current += dt * 0.35;
      else spin.current *= Math.max(0, 1 - dt * 4);
      const goal = fitCamera(m, V.yaw + spin.current, V.pitch, width, height, p);
      const prev = cam.current ?? goal;
      const next = lerpCam(prev, goal, 1 - Math.exp(-dt * 7));
      const moving = Math.abs(next.scale - prev.scale) > 1e-3 || Math.abs(next.yaw - prev.yaw) > 1e-4 || Math.abs(next.target.x - prev.target.x) > 0.01 || V.spin;
      cam.current = next;
      if (moving || idle < 2) {
        drawModel(ctx, m, next, {width, height, dpr, selected: p?.id ?? null, done: live.current.done, fused: live.current.fused});
        idle = moving ? 0 : idle + 1;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  // Redraw when marks change even if the camera is still.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!ctx || !cam.current) return;
    drawModel(ctx, model, cam.current, {width, height, dpr: c!.width / width, selected: part?.id ?? null, done, fused});
  }, [done, fused, model, part, width, height]);

  return (
    <button
      ref={btn}
      className={`model ${focused ? 'focused' : ''}`}
      style={{width, height}}
      data-autofocus
      data-nav="model"
      aria-label={part ? `Selected ${part.title}. Pinch for details.` : 'Whole spool. Swipe left or right to pick a part.'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => onOpen(part)}
    >
      <canvas ref={canvas} style={{width, height}} />
      <span className="model-view" aria-hidden="true">
        {VIEWS[view].name}
      </span>
      {focused && (
        <span className="model-hint" aria-hidden="true">
          ◀ ▶ part · ▼ view · pinch details
        </span>
      )}
      {!focused && (
        <span className="model-hint" aria-hidden="true">
          {model.parts.length} parts · {formatLength(sol.totalCut)} of pipe
        </span>
      )}
    </button>
  );
}
