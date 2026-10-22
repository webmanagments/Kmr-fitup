// Fitter's calculator on the phone: offsets, rolling offsets, elbow take-outs, miters, spreads.
import {useState} from 'react';
import {ANGLES, bendRadius, elbowTakeout, equalSpread, miter, offset, rollingOffset, type Radius} from '../core/fitmath.ts';
import {formatLength} from '../core/units.ts';
import {outsideDiameter} from '../render/scene.ts';
import {LenInput} from './Setup.tsx';

const ang = (a: number) => (a === 11.25 ? '11¼°' : a === 22.5 ? '22½°' : `${a}°`);

function AnglePick({value, onChange, with90}: {value: number; onChange: (a: number) => void; with90?: boolean}) {
  return (
    <label>
      Fitting angle
      <select value={value} onChange={e => onChange(Number(e.target.value))}>
        {ANGLES.filter(a => with90 || a !== 90).map(a => (
          <option key={a} value={a}>
            {ang(a)}
          </option>
        ))}
      </select>
    </label>
  );
}

const Out = ({label, value, big}: {label: string; value: string; big?: boolean}) => (
  <div className={`calc-o ${big ? 'big' : ''}`}>
    <small>{label}</small>
    <b>{value}</b>
  </div>
);

export default function Calc() {
  const [a1, setA1] = useState(45);
  const [set, setSet] = useState<number | null>(24);
  const [to, setTo] = useState<number | null>(8.5);
  const [a2, setA2] = useState(45);
  const [rise, setRise] = useState<number | null>(12);
  const [roll, setRoll] = useState<number | null>(16);
  const [nps, setNps] = useState(6);
  const [a3, setA3] = useState(90);
  const [rad, setRad] = useState<Radius>('LR');
  const [turn, setTurn] = useState(90);
  const [pieces, setPieces] = useState(3);
  const [spread, setSpread] = useState<number | null>(12);
  const [a4, setA4] = useState(45);
  const o = set !== null ? offset(set, a1) : null;
  const r = rise !== null && roll !== null ? rollingOffset(rise, roll, a2) : null;
  const m = miter(outsideDiameter(nps), turn, pieces);
  return (
    <>
      <div className="card">
        <h3>Offset</h3>
        <div className="grid2">
          <AnglePick value={a1} onChange={setA1} />
          <label>
            Offset (set)
            <LenInput value={set} onChange={setSet} />
          </label>
          <label className="span2">
            Each fitting's take-out (centre to end)
            <LenInput value={to} onChange={setTo} allowEmpty />
          </label>
        </div>
        {o && (
          <div className="calc-outs">
            <Out label="Travel (C-C)" value={formatLength(o.travel)} big />
            <Out label="Run" value={formatLength(o.run)} />
            <Out label="Multiplier" value={`× ${o.multiplier.toFixed(3)}`} />
            {to !== null && <Out label="Cut" value={formatLength(o.travel - 2 * to)} big />}
          </div>
        )}
      </div>
      <div className="card">
        <h3>Rolling offset</h3>
        <div className="grid2">
          <AnglePick value={a2} onChange={setA2} />
          <span />
          <label>
            Rise (vertical)
            <LenInput value={rise} onChange={setRise} />
          </label>
          <label>
            Roll (horizontal)
            <LenInput value={roll} onChange={setRoll} />
          </label>
        </div>
        {r && (
          <div className="calc-outs">
            <Out label="True offset" value={formatLength(r.trueOffset)} />
            <Out label="Travel (C-C)" value={formatLength(r.travel)} big />
            <Out label="Run" value={formatLength(r.run)} />
            {to !== null && <Out label="Cut" value={formatLength(r.travel - 2 * to)} big />}
          </div>
        )}
      </div>
      <div className="card">
        <h3>Elbow take-out at any angle</h3>
        <div className="grid2">
          <label>
            Pipe size
            <select value={nps} onChange={e => setNps(Number(e.target.value))}>
              {[1, 1.5, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24].map(s => (
                <option key={s} value={s}>
                  {s}"
                </option>
              ))}
            </select>
          </label>
          <label>
            Radius
            <select value={rad} onChange={e => setRad(e.target.value as Radius)}>
              {(['LR', 'SR', '3D', '5D'] as Radius[]).map(x => (
                <option key={x} value={x}>
                  {x} ({formatLength(bendRadius(nps, x))})
                </option>
              ))}
            </select>
          </label>
          <AnglePick value={a3} onChange={setA3} with90 />
        </div>
        <div className="calc-outs">
          <Out label="Take-out = R × tan(angle ÷ 2)" value={formatLength(elbowTakeout(nps, a3, rad))} big />
        </div>
        <p className="muted small">For steel butt-weld elbows and bends. Molded HDPE fittings are their own size: use the maker's number (Setup → Fitting sizes).</p>
      </div>
      <div className="card">
        <h3>Mitered turn</h3>
        <div className="grid2">
          <label>
            Turn (degrees)
            <input inputMode="decimal" value={turn} onChange={e => setTurn(Number(e.target.value) || 0)} />
          </label>
          <label>
            Pieces
            <select value={pieces} onChange={e => setPieces(Number(e.target.value))}>
              {[2, 3, 4, 5].map(n => (
                <option key={n} value={n}>
                  {n} ({n - 1} weld{n > 2 ? 's' : ''})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="calc-outs">
          <Out label="Cut angle each end" value={`${m.cutAngle.toFixed(2)}°`} big />
          <Out label={`Cut-back on ${nps}" OD`} value={formatLength(m.cutback)} big />
        </div>
      </div>
      <div className="card">
        <h3>Equal-spread offset</h3>
        <div className="grid2">
          <AnglePick value={a4} onChange={setA4} />
          <label>
            Spread between pipes
            <LenInput value={spread} onChange={setSpread} />
          </label>
        </div>
        {spread !== null && (
          <div className="calc-outs">
            <Out label="Each next pipe is longer by" value={formatLength(equalSpread(spread, a4).difference)} big />
          </div>
        )}
      </div>
    </>
  );
}
