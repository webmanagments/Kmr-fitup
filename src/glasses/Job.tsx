// One sheet on the glasses: the 3D model, the cut list, the weld map, checks and the drawing.
import {useEffect, useMemo, useState} from 'react';
import type {Job as JobT} from '../core/job.ts';
import {lookup} from '../core/library.ts';
import type {Missing, Piece, SFitting, Solution} from '../core/solve.ts';
import {FITTING_NAME, JOINING_NAME} from '../core/types.ts';
import {formatLength} from '../core/units.ts';
import type {Part} from '../render/scene.ts';
import {useCapture} from './keys.ts';
import {Modal, Stepper} from './Modal.tsx';
import ModelView, {useParts} from './ModelView.tsx';
import Paged from './Paged.tsx';
import {getState, libraryFor, progressOf, removeJob, setOverride, setTakeout, solveJob, toggle, useStore} from './store.ts';
import {dirOf, focusEl} from '../lib/spatial.ts';

export type Tab = 'model' | 'cuts' | 'welds' | 'checks' | 'sheet';
const TABS: {id: Tab; name: string}[] = [
  {id: 'model', name: '3D'},
  {id: 'cuts', name: 'Cuts'},
  {id: 'welds', name: 'Welds'},
  {id: 'checks', name: 'Checks'},
  {id: 'sheet', name: 'Sheet'},
];

interface StepReq {
  title: string;
  start: number;
  note?: string;
  save: (v: number) => void;
}

const SRC: Record<string, string> = {printed: 'on drawing', library: 'your library', standard: 'catalog', coordinates: 'from coords', elevations: 'from elevations', derived: 'from geometry', none: 'unknown'};

export default function Job({job, tab, setTab, onLeave}: {job: JobT; tab: Tab; setTab: (t: Tab) => void; onLeave: () => void}) {
  useStore(); // re-render on any change (progress, take-outs)
  const sol = solveJob(job);
  const prog = progressOf(job.id);
  const done = useMemo(() => new Set(prog.cut), [prog.cut]);
  const fused = useMemo(() => new Set(prog.fused), [prog.fused]);
  const [step, setStep] = useState<StepReq | null>(null);
  const [detail, setDetail] = useState<Part | null | undefined>(undefined);
  const [sel, setSel] = useState(-1);
  const [view, setView] = useState(0);
  const model = useParts(job.sheet, sol);

  // Swiping up out of the content always lands on the tab that's open (not whichever tab is
  // nearest), so moving between content and tabs never switches tabs by accident.
  useCapture(e => {
    if (dirOf(e) !== 'up') return false;
    const a = document.activeElement as HTMLElement | null;
    const body = a?.closest('.tab-body');
    if (!a || !body || a.closest('[data-focus-scope="modal"]')) return false;
    const paged = a.closest<HTMLElement>('.paged');
    if (paged && paged.dataset.page !== '0') return false;
    const top = a.getBoundingClientRect().top;
    const above = [...body.querySelectorAll<HTMLElement>('button:not([disabled])')].some(el => el !== a && el.getBoundingClientRect().bottom <= top + 6);
    if (above) return false;
    return focusEl(document.querySelector<HTMLElement>(`[data-nav="tab-${tab}"]`));
  });

  const fix = (m: Missing) => {
    const size = m.size ?? sol.size ?? 6;
    const existing = lookup(libraryFor(job), m.type, size, sol.material, m.size2)?.entry ?? null;
    const what = m.field === 'branch' ? 'branch, centre to end' : m.field === 'outlet' ? 'outlet, centre to end' : m.field === 'laying' ? 'end-to-end length' : 'centre to end';
    setStep({
      title: `${m.label.replace(/ \((branch|outlet)\)$/, '')} ${what}`,
      start: m.suggest ?? (m.field === 'laying' ? size : m.type === 'elbow90' ? size * 1.5 : size),
      note: m.suggest ? `Starts at ${formatLength(m.suggest)}: the value that matches the BOM. Check it against your fitting sheet.` : 'From the centre of the fitting (where the centrelines cross) to the face the pipe fuses to. Both fittings on a pipe add up to its take-out.',
      save: v => setTakeout(m.type, size, sol.material, m.field, v, existing, m.size2),
    });
  };
  const fixAllowance = () =>
    setStep({
      title: 'Fusion allowance per end',
      start: getState().overrides.fusionAllowance ?? job.settings.fusionAllowance ?? 0.25,
      note: 'What each pipe end loses to facing and the bead. Added to every cut. From your fusion procedure.',
      save: v => setOverride({fusionAllowance: v}),
    });

  return (
    <div className="screen job">
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'on' : ''}`} data-nav={`tab-${t.id}`} onFocus={() => setTab(t.id)} onClick={() => setTab(t.id)}>
            {t.name}
            {t.id === 'checks' && sol.checks.some(c => c.level === 'error') && <i className="dot red" />}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'model' && (
          <>
            <ModelView
              sheet={job.sheet}
              sol={sol}
              width={600}
              height={352}
              done={done}
              fused={fused}
              selected={sel}
              onSelect={setSel}
              view={view}
              onView={setView}
              onOpen={p => setDetail(p)}
            />
            <PartInfo job={job} sol={sol} part={sel >= 0 ? model.parts[sel] : null} done={done} fused={fused} />
          </>
        )}
        {tab === 'cuts' && <Cuts job={job} sol={sol} done={done} fix={fix} />}
        {tab === 'welds' && <Welds job={job} sol={sol} fused={fused} />}
        {tab === 'checks' && <Checks sol={sol} fix={fix} fixAllowance={fixAllowance} joining={job.sheet.joining} />}
        {tab === 'sheet' && <SheetTab job={job} sol={sol} onDelete={onLeave} />}
      </div>
      {detail !== undefined && <PartDetail job={job} sol={sol} part={detail} done={done} fused={fused} fix={fix} close={() => setDetail(undefined)} />}
      {step && <Stepper title={step.title} start={step.start} note={step.note} onSave={step.save} onClose={() => setStep(null)} />}
    </div>
  );
}

const pieceOf = (sol: Solution, id: string) => sol.pieces.find(p => p.id === id);
const fittingOf = (sol: Solution, id: string) => sol.fittings.find(f => f.id === id);

function math(p: Piece): string {
  if (p.cc === null) return 'Centre-to-centre not known';
  const parts = [formatLength(p.cc), ...(p.deductions.length ? [`− take-out ${formatLength(p.takeout)}`] : []), ...p.adjust.map(a => `${(a.inches ?? 0) >= 0 ? '+' : '−'} ${formatLength(Math.abs(a.inches ?? 0))}`)];
  return parts.join(' ');
}

function PartInfo({job, sol, part, done, fused}: {job: JobT; sol: Solution; part: Part | null; done: Set<string>; fused: Set<string>}) {
  if (!part) {
    const pipes = sol.pieces.filter(p => p.status === 'ok');
    const left = pipes.filter(p => !done.has(p.id)).length;
    return (
      <div className="info">
        <div className="info-top">
          <b className="info-name">{job.name}</b>
          <span className="muted">{JOINING_NAME[job.sheet.joining]}</span>
        </div>
        {sol.missing.length ? (
          <p className="big red">Needs {sol.missing.length === 1 ? 'a fitting size' : `${sol.missing.length} fitting sizes`}</p>
        ) : (
          <p className="big">
            {pipes.length} pipe{pipes.length === 1 ? '' : 's'} · {formatLength(sol.totalCut)}
          </p>
        )}
        <p className="muted">
          {[
            sol.missing.length ? null : left ? `${left} left to cut` : pipes.length ? 'All cut ✓' : 'No pipe to cut',
            `${sol.welds.filter(w => fused.has(w.number)).length}/${sol.welds.length} joints done`,
            sol.plan.length ? `${sol.plan.length} stick${sol.plan.length > 1 ? 's' : ''}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    );
  }
  if (part.kind === 'pipe') {
    const p = pieceOf(sol, part.id)!;
    const cut = done.has(p.id);
    return (
      <div className="info">
        <div className="info-top">
          <b className="chip">{p.id}</b>
          <span className="muted">
            {p.endsText[0]} → {p.endsText[1]}
          </span>
        </div>
        <p className={`big ${p.status === 'ok' ? (cut ? 'green' : 'amber') : 'red'}`}>
          {p.status === 'ok' ? `CUT ${formatLength(p.cut)}` : p.status === 'missing' ? 'Needs a fitting size' : 'Check this run'}
          {cut && ' ✓'}
        </p>
        <p className="muted mono">{math(p)}</p>
        <p className="muted">{p.welds.length ? `Joints ${p.welds.map(w => (fused.has(w) ? `${w}✓` : w)).join(' · ')}` : 'No joints numbered on this sheet'}</p>
      </div>
    );
  }
  const f = fittingOf(sol, part.id)!;
  return (
    <div className="info">
      <div className="info-top">
        <b className="chip amber">{f.fitting.bomItem ? `#${f.fitting.bomItem}` : 'FIT'}</b>
        <b className="info-name">{f.name.replace(/ \(item \d+\)$/, '')}</b>
      </div>
      <p className="big amber">{f.ports.length ? f.ports.map(pt => formatLength(pt.takeout)).join(' / ') : bodyOf(sol, f) !== null ? `${formatLength(bodyOf(sol, f))} long` : FITTING_NAME[f.fitting.type]}</p>
      <p className="muted">{f.ports.length ? f.ports.map(pt => `${pt.branch ? 'branch' : 'run'} ${SRC[pt.source]}`).join(' · ') : (f.fitting.note ?? '')}</p>
      <p className="muted">{f.welds.length ? `Joints ${f.welds.map(w => (fused.has(w) ? `${w}✓` : w)).join(' · ')}` : ''}</p>
    </div>
  );
}

function PartDetail({job, sol, part, done, fused, fix, close}: {job: JobT; sol: Solution; part: Part | null; done: Set<string>; fused: Set<string>; fix: (m: Missing) => void; close: () => void}) {
  if (!part) {
    return (
      <Modal title={`${job.name} · cut list`} onClose={close} wide>
        <ul className="lines">
          {sol.pieces
            .filter(p => p.status !== 'nopipe')
            .map(p => (
              <li key={p.id}>
                <b>{p.id}</b> {p.status === 'ok' ? formatLength(p.cut) : 'needs fitting size'} {done.has(p.id) && '✓'}
              </li>
            ))}
        </ul>
        <button className="btn" data-autofocus onClick={close}>
          Close
        </button>
      </Modal>
    );
  }
  if (part.kind === 'pipe') {
    const p = pieceOf(sol, part.id)!;
    const missing = sol.missing.find(m => p.deductions.some(d => d.inches === null && d.label.includes(FITTING_NAME[m.type])));
    return (
      <Modal title={`${p.id} · ${p.status === 'ok' ? `cut ${formatLength(p.cut)}` : 'not ready'}`} onClose={close} wide>
        <ul className="lines">
          <li>
            Centre to centre <b>{formatLength(p.cc)}</b> <small>{SRC[p.ccSource]}</small>
          </li>
          {p.deductions.length > 0 && (
            <li>
              − Take-out <b className={p.takeout === null ? 'red' : ''}>{formatLength(p.takeout)}</b>
            </li>
          )}
          {p.deductions.map((d, i) => (
            <li key={i} className="sub">
              {d.label} <b className={d.inches === null ? 'red' : ''}>{formatLength(d.inches)}</b> <small>{SRC[d.source]}</small>
            </li>
          ))}
          {p.adjust.map((a, i) => (
            <li key={`a${i}`}>
              {(a.inches ?? 0) >= 0 ? '+' : '−'} {a.label} <b>{formatLength(Math.abs(a.inches ?? 0))}</b>
            </li>
          ))}
          {p.printedPipe !== null && (
            <li>
              Sheet says pipe <b>{formatLength(p.printedPipe)}</b> {p.printedMatch ? '✓ matches' : p.printedMatch === false ? '✗ differs' : ''}
            </li>
          )}
          {p.welds.length > 0 && <li>Joints {p.welds.map(w => (fused.has(w) ? `${w} ✓` : w)).join(' · ')}</li>}
        </ul>
        <div className="row">
          {p.status === 'ok' && (
            <button className={`btn ${done.has(p.id) ? '' : 'primary'}`} data-autofocus onClick={() => toggle(job.id, 'cut', p.id)}>
              {done.has(p.id) ? 'Cut ✓ (undo)' : 'Mark cut'}
            </button>
          )}
          {missing && (
            <button className="btn primary" data-autofocus onClick={() => fix(missing)}>
              Set fitting size
            </button>
          )}
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
      </Modal>
    );
  }
  const f = fittingOf(sol, part.id)!;
  const ms = sol.missing.filter(m => m.type === f.fitting.type);
  return (
    <Modal title={f.name} onClose={close} wide>
      <FittingLines f={f} sol={sol} />
      <div className="row">
        {ms.map(m => (
          <button key={m.field} className="btn primary" data-autofocus onClick={() => fix(m)}>
            Set {m.field === 'branch' ? 'branch size' : m.field === 'outlet' ? 'outlet size' : m.field === 'laying' ? 'length' : 'size'}
          </button>
        ))}
        {!ms.length && f.ports.length > 0 && f.ports.every(p => p.source !== 'printed') && (
          <button className="btn" onClick={() => fix({label: f.name.replace(/ \(item \d+\)$/, ''), type: f.fitting.type, size: sol.size, field: 'takeout', ports: f.ports.length, suggest: f.ports[0].takeout ?? undefined})}>
            Change size
          </button>
        )}
        <button className="btn" data-autofocus={ms.length ? undefined : true} onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** An in-line fitting's length (cleanout, reducer, coupling) as used in the cut. */
function bodyOf(sol: Solution, f: SFitting): number | null {
  for (const p of sol.pieces) for (const d of p.deductions) if (d.label === `${f.name} body` && d.inches !== null) return d.inches;
  return null;
}

function FittingLines({f, sol}: {f: SFitting; sol: Solution}) {
  const body = f.ports.length ? null : bodyOf(sol, f);
  return (
    <ul className="lines">
      {body !== null && (
        <li>
          Length <b>{formatLength(body)}</b>
        </li>
      )}
      {f.ports.map((pt, i) => (
        <li key={i}>
          {pt.branch ? 'Branch' : pt.role === 'outlet' ? 'Outlet' : f.fitting.type === 'lateral' ? 'Heel' : 'Run'} centre to end <b className={pt.takeout === null ? 'red' : ''}>{formatLength(pt.takeout)}</b> <small>{SRC[pt.source]}</small>
        </li>
      ))}
      {f.pos && (
        <li>
          EL {(f.pos.z / 12).toFixed(2)}′ · E {(f.pos.x / 12).toFixed(2)} · N {(f.pos.y / 12).toFixed(2)}
        </li>
      )}
      {f.welds.length > 0 && <li>Joints {f.welds.join(' · ')}</li>}
      {f.fitting.note && <li>{f.fitting.note}</li>}
    </ul>
  );
}

function Cuts({job, sol, done, fix}: {job: JobT; sol: Solution; done: Set<string>; fix: (m: Missing) => void}) {
  const rows = sol.pieces.filter(p => p.status !== 'nopipe');
  const okRows = rows.filter(p => p.status === 'ok');
  return (
    <div className="list-tab">
      <Paged
        items={rows}
        perPage={4}
        keyOf={p => p.id}
        row={p => (
          <button
            className={`row-btn ${done.has(p.id) ? 'done' : ''}`}
            data-row
            onClick={() => {
              if (p.status === 'ok') toggle(job.id, 'cut', p.id);
              else if (sol.missing[0]) fix(sol.missing[0]);
            }}
          >
            <b className="chip">{p.id}</b>
            <span className="row-main">
              <b className={`row-big ${p.status === 'ok' ? '' : 'red'}`}>{p.status === 'ok' ? formatLength(p.cut) : p.status === 'missing' ? 'needs fitting size' : 'check run'}</b>
              <small>
                {p.takeout !== null && p.deductions.length ? `take-out ${formatLength(p.takeout)} · ` : ''}
                {p.endsText[0]} → {p.endsText[1]}
              </small>
            </span>
            <span className={`tick ${done.has(p.id) ? 'on' : ''}`} aria-label={done.has(p.id) ? 'cut' : 'not cut'}>
              {done.has(p.id) ? '✓' : ''}
            </span>
          </button>
        )}
        empty={<p className="empty">No pipe to cut on this sheet: the fittings join each other directly.</p>}
      />
      <div className="foot">
        <span>
          {okRows.filter(p => done.has(p.id)).length}/{okRows.length} cut · {formatLength(sol.totalCut)}
        </span>
        {sol.plan.length > 0 && <span className="muted">{sol.plan.map(s => `Stick ${s.stick}: ${s.pieces.map(x => x.id).join('+')} (offcut ${formatLength(s.offcut)})`).join(' · ')}</span>}
      </div>
    </div>
  );
}

function Welds({job, sol, fused}: {job: JobT; sol: Solution; fused: Set<string>}) {
  const word = job.sheet.joining === 'butt_fusion' ? 'fused' : 'welded';
  return (
    <div className="list-tab">
      <Paged
        items={sol.welds}
        perPage={4}
        keyOf={w => w.number}
        row={w => (
          <button className={`row-btn ${fused.has(w.number) ? 'done' : ''}`} data-row onClick={() => toggle(job.id, 'fused', w.number)}>
            <b className="chip wide">{w.number}</b>
            <span className="row-main">
              <b className="row-mid">{w.joins}</b>
            </span>
            <span className={`tick ${fused.has(w.number) ? 'on' : ''}`} aria-label={fused.has(w.number) ? word : `not ${word}`}>
              {fused.has(w.number) ? '✓' : ''}
            </span>
          </button>
        )}
        empty={<p className="empty">No joint numbers on this sheet.</p>}
      />
      <div className="foot">
        <span>
          {sol.welds.filter(w => fused.has(w.number)).length}/{sol.welds.length} {word}
        </span>
        <span className="muted">Pinch a joint to mark it {word}.</span>
      </div>
    </div>
  );
}

function Checks({sol, fix, fixAllowance, joining}: {sol: Solution; fix: (m: Missing) => void; fixAllowance: () => void; joining: string}) {
  type Row = {key: string; level: string; text: string; hint?: string; act?: () => void; actText?: string};
  const rows: Row[] = [
    ...sol.missing.map((m, i) => ({
      key: `m${i}`,
      level: 'error',
      text: m.field === 'laying' ? `Need the end-to-end length of the ${m.label}` : `Need the centre-to-end size of the ${m.label}`,
      hint: m.suggest ? `BOM says about ${formatLength(m.suggest)}` : 'Pinch to set it',
      act: () => fix(m),
      actText: 'Set',
    })),
    ...sol.checks
      .filter(c => !/^Need the /.test(c.text))
      .map((c, i) => ({key: `c${i}`, level: c.level, text: c.text, hint: c.hint, act: /allowance/i.test(c.text) && joining === 'butt_fusion' ? fixAllowance : undefined, actText: 'Set'})),
  ];
  const order: Record<string, number> = {error: 0, warn: 1, info: 2, ok: 3};
  rows.sort((a, b) => order[a.level] - order[b.level]);
  if (joining === 'butt_fusion' && !rows.some(r => /allowance/i.test(r.text))) rows.push({key: 'allow', level: 'info', text: 'Fusion allowance', hint: 'Pinch to change it', act: fixAllowance, actText: 'Set'});
  return (
    <div className="list-tab">
      <Paged
        items={rows}
        perPage={4}
        keyOf={r => r.key}
        row={r => (
          <button className={`row-btn check lvl-${r.level}`} data-row onClick={() => r.act?.()}>
            <span className={`lvl l-${r.level}`} aria-hidden="true">
              {r.level === 'error' ? '!' : r.level === 'warn' ? '▲' : r.level === 'ok' ? '✓' : 'i'}
            </span>
            <span className="row-main">
              <b className="row-text">{r.text}</b>
              {r.hint && <small>{r.hint}</small>}
            </span>
            {r.act && <span className="act">{r.actText}</span>}
          </button>
        )}
      />
    </div>
  );
}

function SheetTab({job, sol, onDelete}: {job: JobT; sol: Solution; onDelete: () => void}) {
  const [viewer, setViewer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const d = job.sheet.drawing;
  const pics = job.thumbs?.length ? job.thumbs : job.thumb ? [job.thumb] : [];
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <div className="sheet-tab">
      <div className="sheet-info">
        <b className="info-name">{d.number}</b>
        <p className="muted">{[d.line, d.title, d.rev ? `Rev ${d.rev}` : null].filter(Boolean).join(' · ')}</p>
        <p>
          {job.sheet.material || job.sheet.size} · {JOINING_NAME[job.sheet.joining]}
        </p>
        <ul className="bom">
          {job.sheet.bom.slice(0, 5).map(b => (
            <li key={b.item}>
              <b>{b.item}</b> <span>{b.description.length > 46 ? `${b.description.slice(0, 44)}…` : b.description}</span> <b className="qty">{b.qty}</b>
            </li>
          ))}
        </ul>
        {sol.bomPipe !== null && <p className="muted">BOM pipe {formatLength(sol.bomPipe)} · math {formatLength(sol.totalNet)}</p>}
      </div>
      <div className="row bottom">
        {pics.length > 0 && (
          <button className="btn primary" data-autofocus onClick={() => setViewer(true)}>
            {pics.length > 1 ? `Drawing (${pics.length} photos)` : 'View drawing'}
          </button>
        )}
        <button
          className={`btn ${confirm ? 'danger' : ''}`}
          data-autofocus={pics.length ? undefined : true}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            removeJob(job.id);
            onDelete();
          }}
        >
          {confirm ? 'Pinch again to delete' : 'Delete sheet'}
        </button>
      </div>
      {viewer && pics.length > 0 && <Viewer srcs={pics} close={() => setViewer(false)} />}
    </div>
  );
}

function Viewer({srcs, close}: {srcs: string[]; close: () => void}) {
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x: 0, y: 0});
  const btn = useMemo(() => ({current: null as HTMLButtonElement | null}), []);
  useCapture(e => {
    if (document.activeElement !== btn.current) return false;
    const d = dirOf(e);
    if (!d) return false;
    if (zoom === 1) {
      // Not zoomed: left / right flip between the photos of this sheet.
      if (srcs.length < 2 || (d !== 'left' && d !== 'right')) return false;
      setAt(i => (i + (d === 'right' ? 1 : srcs.length - 1)) % srcs.length);
      return true;
    }
    const s = 90 / zoom;
    setPan(p => ({x: p.x + (d === 'left' ? s : d === 'right' ? -s : 0), y: p.y + (d === 'up' ? s : d === 'down' ? -s : 0)}));
    return true;
  });
  return (
    <Modal title={srcs.length > 1 ? `Drawing · photo ${at + 1} of ${srcs.length}` : 'Drawing'} onClose={close} wide>
      <button
        ref={el => {
          btn.current = el;
        }}
        className="viewer"
        data-autofocus
        onClick={() => {
          setZoom(z => (z === 1 ? 2.5 : z === 2.5 ? 4 : 1));
          if (zoom === 4) setPan({x: 0, y: 0});
        }}
      >
        <img src={srcs[at]} alt="The isometric drawing" style={{transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`}} />
      </button>
      <p className="modal-hint">
        {zoom === 1 ? `Pinch to zoom${srcs.length > 1 ? ' · swipe ◀ ▶ for the other photos' : ''}` : 'Swipe to move · pinch to zoom'} · Back to close
      </p>
    </Modal>
  );
}
