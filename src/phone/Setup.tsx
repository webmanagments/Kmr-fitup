// Phone settings: Claude key and model, shop numbers, and the fitting take-out library.
import {useState} from 'react';
import {DEFAULT_SETTINGS, type Material, type TakeoutEntry} from '../core/library.ts';
import {MODELS} from '../core/reader.ts';
import {FITTING_NAME, type FittingType} from '../core/types.ts';
import {formatLength, parseLength, parseSize} from '../core/units.ts';
import {getPrefs, setPrefs, usePrefs} from './prefs.ts';

function LenInput({value, onChange, placeholder, allowEmpty}: {value: number | null; onChange: (v: number | null) => void; placeholder?: string; allowEmpty?: boolean}) {
  const [text, setText] = useState(value === null ? '' : formatLength(value));
  const parsed = parseLength(text);
  const bad = text.trim() !== '' && parsed === null;
  return (
    <input
      className={bad ? 'bad' : ''}
      value={text}
      placeholder={placeholder}
      onChange={e => {
        setText(e.target.value);
        const v = parseLength(e.target.value);
        if (v !== null) onChange(v);
        else if (allowEmpty && e.target.value.trim() === '') onChange(null);
      }}
      onBlur={() => parsed !== null && setText(formatLength(parsed))}
    />
  );
}

export function KeyCard() {
  const p = usePrefs();
  const [show, setShow] = useState(false);
  return (
    <div className="card">
      <h3>Claude</h3>
      <label>
        Your Anthropic API key
        <span className="keyrow">
          <input type={show ? 'text' : 'password'} value={p.apiKey} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} onChange={e => setPrefs({apiKey: e.target.value.trim()})} />
          <button className="ghost" onClick={() => setShow(s => !s)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      <label>
        Model
        <select value={p.model} onChange={e => setPrefs({model: e.target.value})}>
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        The key stays in this phone's browser and is only ever sent to Anthropic. Get one at console.anthropic.com. Reads so far: {p.spent.reads} ({Math.round((p.spent.input + p.spent.output) / 1000)}k tokens).
      </p>
    </div>
  );
}

const TYPES = Object.entries(FITTING_NAME).filter(([t]) => t !== 'other') as [FittingType, string][];

export function ShopCard() {
  const p = usePrefs();
  const s = p.settings;
  const set = (k: keyof typeof s, v: number | null) => setPrefs({settings: {...getPrefs().settings, [k]: v}});
  return (
    <div className="card">
      <h3>Shop numbers</h3>
      <div className="grid2">
        <label>
          HDPE fusion allowance per end
          <LenInput value={s.fusionAllowance} onChange={v => set('fusionAllowance', v)} placeholder="not set" allowEmpty />
        </label>
        <label>
          Steel root gap
          <LenInput value={s.rootGap} onChange={v => set('rootGap', v ?? DEFAULT_SETTINGS.rootGap)} />
        </label>
        <label>
          Stick length
          <LenInput value={s.stickLength} onChange={v => set('stickLength', v ?? DEFAULT_SETTINGS.stickLength)} />
        </label>
        <label>
          Lost per saw cut
          <LenInput value={s.cutWaste} onChange={v => set('cutWaste', v ?? DEFAULT_SETTINGS.cutWaste)} />
        </label>
      </div>
      <p className="muted small">The fusion allowance is added to each fused pipe end (facing + bead). Take it from your fusion procedure; leave it empty to cut fitting-to-fitting.</p>
    </div>
  );
}

export function LibraryCard() {
  const p = usePrefs();
  const [type, setType] = useState<FittingType>('elbow90');
  const [size, setSize] = useState('6');
  const [mat, setMat] = useState<Material>('hdpe');
  const [to, setTo] = useState<number | null>(null);
  const [br, setBr] = useState<number | null>(null);
  const [lay, setLay] = useState<number | null>(null);
  const [k, setK] = useState(0);
  const add = () => {
    const sz = parseSize(size);
    if (sz === null || (to === null && br === null && lay === null)) return;
    const entry: TakeoutEntry = {id: `${type}-${sz}-${mat}`, type, size: sz, material: mat, takeout: to, branch: br, laying: lay};
    setPrefs({library: [entry, ...getPrefs().library.filter(e => !(e.type === type && e.size === sz && e.material === mat))]});
    setTo(null);
    setBr(null);
    setLay(null);
    setK(x => x + 1);
  };
  return (
    <div className="card">
      <h3>Fitting take-outs</h3>
      <p className="muted small">Centre-to-end of your fittings, from the maker's sheet. Used when the drawing doesn't print one. Without an entry here, HDPE 90s, 45s and tees use the GF Central Plastics molded DR11 catalog (6": 90 = 8 5/8", 45 = 8 1/2", tee = 9"), and steel uses ASME B16.9 long-radius.</p>
      {p.library.length ? (
        <table className="results lib">
          <tbody>
            {p.library.map(e => (
              <tr key={e.id}>
                <td>
                  <b>
                    {e.size}" {FITTING_NAME[e.type]}
                  </b>
                  <small>{e.material === 'hdpe' ? 'HDPE' : 'Steel'}</small>
                </td>
                <td>
                  {e.takeout !== null && <span>run {formatLength(e.takeout)} </span>}
                  {e.branch != null && <span>branch {formatLength(e.branch)} </span>}
                  {e.laying != null && <span>body {formatLength(e.laying)}</span>}
                </td>
                <td>
                  <button className="x" aria-label="Remove" onClick={() => setPrefs({library: getPrefs().library.filter(x => x !== e)})}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No fittings yet: the catalog values are used.</p>
      )}
      <div className="presets">
        <button
          className="btn small"
          onClick={() => {
            const mine: TakeoutEntry[] = [
              {id: 'elbow90-6-hdpe', type: 'elbow90', size: 6, material: 'hdpe', takeout: 36, branch: null, laying: null, note: 'Field number (unverified)'},
              {id: 'elbow45-6-hdpe', type: 'elbow45', size: 6, material: 'hdpe', takeout: 30, branch: null, laying: null, note: 'Field number (unverified)'},
            ];
            setPrefs({library: [...mine, ...getPrefs().library.filter(e => !mine.some(m => m.type === e.type && m.size === e.size && m.material === e.material))]});
          }}
        >
          Try 6" 90 = 3'-0", 45 = 2'-6"
        </button>
        <button
          className="btn small"
          disabled={!p.library.length}
          onClick={() => setPrefs({library: []})}
        >
          Back to catalog values
        </button>
      </div>
      <div className="grid2" key={k}>
        <label>
          Fitting
          <select value={type} onChange={e => setType(e.target.value as FittingType)}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Size
          <input value={size} onChange={e => setSize(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Material
          <select value={mat} onChange={e => setMat(e.target.value as Material)}>
            <option value="hdpe">HDPE</option>
            <option value="steel">Steel</option>
          </select>
        </label>
        <label>
          Take-out (run)
          <LenInput value={to} onChange={setTo} placeholder={`e.g. 8 5/8"`} allowEmpty />
        </label>
        {(type === 'tee' || type === 'lateral') && (
          <label>
            Branch take-out
            <LenInput value={br} onChange={setBr} allowEmpty />
          </label>
        )}
        {!/^elbow|tee|lateral/.test(type) && (
          <label>
            Body length (end to end)
            <LenInput value={lay} onChange={setLay} allowEmpty />
          </label>
        )}
      </div>
      <button className="btn" onClick={add}>
        Save fitting
      </button>
    </div>
  );
}
