import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {receiveJobs} from '../core/pair.ts';
import {focusDefault, focusEl, focusIsLost, installSpatialNav} from '../lib/spatial.ts';
import Calc from './Calc.tsx';
import Home, {Pair, Settings, type Link} from './Home.tsx';
import Job, {type Tab} from './Job.tsx';
import {popBack} from './Modal.tsx';
import {addJobs, getState, useStore} from './store.ts';

type Screen = {s: 'home'} | {s: 'pair'} | {s: 'settings'} | {s: 'calc'} | {s: 'job'; id: string};

const appRoot: {current: HTMLDivElement | null} = {current: null};
const park = () => appRoot.current?.focus({preventScroll: true});
function settle(apply: () => void) {
  requestAnimationFrame(apply);
  for (const ms of [160, 450]) setTimeout(() => focusIsLost() && apply(), ms);
}
function push(screen: Screen, replace = false) {
  try {
    if (replace) history.replaceState(screen, '');
    else history.pushState(screen, '');
  } catch {
    /* locked-down web view */
  }
}

export default function App() {
  const st = useStore();
  const [screen, setScreen] = useState<Screen>({s: 'home'});
  const [tab, setTab] = useState<Tab>('model');
  const [link, setLink] = useState<Link>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const cur = useRef(screen);
  cur.current = screen;
  const lastNav = useRef<string | null>(null);

  useEffect(() => {
    const off = installSpatialNav(() => {
      if (popBack()) return;
      if (cur.current.s !== 'home') {
        park();
        history.back();
      } else if (focusIsLost()) focusDefault();
    });
    push({s: 'home'}, true);
    const onPop = (e: PopStateEvent) => {
      const next = (e.state as Screen | null) ?? {s: 'home'};
      // The glasses' own Back closes a popup first.
      if (popBack()) {
        push(cur.current);
        return;
      }
      park();
      setScreen(next.s === 'job' && !getState().jobs.some(j => j.id === next.id) ? {s: 'home'} : next);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      off();
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // Collect sheets sent from the phone.
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const tick = async () => {
      if (document.hidden) {
        timer = window.setTimeout(tick, 4000);
        return;
      }
      const r = await receiveJobs(getState().code);
      if (stop) return;
      if (r.ok) {
        setLink('ok');
        const added = addJobs(r.jobs);
        if (added.length) setToast(added.length === 1 ? `Received ${added[0].name}` : `Received ${added.length} sheets`);
      } else setLink(r.why);
      timer = window.setTimeout(tick, r.ok ? 4000 : 10000);
    };
    // Start after the app has settled, so opening it stays instant.
    timer = window.setTimeout(tick, 2500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [st.code]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const go = useCallback((next: Screen) => {
    if (cur.current.s === 'home') lastNav.current = (document.activeElement as HTMLElement | null)?.dataset.nav ?? null;
    park();
    if (next.s === 'home') {
      history.back();
      return;
    }
    if (next.s === 'job') setTab('model');
    push(next, cur.current.s !== 'home');
    setScreen(next);
  }, []);

  const prev = useRef(screen.s);
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = screen.s;
    if (screen.s === 'home' && before !== 'home' && lastNav.current) {
      const id = lastNav.current;
      settle(() => focusEl(document.querySelector<HTMLElement>(`[data-nav="${id}"]`)) || focusDefault());
    } else settle(() => focusDefault());
  }, [screen]);

  const job = screen.s === 'job' ? st.jobs.find(j => j.id === screen.id) : null;
  return (
    <div className="app" ref={appRoot} tabIndex={-1} data-focus-root>
      {screen.s === 'home' && <Home open={id => go({s: 'job', id})} go={s => go({s})} link={link} />}
      {screen.s === 'pair' && <Pair link={link} />}
      {screen.s === 'settings' && <Settings />}
      {screen.s === 'calc' && <Calc />}
      {screen.s === 'job' && job && <Job key={job.id} job={job} tab={tab} setTab={setTab} onLeave={() => go({s: 'home'})} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
