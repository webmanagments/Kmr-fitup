// 3D preview on the phone: drag to turn it, tap a part chip to pick it.
import {useEffect, useMemo, useRef, useState} from 'react';
import type {Solution} from '../core/solve.ts';
import type {Sheet} from '../core/types.ts';
import {drawModel, fitCamera, ISO_PITCH, ISO_YAW} from '../render/draw.ts';
import {buildModel} from '../render/scene.ts';

export default function Preview({sheet, sol, selected, onSelect}: {sheet: Sheet; sol: Solution; selected: string | null; onSelect: (id: string | null) => void}) {
  const model = useMemo(() => buildModel(sheet, sol), [sheet, sol]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState({yaw: ISO_YAW, pitch: ISO_PITCH});
  const [w, setW] = useState(360);
  const H = 300;
  const drag = useRef<{x: number; y: number; yaw: number; pitch: number} | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(H * dpr);
    const part = model.parts.find(p => p.id === selected) ?? null;
    const cam = fitCamera(model, angle.yaw, angle.pitch, w, H, part, 30);
    drawModel(ctx, model, cam, {width: w, height: H, dpr, selected, theme: 'phone'});
  }, [model, angle, w, selected]);

  return (
    <div className="preview" ref={wrap}>
      <canvas
        ref={canvas}
        style={{width: w, height: H, touchAction: 'none'}}
        onPointerDown={e => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = {x: e.clientX, y: e.clientY, ...angle};
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          setAngle({yaw: d.yaw - (e.clientX - d.x) * 0.01, pitch: Math.max(0.0001, Math.min(Math.PI / 2 - 0.0001, d.pitch + (e.clientY - d.y) * 0.01))});
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <div className="chips">
        <button className={`pchip ${selected === null ? 'on' : ''}`} onClick={() => onSelect(null)}>
          All
        </button>
        {model.parts.map(p => (
          <button key={p.id} className={`pchip ${p.kind} ${selected === p.id ? 'on' : ''}`} onClick={() => onSelect(selected === p.id ? null : p.id)}>
            {p.kind === 'pipe' ? p.title : p.title.replace(/^\d+(\.\d+)?" /, '').replace(/ \(item \d+\)$/, '')}
          </button>
        ))}
        <button className="pchip ghost" onClick={() => setAngle({yaw: ISO_YAW, pitch: ISO_PITCH})}>
          Reset view
        </button>
      </div>
    </div>
  );
}
