// Phone settings: Claude key and model, shop numbers, and the fitting take-out library.
import {useState} from 'react';
import {BRANDS, DEFAULT_SETTINGS, MAX_ALLOWANCE, type Brand, type Material, type TakeoutEntry} from '../core/library.ts';
import {MODELS} from '../core/reader.ts';
import {FITTING_NAME, type FittingType} from '../core/types.ts';
import {formatLength, parseLength, parseSize} from '../core/units.ts';
import {getPrefs, setPrefs, usePrefs} from './prefs.ts';

export function LenInput({value, onChange, placeholder, allowEmpty, max}: {value: number | null; onChange: (v: number | null) => void; placeholder?: string; allowEmpty?: boolean; max?: number}) {
  const [text, setText] = useState(value === null ? '' : formatLength(value));
  const raw = parseLength(text);
  const parsed = raw !== null && max !== undefined && raw > max ? null : raw;
  const bad = text.trim() !== '' && parsed === null;
  return (
    <input
      className={bad ? 'bad' : ''}
      value={text}
      placeholder={placeholder}
      onChange={e => {
        setText(e.target.value);
        const v = parseLength(e.target.value);
        if (v !== null && (max === undefined || v <= max)) onChange(v);
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
      <label className="check-row">
        <input type="checkbox" checked={p.autoCheck} onChange={e => setPrefs({autoCheck: e.target.checked})} />
        <span>Double-check automatically: if the reading doesn't add up (parts list, counts, lengths), Claude takes a second look. Costs a second read only when needed.</span>
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
      <label>
        Who made the HDPE fittings? (it's stamped on them)
        <select value={s.brand} onChange={e => setPrefs({settings: {...getPrefs().settings, brand: e.target.value as Brand}, brandChosen: true})}>
          {(Object.keys(BRANDS) as Brand[]).map(b => (
            <option key={b} value={b}>
              {BRANDS[b]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid2">
        <label>
          Extra length on each cut
          <LenInput value={s.fusionAllowance} onChange={v => set('fusionAllowance', v)} placeholder="not set" allowEmpty max={MAX_ALLOWANCE} />
        </label>
        <label>
          Added
          <select value={s.allowancePer ?? 'pipe'} onChange={e => setPrefs({settings: {...getPrefs().settings, allowancePer: e.target.value as 'pipe' | 'end'}})}>
            <option value="pipe">once per pipe</option>
            <option value="end">on each fused end</option>
          </select>
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
      <p className="muted small">
        The extra length is added to every pipe cut{s.fusionAllowance ? `: a pipe that works out to 10'-0" fitting to fitting is cut at ${formatLength(120 + s.fusionAllowance * ((s.allowancePer ?? 'pipe') === 'end' ? 2 : 1))}` : ''}. Leave it empty to cut fitting to fitting. Type inches (3) or feet and inches (1'-2"); anything over {MAX_ALLOWANCE}" is refused as a typo.
      </p>
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
  const [out, setOut] = useState<number | null>(null);
  const [small, setSmall] = useState('4');
  const [k, setK] = useState(0);
  const add = () => {
    const sz = parseSize(size);
    const sz2 = type === 'reducer' ? parseSize(small) : null;
    if (sz === null || (to === null && br === null && lay === null && out === null)) return;
    const entry: TakeoutEntry = {id: `${type}-${sz}${sz2 ? `x${sz2}` : ''}-${mat}`, type, size: sz, size2: sz2, material: mat, takeout: to, branch: br, outlet: out, laying: lay};
    setPrefs({library: [entry, ...getPrefs().library.filter(e => !(e.type === type && e.size === sz && e.material === mat && (e.size2 ?? null) === (sz2 ?? null)))]});
    setTo(null);
    setBr(null);
    setLay(null);
    setOut(null);
    setK(x => x + 1);
  };
  return (
    <div className="card">
      <h3>Fitting sizes (centre to end)</h3>
      <p className="muted small">How far each fitting reaches from its centre (where the centrelines cross) to the face the pipe fuses to. The app adds up the fittings at both ends of a pipe to get that pipe's take-out, and subtracts it from the centre-to-centre length. Used when the drawing doesn't print one. Without an entry here, HDPE fittings use the maker picked above (Integrity Fusion 6": 90 = 8 13/16", 45 = 6 7/16"; GF Central Plastics 6": 90 = 8 5/8", 45 = 8 1/2"). The 6" lateral wye (heel 2'-2 11/16", outlet 7 3/4", branch 2'-3 3/8"), the 6" cleanout (7 3/8") and the 6" x 4" reducer (9 1/4") come from your B&V sheets. Steel uses ASME B16.9 long-radius.</p>
      {p.library.length ? (
        <table className="results lib">
          <tbody>
            {p.library.map(e => (
              <tr key={e.id}>
                <td>
                  <b>
                    {e.size}"{e.size2 ? ` x ${e.size2}"` : ''} {FITTING_NAME[e.type]}
                  </b>
                  <small>{e.material === 'hdpe' ? 'HDPE' : 'Steel'}</small>
                </td>
                <td>
                  {e.takeout !== null && <span>{formatLength(e.takeout)} </span>}
                  {e.branch != null && <span>branch {formatLength(e.branch)} </span>}
                  {e.outlet != null && <span>outlet {formatLength(e.outlet)} </span>}
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
              {id: 'elbow90-6-hdpe', type: 'elbow90', size: 6, material: 'hdpe', takeout: 9, branch: null, laying: null, note: "Coworker's number"},
              {id: 'elbow45-6-hdpe', type: 'elbow45', size: 6, material: 'hdpe', takeout: 6, branch: null, laying: null, note: "Coworker's number"},
            ];
            setPrefs({library: [...mine, ...getPrefs().library.filter(e => !mine.some(m => m.type === e.type && m.size === e.size && m.material === e.material))]});
          }}
        >
          Coworker's 6": 90 = 9", 45 = 6"
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
        {type === 'reducer' && (
          <label>
            Small end size
            <input value={small} onChange={e => setSmall(e.target.value)} inputMode="decimal" />
          </label>
        )}
        {/^elbow|tee|lateral/.test(type) && (
          <label>
            {type === 'lateral' ? 'Heel centre to end' : 'Centre to end'}
            <LenInput value={to} onChange={setTo} placeholder={`e.g. 8 5/8"`} allowEmpty />
          </label>
        )}
        {type === 'lateral' && (
          <label>
            Outlet centre to end
            <LenInput value={out} onChange={setOut} placeholder={`e.g. 7 3/4"`} allowEmpty />
          </label>
        )}
        {(type === 'tee' || type === 'lateral') && (
          <label>
            Branch centre to end
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
