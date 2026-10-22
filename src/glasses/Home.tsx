// Home: the sheets on the glasses, the pairing code, samples and settings.
import {useState} from 'react';
import {makeJob, type Job} from '../core/job.ts';
import {formatCode} from '../core/pair.ts';
import {SAMPLES} from '../core/samples.ts';
import {formatLength} from '../core/units.ts';
import {Stepper} from './Modal.tsx';
import Paged from './Paged.tsx';
import {addJobs, clearLibrary, getState, newCode, progressOf, setOverride, solveJob, useStore} from './store.ts';
import {DEFAULT_SETTINGS} from '../core/library.ts';

export type Link = 'ok' | 'rules' | 'offline' | 'idle';
/** The sheet last opened, so coming back lands on its page. */
const lastOpened: {id: string | null} = {id: null};

export function scanUrl(): string {
  const base = `${location.host}${location.pathname.replace(/[^/]*$/, '')}`;
  return `${base}scan.html`;
}

function JobCard({job, open}: {job: Job; open: () => void}) {
  const sol = solveJob(job);
  const p = progressOf(job.id);
  const pipes = sol.pieces.filter(x => x.status === 'ok');
  const cut = pipes.filter(x => p.cut.includes(x.id)).length;
  const fused = sol.welds.filter(w => p.fused.includes(w.number)).length;
  const total = pipes.length + sol.welds.length;
  const pct = total ? (cut + fused) / total : 0;
  return (
    <button className="job-card" data-row data-nav={`job-${job.id}`} onClick={open}>
      <span className="job-top">
        <b className="job-name">{job.name}</b>
        {sol.missing.length ? <span className="badge red">{sol.missing.length} fitting size{sol.missing.length > 1 ? 's' : ''} needed</span> : pct >= 1 ? <span className="badge green">Done ✓</span> : <span className="badge">Ready</span>}
      </span>
      <small className="job-sub">
        {job.demo ? 'Sample · ' : ''}
        {sol.missing.length
          ? `${sol.pieces.filter(x => x.status !== 'nopipe').length} runs · cuts wait on fitting sizes · ${fused}/${sol.welds.length} joints`
          : `${pipes.length} pipe${pipes.length === 1 ? '' : 's'} · ${formatLength(sol.totalCut)} · ${cut}/${pipes.length} cut · ${fused}/${sol.welds.length} joints`}
      </small>
      <span className="bar" aria-hidden="true">
        <i style={{width: `${Math.round(pct * 100)}%`}} />
      </span>
    </button>
  );
}

export default function Home({open, go, link}: {open: (id: string) => void; go: (s: 'pair' | 'settings') => void; link: Link}) {
  const s = useStore();
  const addSamples = () => {
    const have = new Set(getState().jobs.map(j => j.id));
    const demos = SAMPLES.map((sh, i) => ({...makeJob(sh), id: `demo${i}`, demo: true, created: Date.now() - i}));
    const add = demos.filter(d => !have.has(d.id));
    addJobs(add, true);
  };
  return (
    <div className="screen home">
      <header className="home-head">
        <span className="logo" aria-hidden="true">
          <Logo />
        </span>
        <h1>
          KMR <b>FitUp</b>
        </h1>
        <span className={`link ${link}`}>{link === 'ok' ? 'Phone link on' : link === 'rules' ? 'Link blocked' : link === 'offline' ? 'Offline' : 'Linking…'}</span>
      </header>
      <div className="home-list">
        <Paged
          items={s.jobs}
          perPage={3}
          keyOf={j => j.id}
          autofocus
          startKey={lastOpened.id}
          row={j => (
            <JobCard
              job={j}
              open={() => {
                lastOpened.id = j.id;
                open(j.id);
              }}
            />
          )}
          empty={
            <div className="empty-home">
              <p className="big">No sheets yet</p>
              <p>
                On your phone open <b className="url">{scanUrl()}</b>
              </p>
              <p>
                and pair with code <b className="code-inline">{formatCode(s.code)}</b>
              </p>
            </div>
          }
        />
      </div>
      <nav className="home-nav">
        <button className="btn" data-nav="pair" data-autofocus={s.jobs.length ? undefined : true} onClick={() => go('pair')}>
          Pair <b className="mono">{formatCode(s.code)}</b>
        </button>
        <button className="btn" data-nav="samples" onClick={addSamples}>
          Samples
        </button>
        <button className="btn" data-nav="settings" onClick={() => go('settings')}>
          Settings
        </button>
      </nav>
    </div>
  );
}

export function Pair({link}: {link: Link}) {
  const s = useStore();
  const [sure, setSure] = useState(false);
  return (
    <div className="screen pair">
      <h2>Pair your phone</h2>
      <ol className="steps">
        <li>
          On your phone, open <b className="url">{scanUrl()}</b>
        </li>
        <li>Enter this code:</li>
      </ol>
      <p className="code">{formatCode(s.code)}</p>
      <p className="muted">Then take a photo of a sheet on the phone. It lands here in a few seconds, encrypted with this code.</p>
      {link === 'rules' && <p className="red">The database is refusing FitUp. The FitUp rules need adding in Firebase.</p>}
      {link === 'offline' && <p className="amber">Can't reach the internet right now. Sheets already here still work.</p>}
      <button
        className={`btn ${sure ? 'danger' : ''}`}
        data-autofocus
        onClick={() => {
          if (!sure) return setSure(true);
          newCode();
          setSure(false);
        }}
      >
        {sure ? 'Pinch again: the phone will need the new code' : 'New code'}
      </button>
    </div>
  );
}

export function Settings() {
  const s = useStore();
  const [edit, setEdit] = useState<'allow' | 'stick' | null>(null);
  const [sure, setSure] = useState(false);
  const allow = s.overrides.fusionAllowance;
  const stick = s.overrides.stickLength;
  return (
    <div className="screen settings">
      <h2>Settings</h2>
      <p className="muted">These override what the phone sends, for every sheet on the glasses.</p>
      <div className="set-rows">
        <button className="row-btn" data-autofocus onClick={() => setEdit('allow')}>
          <span className="row-main">
            <b className="row-mid">Fusion allowance per end</b>
            <small>Added to each fused pipe end (facing + bead)</small>
          </span>
          <b className="val">{allow === undefined ? 'from phone' : formatLength(allow)}</b>
        </button>
        <button className="row-btn" onClick={() => setEdit('stick')}>
          <span className="row-main">
            <b className="row-mid">Stick length</b>
            <small>For planning cuts from full sticks</small>
          </span>
          <b className="val">{stick === undefined ? 'from phone' : formatLength(stick)}</b>
        </button>
        <button
          className={`row-btn ${sure ? 'danger' : ''}`}
          disabled={!s.library.length && !sure}
          onClick={() => {
            if (!sure) return setSure(true);
            clearLibrary();
            setSure(false);
          }}
        >
          <span className="row-main">
            <b className="row-mid">{sure ? 'Pinch again to clear' : 'Fitting sizes set on the glasses'}</b>
            <small>{s.library.map(e => `${e.size}" ${e.type.replace('elbow', '')}`).join(', ') || 'None yet'}</small>
          </span>
          <b className="val">{s.library.length}</b>
        </button>
      </div>
      {edit === 'allow' && (
        <Stepper
          title="Fusion allowance per end"
          start={allow ?? 0.25}
          max={2}
          note="Check your fusion procedure. Many crews use about 1/8 to 1/4 inch per end for 6 inch."
          onSave={v => setOverride({fusionAllowance: v})}
          onClose={() => setEdit(null)}
        />
      )}
      {edit === 'stick' && (
        <Stepper
          title="Stick length"
          start={stick ?? DEFAULT_SETTINGS.stickLength}
          min={12}
          max={60 * 12}
          note="Swipe left / right for a foot at a time."
          bigStep={12}
          onSave={v => setOverride({stickLength: v})}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34">
      <path d="M6 30 V16 a6 6 0 0 1 6 -6 H30" fill="none" stroke="#4fd1ff" strokeWidth="6" strokeLinecap="round" />
      <path d="M30 4 v12" stroke="#ffb23d" strokeWidth="4" strokeLinecap="round" />
      <circle cx="6" cy="33" r="3" fill="#3dff8a" />
    </svg>
  );
}
