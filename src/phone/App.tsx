// The phone page: pair with the glasses, photograph a sheet, let Claude read it, check it, send it.
import {useEffect, useRef, useState} from 'react';
import {makeJob, shortName} from '../core/job.ts';
import {CODE_LEN, formatCode, normalizeCode, sendJob} from '../core/pair.ts';
import {checkPrompt, readingProblems, readSheet, ReadError} from '../core/reader.ts';
import {SAMPLES} from '../core/samples.ts';
import type {Sheet} from '../core/types.ts';
import {forClaude, forGlasses, loadPhoto, type Photo} from './image.ts';
import {getPrefs, setPrefs, usePrefs} from './prefs.ts';
import LiveScan from './LiveScan.tsx';
import Review from './Review.tsx';
import {KeyCard, LibraryCard, ShopCard} from './Setup.tsx';

type Busy = null | 'reading' | 'checking' | 'sending';
const MAX_PHOTOS = 8;

export default function App() {
  const p = usePrefs();
  const [tab, setTab] = useState<'scan' | 'setup'>(() => (getPrefs().apiKey ? 'scan' : 'setup'));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{kind: 'ok' | 'err' | 'info'; text: string} | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState<null | {closeUp: boolean; target?: string}>(null);
  const abort = useRef<AbortController | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const paired = normalizeCode(p.code).length === CODE_LEN;
  const reading = busy === 'reading' || busy === 'checking';

  useEffect(() => {
    if (busy !== 'reading') return; // (the timer keeps running through the double-check)
    setSeconds(0);
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const loaded: Photo[] = [];
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setMsg({kind: 'err', text: `Up to ${MAX_PHOTOS} photos per sheet: kept the first ${Math.max(0, room)} of the ${files.length} you picked.`});
    for (const f of [...files].slice(0, Math.max(0, room))) {
      try {
        loaded.push(await loadPhoto(f));
      } catch {
        setMsg({kind: 'err', text: `Couldn't open ${f.name}.`});
      }
    }
    setPhotos(ps => [...ps, ...loaded].slice(0, MAX_PHOTOS));
  };

  const read = async (list: Photo[] = photos, extra = '') => {
    if (!p.apiKey) {
      setTab('setup');
      setMsg({kind: 'err', text: 'Add your Anthropic API key first.'});
      return;
    }
    setBusy('reading');
    setMsg(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const images = [];
      // Keep the whole request comfortably under the API's size limit however many photos.
      const each = Math.min(3_700_000, Math.floor(20_000_000 / Math.max(1, list.length)));
      for (const ph of list) images.push(await forClaude(ph, each));
      const hint = [p.note, extra].filter(Boolean).join('\n');
      const spend = (u: {input: number; output: number}) => {
        const sp = getPrefs().spent;
        setPrefs({spent: {input: sp.input + u.input, output: sp.output + u.output, reads: sp.reads + 1}});
      };
      const r = await readSheet(p.apiKey, images, p.model, hint, ctl.signal);
      spend(r.usage);
      let best = r.sheet;
      let problems = readingProblems(best, p.settings, p.library);
      let checked = '';
      // If the reading doesn't add up (BOM total, counts, lengths), Claude takes a second look
      // at the same photos with the problems spelled out, and the better reading wins.
      if (problems.length && getPrefs().autoCheck) {
        setBusy('checking');
        try {
          const r2 = await readSheet(p.apiKey, images, p.model, hint, ctl.signal, checkPrompt(best, problems));
          spend(r2.usage);
          const p2 = readingProblems(r2.sheet, p.settings, p.library);
          if (p2.length <= problems.length) {
            checked = p2.length < problems.length ? ` Double-checked: fixed ${problems.length - p2.length} of ${problems.length} problem${problems.length > 1 ? 's' : ''}.` : ' Double-checked.';
            best = r2.sheet;
            problems = p2;
          } else checked = ' Double-checked: the first reading was better, so it was kept.';
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          checked = " (The double-check didn't finish, so this is the first reading.)";
        }
      }
      setSheet(best);
      const missed = best.unreadable?.length ?? 0;
      setMsg({
        kind: problems.length ? 'err' : 'info',
        text:
          `Read ${shortName(best.drawing.number)}${photos.length > 1 || list.length > 1 ? ` from ${list.length} photos` : ''}.${checked}` +
          (problems.length ? ` Still ${problems.length} thing${problems.length > 1 ? 's' : ''} to check (see Checks below).` : ' Everything adds up.') +
          (missed ? ` ${missed} thing${missed > 1 ? 's were' : ' was'} hard to read: a close-up will fix it.` : ''),
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') setMsg({kind: 'info', text: 'Stopped.'});
      else setMsg({kind: 'err', text: e instanceof ReadError ? e.message : `Something went wrong: ${(e as Error).message}`});
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const gotLivePhoto = (photo: Photo) => {
    const closeUp = live?.closeUp ?? false;
    setLive(null);
    const list = (closeUp ? [...photos, photo] : [photo, ...photos]).slice(0, MAX_PHOTOS);
    setPhotos(list);
    if (!getPrefs().apiKey) {
      setMsg({kind: 'info', text: 'Got the photo. Add your Anthropic API key in Setup to read it.'});
      return;
    }
    const missed = sheet?.unreadable ?? [];
    void read(list, closeUp && missed.length ? `On the first read you couldn't make out: ${missed.join('; ')}. The last photo is a close-up taken to show exactly that. Read the whole sheet again using every photo.` : '');
  };

  const send = async () => {
    if (!sheet) return;
    if (!paired) {
      setMsg({kind: 'err', text: 'Enter the pairing code shown on your glasses first.'});
      return;
    }
    setBusy('sending');
    setMsg(null);
    try {
      // Every photo goes to the glasses' drawing viewer, sharing one size budget.
      const per = Math.min(240_000, Math.floor(300_000 / Math.max(1, photos.length)));
      const thumbs: string[] = [];
      for (const ph of photos) {
        const t = await forGlasses(ph, per).catch(() => null);
        if (t) thumbs.push(t);
      }
      const job = {...makeJob(sheet, p.settings, p.library, thumbs[0] ?? null), thumbs};
      const r = await sendJob(p.code, job);
      if (r.ok) {
        setMsg({kind: 'ok', text: `Sent ${job.name}. It shows up on your glasses in a few seconds.`});
        setPrefs({history: [{id: job.id, name: job.name, at: Date.now(), job: {...job, thumb: null, thumbs: []}}, ...getPrefs().history.filter(h => h.name !== job.name)].slice(0, 12)});
      } else
        setMsg({
          kind: 'err',
          text:
            r.why === 'rules'
              ? 'The database refused it: the FitUp rules need adding in Firebase.'
              : r.why === 'tooBig'
                ? 'That sheet is too big to send.'
                : r.why === 'bad'
                  ? 'That pairing code looks wrong.'
                  : "Couldn't reach the internet. Try again.",
        });
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    for (const ph of photos) URL.revokeObjectURL(ph.url);
    setPhotos([]);
    setSheet(null);
    setMsg(null);
    top.current?.scrollIntoView({behavior: 'smooth'});
  };

  return (
    <div className="phone" ref={top}>
      <header className="ph-head">
        <h1>
          KMR <b>FitUp</b>
        </h1>
        <nav className="seg">
          <button className={tab === 'scan' ? 'on' : ''} onClick={() => setTab('scan')}>
            Scan
          </button>
          <button className={tab === 'setup' ? 'on' : ''} onClick={() => setTab('setup')}>
            Setup
          </button>
        </nav>
      </header>

      {live && <LiveScan title={live.closeUp ? 'Close-up' : 'Whole sheet'} target={live.closeUp ? live.target : 'Fit the whole sheet in the frame'} closeUp={live.closeUp} onPhoto={gotLivePhoto} onClose={() => setLive(null)} />}

      {tab === 'setup' && (
        <>
          <PairCard />
          <KeyCard />
          <ShopCard />
          <LibraryCard />
          <button className="btn primary wide" onClick={() => setTab('scan')}>
            Done
          </button>
        </>
      )}

      {tab === 'scan' && (
        <>
          {!paired && <PairCard />}
          {paired && (
            <p className="paired">
              Glasses <b>{formatCode(normalizeCode(p.code))}</b>{' '}
              <button className="link-btn" onClick={() => setTab('setup')}>
                change
              </button>
            </p>
          )}

          {!sheet && (
            <div className="card">
              <h3>1. Photograph the sheet</h3>
              <p className="muted small">Flat, square-on and in good light. One photo of the whole sheet, or several of its parts (drawing, title block, bill of materials, close-ups of busy spots): up to 8 photos, all read together as one sheet.</p>
              {photos.length > 1 && <p className="photo-count">{photos.length} photos · read together as one sheet</p>}
              <div className="photos">
                {photos.map((ph, i) => (
                  <div className="ph" key={ph.id}>
                    <img src={ph.url} alt="" style={{transform: `rotate(${ph.rot}deg)`}} />
                    {photos.length > 1 && <span className="ph-num">{i + 1}</span>}
                    <div className="ph-tools">
                      <button aria-label="Rotate" onClick={() => setPhotos(ps => ps.map(x => (x.id === ph.id ? {...x, rot: (((x.rot + 90) % 360) as Photo['rot'])} : x)))}>
                        ⟳
                      </button>
                      <button aria-label="Remove" onClick={() => setPhotos(ps => ps.filter(x => x.id !== ph.id))}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn primary wide live-btn" onClick={() => setLive({closeUp: false})} disabled={photos.length >= MAX_PHOTOS || reading}>
                Live scan <small>takes the photo and reads it by itself</small>
              </button>
              <div className="row">
                <button className="btn" onClick={() => camera.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                  Take photo
                </button>
                <button className="btn" onClick={() => gallery.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                  Choose photos
                </button>
              </div>
              <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
              <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={e => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
              {photos.length > 0 && (
                <>
                  <label>
                    Anything Claude should know? (optional, remembered for every sheet)
                    <textarea rows={3} value={p.note} onChange={e => setPrefs({note: e.target.value})} placeholder="e.g. 6 inch HDPE, the 90s are long-sweep" />
                  </label>
                  {reading ? (
                    <div className="reading">
                      <span className="spin" aria-hidden="true" />
                      <span>
                        {busy === 'checking' ? 'Double-checking against the parts list…' : `Reading ${photos.length > 1 ? `${photos.length} photos as one sheet` : 'the sheet'}…`} {seconds}s
                        <small>{busy === 'checking' ? 'something didn’t add up, so Claude is taking a second look' : 'usually 20–60 seconds'}</small>
                      </span>
                      <button className="btn" onClick={() => abort.current?.abort()}>
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button className="btn primary wide" onClick={() => void read()}>
                      2. Read it with Claude
                    </button>
                  )}
                </>
              )}
              <details className="fold">
                <summary>Or try a sample sheet</summary>
                <div className="samples">
                  {SAMPLES.map(s => (
                    <button
                      key={s.drawing.number}
                      className="btn"
                      onClick={() => {
                        setSheet(structuredClone(s));
                        setMsg({kind: 'info', text: 'Sample loaded. Try editing a number and watch the cuts change.'});
                      }}
                    >
                      {shortName(s.drawing.number)}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}

          {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

          {sheet && reading && (
            <div className="card reading">
              <span className="spin" aria-hidden="true" />
              <span>
                {busy === 'checking' ? 'Double-checking against the parts list…' : 'Reading again with the close-up…'} {seconds}s<small>usually 20–60 seconds</small>
              </span>
              <button className="btn" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            </div>
          )}

          {sheet && !reading && !!sheet.unreadable?.length && photos.length > 0 && photos.length < MAX_PHOTOS && (
            <div className="card improve">
              <h3>Claude couldn't read {sheet.unreadable.length === 1 ? 'one thing' : `${sheet.unreadable.length} things`}</h3>
              <ul>
                {sheet.unreadable.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
              <button className="btn primary wide" onClick={() => setLive({closeUp: true, target: sheet.unreadable!.slice(0, 2).join(' · ')})}>
                Live close-up (auto)
              </button>
              <p className="muted small">Point at that part of the sheet. It snaps when it's sharp and reads the whole sheet again with both photos (this replaces any edits below).</p>
            </div>
          )}

          {sheet && (
            <>
              <Review sheet={sheet} setSheet={setSheet} settings={p.settings} library={p.library} />
              <div className="sendbar">
                <button className="btn" onClick={reset}>
                  New sheet
                </button>
                <button className="btn primary" disabled={busy === 'sending'} onClick={() => void send()}>
                  {busy === 'sending' ? 'Sending…' : '3. Send to glasses'}
                </button>
              </div>
            </>
          )}

          {!sheet && p.history.length > 0 && (
            <div className="card">
              <h3>Sent recently</h3>
              <ul className="history">
                {p.history.map(h => (
                  <li key={h.id}>
                    <span>
                      <b>{h.name}</b>
                      <small>{new Date(h.at).toLocaleString()}</small>
                    </span>
                    <button
                      className="btn small"
                      onClick={() => {
                        setSheet(structuredClone(h.job.sheet));
                        setMsg({kind: 'info', text: `Opened ${h.name}. Send it again or change it first.`});
                      }}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PairCard() {
  const p = usePrefs();
  const code = normalizeCode(p.code);
  return (
    <div className="card">
      <h3>Pair with your glasses</h3>
      <p className="muted small">Open KMR FitUp on your glasses: the 8-character code is on the home screen.</p>
      <input
        className={`code-input ${code.length === CODE_LEN ? 'good' : ''}`}
        value={formatCode(code)}
        placeholder="XXXX-XXXX"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        onChange={e => setPrefs({code: normalizeCode(e.target.value)})}
        aria-label="Pairing code"
      />
    </div>
  );
}
