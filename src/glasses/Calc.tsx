// Fitter's calculator on the glasses: offsets, rolling offsets and elbow take-outs at any angle.
// Pinch a value to change it (swipes in the stepper); angle and size rows cycle on pinch.
import {useState} from 'react';
import {ANGLES, bendRadius, elbowTakeout, offset, rollingOffset, type Radius} from '../core/fitmath.ts';
import {lookup} from '../core/library.ts';
import {formatLength} from '../core/units.ts';
import {dirOf, focusEl} from '../lib/spatial.ts';
import {useCapture} from './keys.ts';
import {Stepper} from './Modal.tsx';
import {getState} from './store.ts';

type Mode = 'offset' | 'rolling' | 'elbow';
const SIZES = [2, 3, 4, 6, 8, 10, 12];
const RADII: Radius[] = ['LR', 'SR', '3D', '5D'];
const ang = (a: number) => (a === 11.25 ? '11¼°' : a === 22.5 ? '22½°' : `${a}°`);

/** The fitting take-out for an elbow of this angle from the library / catalog (HDPE first), if known. */
function catalogTakeout(size: number, angle: number): number | null {
  const type = angle === 90 ? 'elbow90' : angle === 45 ? 'elbow45' : angle === 22.5 ? 'elbow22' : angle === 11.25 ? 'elbow11' : null;
  if (!type) return null;
  const e = lookup(getState().library, type, size, 'hdpe', null, getState().overrides.brand ?? 'gf')?.entry ?? lookup([], type, size, 'steel')?.entry;
  return e?.takeout ?? null;
}

function Row({label, value, onClick, autofocus}: {label: string; value: string; onClick: () => void; autofocus?: boolean}) {
  return (
    <button className="row-btn calc-row" onClick={onClick} data-autofocus={autofocus ? true : undefined}>
      <span className="row-main">
        <b className="row-mid">{label}</b>
      </span>
      <b className="val">{value}</b>
    </button>
  );
}

export default function Calc() {
  const [mode, setMode] = useState<Mode>('offset');
  const [angle, setAngle] = useState(45);
  const [size, setSize] = useState(6);
  const [set, setSet] = useState(24);
  const [rise, setRise] = useState(12);
  const [roll, setRoll] = useState(16);
  const [radius, setRadius] = useState<Radius>('LR');
  const [edit, setEdit] = useState<null | 'set' | 'rise' | 'roll'>(null);
  const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length];
  const to = catalogTakeout(size, angle);

  // Up from the first row lands on the open tab (not the nearest one, which would switch modes).
  useCapture(e => {
    if (dirOf(e) !== 'up') return false;
    const a = document.activeElement as HTMLElement | null;
    const first = document.querySelector('.calc-inputs .row-btn');
    if (!a || a !== first) return false;
    return focusEl(document.querySelector<HTMLElement>(`[data-nav="calc-${mode}"]`));
  });

  const r = mode === 'rolling' ? rollingOffset(rise, roll, angle) : offset(set, angle);
  const cut = to !== null ? r.travel - 2 * to : null;

  return (
    <div className="screen calc">
      <div className="tabs calc-tabs" role="tablist">
        {(['offset', 'rolling', 'elbow'] as Mode[]).map(m => (
          <button key={m} role="tab" aria-selected={mode === m} className={`tab ${mode === m ? 'on' : ''}`} data-nav={`calc-${m}`} onFocus={() => setMode(m)} onClick={() => setMode(m)}>
            {m === 'offset' ? 'Offset' : m === 'rolling' ? 'Rolling' : 'Elbow'}
          </button>
        ))}
      </div>
      <div className="calc-inputs">
        {mode !== 'elbow' && <Row label="Fitting angle" value={ang(angle)} onClick={() => setAngle(cycle(ANGLES.filter(a => a !== 90), angle))} autofocus />}
        {mode === 'offset' && <Row label="Offset (set)" value={formatLength(set)} onClick={() => setEdit('set')} />}
        {mode === 'rolling' && (
          <>
            <Row label="Rise" value={formatLength(rise)} onClick={() => setEdit('rise')} />
            <Row label="Roll" value={formatLength(roll)} onClick={() => setEdit('roll')} />
          </>
        )}
        {mode === 'elbow' && (
          <>
            <Row label="Elbow angle" value={ang(angle)} onClick={() => setAngle(cycle(ANGLES, angle))} autofocus />
            <Row label="Radius" value={`${radius} (${formatLength(bendRadius(size, radius))})`} onClick={() => setRadius(cycle(RADII, radius))} />
          </>
        )}
        <Row label="Pipe size" value={`${size}"`} onClick={() => setSize(cycle(SIZES, size))} />
      </div>
      <div className="calc-out">
        {mode === 'elbow' ? (
          <>
            <p className="muted">Take-out (centre to end) = R × tan(angle ÷ 2)</p>
            <p className="calc-big">{formatLength(elbowTakeout(size, angle, radius))}</p>
            {to !== null && <p className="muted">Your {size}" {ang(angle)} fitting: {formatLength(to)}</p>}
          </>
        ) : (
          <>
            {mode === 'rolling' && (
              <p>
                True offset <b className="amber">{formatLength((r as ReturnType<typeof rollingOffset>).trueOffset)}</b>
              </p>
            )}
            <p>
              Travel <b className="calc-big">{formatLength(r.travel)}</b>
            </p>
            <p className="muted">
              Run {formatLength(r.run)} · ×{r.multiplier.toFixed(3)}
            </p>
            <p>
              {cut !== null ? (
                <>
                  Cut <b className="green">{formatLength(cut)}</b> <small className="muted">(travel − 2 × {formatLength(to)})</small>
                </>
              ) : (
                <span className="muted">No {ang(angle)} fitting size for {size}" yet</span>
              )}
            </p>
          </>
        )}
      </div>
      {edit && (
        <Stepper
          title={edit === 'set' ? 'Offset (set)' : edit === 'rise' ? 'Rise' : 'Roll'}
          start={edit === 'set' ? set : edit === 'rise' ? rise : roll}
          max={50 * 12}
          note="Swipe left / right for an inch, up / down for 1/16 inch."
          bigStep={1}
          onSave={v => (edit === 'set' ? setSet(v) : edit === 'rise' ? setRise(v) : setRoll(v))}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
