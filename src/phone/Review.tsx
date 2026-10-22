// Review what Claude read, fix anything, and see the results update live before sending.
import {useMemo, useState, type ReactNode} from 'react';
import {BRANDS, type Settings, type TakeoutEntry} from '../core/library.ts';
import {makerLine} from '../core/makers.ts';
import {solve} from '../core/solve.ts';
import {FITTING_NAME, JOINING_NAME, type BomItem, type FittingType, type Joining, type Leg, type Point, type Sheet, type Weld} from '../core/types.ts';
import {formatLength, parseLength} from '../core/units.ts';
import Preview from './Preview.tsx';

type Col<T> = {key: keyof T & string; label: string; kind?: 'text' | 'num' | 'len' | 'select'; options?: [string, string][]; w?: number};

function Table<T extends object>({rows, cols, onChange, make}: {rows: T[]; cols: Col<T>[]; onChange: (rows: T[]) => void; make: () => T}) {
  const set = (i: number, k: string, val: unknown) => onChange(rows.map((r, j) => (j === i ? {...r, [k]: val} : r)));
  return (
    <div className="table-wrap">
      <table className="edit">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{minWidth: c.w ?? 70}}>
                {c.label}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => {
                const raw = (r as Record<string, unknown>)[c.key];
                if (c.kind === 'select')
                  return (
                    <td key={c.key}>
                      <select value={String(raw ?? '')} onChange={e => set(i, c.key, e.target.value || null)}>
                        {c.options!.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                const text = raw === null || raw === undefined ? '' : String(raw);
                const bad = c.kind === 'len' && text !== '' && parseLength(text) === null;
                return (
                  <td key={c.key}>
                    <input
                      className={bad ? 'bad' : ''}
                      value={text}
                      inputMode={c.kind === 'num' ? 'decimal' : undefined}
                      onChange={e => {
                        const t = e.target.value;
                        set(i, c.key, c.kind === 'num' ? (t.trim() === '' ? null : Number.isFinite(parseFloat(t)) ? parseFloat(t) : raw) : t === '' ? null : t);
                      }}
                    />
                  </td>
                );
              })}
              <td>
                <button className="x" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add" onClick={() => onChange([...rows, make()])}>
        + Add row
      </button>
    </div>
  );
}

function Fold({title, children, open}: {title: ReactNode; children: ReactNode; open?: boolean}) {
  return (
    <details className="fold" open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

const TYPES = Object.entries(FITTING_NAME) as [FittingType, string][];
const JOINS = Object.entries(JOINING_NAME) as [Joining, string][];

export default function Review({sheet, setSheet, settings, library}: {sheet: Sheet; setSheet: (s: Sheet) => void; settings: Settings; library: TakeoutEntry[]}) {
  const sol = useMemo(() => solve(sheet, settings, library), [sheet, settings, library]);
  const maker = useMemo(() => makerLine(sheet, settings, formatLength), [sheet, settings]);
  const [sel, setSel] = useState<string | null>(null);
  const up = (p: Partial<Sheet>) => setSheet({...sheet, ...p});
  const pointIds: [string, string][] = sheet.points.map(p => [p.id, p.id]);
  const legIds: [string, string][] = [['', '—'], ...sheet.legs.map(l => [l.id, l.id] as [string, string])];

  return (
    <div className="review">
      <div className="card">
        <div className="sheet-head">
          <input className="title-input" value={sheet.drawing.number} onChange={e => up({drawing: {...sheet.drawing, number: e.target.value}})} aria-label="Drawing number" />
          {sheet.confidence && <span className={`conf ${sheet.confidence}`}>{sheet.confidence} confidence</span>}
        </div>
        <div className="grid2">
          <label>
            Size
            <input value={sheet.size} onChange={e => up({size: e.target.value})} />
          </label>
          <label>
            Joining
            <select value={sheet.joining} onChange={e => up({joining: e.target.value as Joining})}>
              {JOINS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="span2">
            Material
            <input value={sheet.material} onChange={e => up({material: e.target.value})} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>3D</h3>
        <Preview sheet={sheet} sol={sol} selected={sel} onSelect={setSel} />
      </div>

      <div className="card">
        <h3>Cut list</h3>
        <table className="results">
          <thead>
            <tr>
              <th>Pipe</th>
              <th>Cut</th>
              <th>How</th>
            </tr>
          </thead>
          <tbody>
            {sol.pieces.map(p => (
              <tr key={p.id} className={p.status} onClick={() => setSel(p.status === 'nopipe' ? null : p.id)}>
                <td>
                  <b>{p.status === 'nopipe' ? '—' : p.id}</b>
                  <small>{p.status === 'nopipe' && p.direct ? p.direct.replace(/^No pipe: /, '') : `${p.endsText[0]} → ${p.endsText[1]}`}</small>
                </td>
                <td className="cut">{p.status === 'ok' ? formatLength(p.cut) : p.status === 'nopipe' ? 'no pipe' : p.status === 'missing' ? 'needs fitting size' : 'too short!'}</td>
                <td className="how">
                  {p.cc === null ? 'no length' : formatLength(p.cc)}
                  {p.deductions.length > 0 && <span> − take-out {formatLength(p.takeout)}</span>}
                  {p.deductions.length > 1 && <small>take-out = {p.deductions.map(d => formatLength(d.inches)).join(' + ')}</small>}
                  {p.adjust.map((a, i) => (
                    <span key={`a${i}`}>
                      {' '}
                      {(a.inches ?? 0) >= 0 ? '+' : '−'} {formatLength(Math.abs(a.inches ?? 0))}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Total {formatLength(sol.totalCut)}
          {sol.plan.length ? ` · ${sol.plan.length} stick${sol.plan.length > 1 ? 's' : ''} of ${formatLength(settings.stickLength)}` : ''}
          {` · ${BRANDS[settings.brand ?? 'gf']} fittings`}
        </p>
        {maker && <p className="maker-line">{maker}</p>}
      </div>

      <div className="card">
        <h3>Checks</h3>
        <ul className="checks">
          {sol.checks.map((c, i) => (
            <li key={i} className={c.level}>
              <b>{c.text}</b>
              {c.hint && <small>{c.hint}</small>}
            </li>
          ))}
          {!sol.checks.length && <li className="ok">Nothing to flag.</li>}
        </ul>
      </div>

      <div className="card">
        <h3>What was read</h3>
        <p className="muted">Fix anything Claude misread. Lengths as printed (22'-11 1/4"), coordinates in feet.</p>
        {sheet.unreadable?.length ? (
          <ul className="checks">
            {sheet.unreadable.map((u, i) => (
              <li key={i} className="warn">
                <b>Couldn't read: {u}</b>
              </li>
            ))}
          </ul>
        ) : null}
        <Fold title={`Points (${sheet.points.length})`}>
          <Table<Point>
            rows={sheet.points}
            onChange={points => up({points})}
            make={() => ({id: `P${sheet.points.length + 1}`, kind: 'center'})}
            cols={[
              {key: 'id', label: 'Id', w: 50},
              {key: 'kind', label: 'Kind', kind: 'select', options: [['center', 'Fitting'], ['end', 'End']]},
              {key: 'e', label: 'East', kind: 'num', w: 84},
              {key: 'n', label: 'North', kind: 'num', w: 84},
              {key: 'el', label: 'EL', kind: 'num', w: 80},
              {key: 'label', label: 'Label', w: 120},
              {key: 'cont', label: 'Cont. on', w: 110},
            ]}
          />
        </Fold>
        <Fold title={`Runs (${sheet.legs.length})`}>
          <Table<Leg>
            rows={sheet.legs}
            onChange={legs => up({legs})}
            make={() => ({id: `L${sheet.legs.length + 1}`, from: sheet.points[0]?.id ?? '', to: sheet.points[1]?.id ?? ''})}
            cols={[
              {key: 'id', label: 'Id', w: 50},
              {key: 'from', label: 'From', kind: 'select', options: pointIds},
              {key: 'to', label: 'To', kind: 'select', options: pointIds},
              {key: 'direction', label: 'Direction', w: 90},
              {key: 'cc', label: 'C-C', kind: 'len', w: 100},
              {key: 'pipe', label: 'Pipe (printed)', kind: 'len', w: 110},
              {key: 'slope', label: 'Slope', w: 60},
            ]}
          />
        </Fold>
        <Fold title={`Fittings (${sheet.fittings.length})`}>
          <Table
            rows={sheet.fittings.map(f => ({...f, takeoutsText: f.takeouts ? Object.entries(f.takeouts).map(([k, val]) => `${k}=${val}`).join('; ') : ''}))}
            onChange={rows =>
              up({
                fittings: rows.map(({takeoutsText, ...f}) => {
                  const map: Record<string, string> = {};
                  for (const part of String(takeoutsText ?? '').split(/[;,]/)) {
                    const m = /^\s*([^=]+?)\s*=\s*(.+?)\s*$/.exec(part);
                    if (m) map[m[1]] = m[2];
                  }
                  return {...f, takeouts: Object.keys(map).length ? map : null};
                }),
              })
            }
            make={() => ({id: `F${sheet.fittings.length + 1}`, type: 'elbow90' as FittingType, point: sheet.points[0]?.id ?? null, takeoutsText: ''})}
            cols={[
              {key: 'id', label: 'Id', w: 50},
              {key: 'type', label: 'Type', kind: 'select', options: TYPES},
              {key: 'point', label: 'At point', kind: 'select', options: [['', '—'], ...pointIds]},
              {key: 'inlineLeg', label: 'In-line on', kind: 'select', options: legIds},
              {key: 'size', label: 'Size', w: 60},
              {key: 'takeout', label: 'Centre to end', kind: 'len', w: 100},
              {key: 'branchLeg', label: 'Branch run', kind: 'select', options: legIds},
              {key: 'branchTakeout', label: 'Branch C-to-E', kind: 'len', w: 100},
              {key: 'takeoutsText', label: 'Per run (L1=…)', w: 160},
              {key: 'laying', label: 'Body length', kind: 'len', w: 90},
              {key: 'bomItem', label: 'BOM #', kind: 'num', w: 56},
            ]}
          />
        </Fold>
        <Fold title={`Joints (${sheet.welds.length})`}>
          <Table<Weld>
            rows={sheet.welds}
            onChange={welds => up({welds})}
            make={() => ({number: String(sheet.welds.length + 1), point: sheet.points[0]?.id ?? ''})}
            cols={[
              {key: 'number', label: 'Number', w: 70},
              {key: 'point', label: 'At point', kind: 'select', options: pointIds},
              {key: 'leg', label: 'Run', kind: 'select', options: legIds},
              {key: 'type', label: 'Type', w: 60},
            ]}
          />
        </Fold>
        <Fold title={`Bill of materials (${sheet.bom.length})`}>
          <Table<BomItem>
            rows={sheet.bom}
            onChange={bom => up({bom})}
            make={() => ({item: sheet.bom.length + 1, description: '', qty: ''})}
            cols={[
              {key: 'item', label: '#', kind: 'num', w: 40},
              {key: 'description', label: 'Description', w: 220},
              {key: 'qty', label: 'Qty', w: 90},
            ]}
          />
        </Fold>
      </div>
    </div>
  );
}
