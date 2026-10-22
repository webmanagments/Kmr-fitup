// Directional focus navigation for the Neural Band / touchpad D-pad.
//
// Mirrors Meta's UI Toolkit FocusNavigationProvider: one document-level keydown
// handler moves focus to the nearest visible control in the pressed direction and
// calls preventDefault so the host does not move twice. If focus has fallen back to
// the page itself, the first press lands on the screen's default control.
// Pinch normally arrives as a click on the focused <button>.

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Dir = 'up' | 'down' | 'left' | 'right';

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Topmost active scope: an open modal traps focus, otherwise the whole app. */
export function activeScope(): HTMLElement | null {
  const modals = document.querySelectorAll<HTMLElement>('[data-focus-scope="modal"]');
  if (modals.length) return modals[modals.length - 1];
  return document.getElementById('root');
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[inert],[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

export function focusables(scope: HTMLElement | null = activeScope()): HTMLElement[] {
  if (!scope) return [];
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function score(dir: Dir, from: DOMRect, to: DOMRect): number | null {
  const fcx = from.left + from.width / 2;
  const fcy = from.top + from.height / 2;
  const tcx = to.left + to.width / 2;
  const tcy = to.top + to.height / 2;
  let primary: number;
  let orthGap: number;
  let centerDiff: number;
  // Targets must lie in the half-plane beyond the current control's edge (6px slack
  // for the focus scale effect), so a press never wanders sideways or backwards.
  const SLACK = 6;
  switch (dir) {
    case 'down':
      if (!(tcy > fcy + 1 && to.top >= from.bottom - SLACK)) return null;
      primary = Math.max(0, to.top - from.bottom);
      orthGap = Math.max(0, to.left - from.right, from.left - to.right);
      centerDiff = Math.abs(tcx - fcx);
      break;
    case 'up':
      if (!(tcy < fcy - 1 && to.bottom <= from.top + SLACK)) return null;
      primary = Math.max(0, from.top - to.bottom);
      orthGap = Math.max(0, to.left - from.right, from.left - to.right);
      centerDiff = Math.abs(tcx - fcx);
      break;
    case 'right':
      if (!(tcx > fcx + 1 && to.left >= from.right - SLACK)) return null;
      primary = Math.max(0, to.left - from.right);
      orthGap = Math.max(0, to.top - from.bottom, from.top - to.bottom);
      centerDiff = Math.abs(tcy - fcy);
      break;
    case 'left':
      if (!(tcx < fcx - 1 && to.right <= from.left + SLACK)) return null;
      primary = Math.max(0, from.left - to.right);
      orthGap = Math.max(0, to.top - from.bottom, from.top - to.bottom);
      centerDiff = Math.abs(tcy - fcy);
      break;
  }
  return primary + orthGap * 2.5 + centerDiff * 0.12;
}

/** How a newly focused control is scrolled into view (the app installs a smooth version). */
let revealer: (el: HTMLElement) => void = el => el.scrollIntoView({block: 'nearest', inline: 'nearest'});
export function setRevealer(fn: (el: HTMLElement) => void) {
  revealer = fn;
}

export function focusEl(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  el.focus({preventScroll: true});
  revealer(el);
  return document.activeElement === el;
}

/** Focus the preferred control in the scope ([data-autofocus]) or the first one. */
export function focusDefault(scope: HTMLElement | null = activeScope()): void {
  if (!scope) return;
  const preferred = scope.querySelector<HTMLElement>('[data-autofocus]:not([disabled])');
  if (preferred && isVisible(preferred) && focusEl(preferred)) return;
  // Prefer the main view over the top bar so Wallet is never the default target.
  const main = scope.querySelector<HTMLElement>('.view');
  const first = (main && focusables(main)[0]) || focusables(scope)[0];
  focusEl(first);
}

/** Does `to` share a row (horizontal moves) or column (vertical moves) with `from`? */
function aligned(dir: Dir, from: DOMRect, to: DOMRect): boolean {
  if (dir === 'left' || dir === 'right') return to.bottom > from.top + 2 && to.top < from.bottom - 2;
  return to.right > from.left + 2 && to.left < from.right - 2;
}

/**
 * Move focus one step. `aligned` restricts the search to controls in the same
 * row/column; the caller falls back to any direction afterwards.
 */
export function moveFocus(dir: Dir, mode: 'aligned' | 'any' = 'any'): boolean {
  const scope = activeScope();
  if (!scope) return false;
  const current = document.activeElement as HTMLElement | null;
  const list = focusables(scope);
  if (!current || current === document.body || !scope.contains(current)) {
    focusDefault(scope);
    return true;
  }
  const from = current.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    if (mode === 'aligned' && !aligned(dir, from, r)) continue;
    const s = score(dir, from, r);
    if (s !== null && s < bestScore) {
      bestScore = s;
      best = el;
    }
  }
  if (best) return focusEl(best);
  return false;
}

/**
 * A screen can claim directional presses that run off the edge of the layout
 * (the paged lobby uses this to flip pages). Return true if handled.
 */
type EdgeHandler = (dir: Dir, from: HTMLElement | null) => boolean;
let edgeHandler: EdgeHandler | null = null;
export function setEdgeHandler(h: EdgeHandler | null): void {
  edgeHandler = h;
}

// Legacy key names and raw key codes, in case the host sends either.
const CODE_DIR: Record<number, Dir> = {38: 'up', 40: 'down', 37: 'left', 39: 'right', 19: 'up', 20: 'down', 21: 'left', 22: 'right'};
export const dirOf = (e: KeyboardEvent): Dir | undefined => KEY_DIR[e.key] ?? CODE_DIR[e.keyCode];
export const isEnter = (e: KeyboardEvent) => e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13 || e.keyCode === 23;
const isBack = (e: KeyboardEvent) => e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 27;

function navigate(dir: Dir) {
  const from = document.activeElement as HTMLElement | null;
  // 1) same row/column, 2) screen-specific edge behaviour (page flips), 3) anything that way.
  if (moveFocus(dir, 'aligned')) return;
  if (edgeHandler && edgeHandler(dir, from)) return;
  moveFocus(dir, 'any');
}

/** Is focus sitting on nothing useful (document, body, the app root)? */
export function focusIsLost(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a === document.body || a === document.documentElement) return true;
  if (a.hasAttribute('data-focus-root')) return true; // parked during a screen change
  const scope = activeScope();
  return !scope || a === scope || !scope.contains(a);
}

/**
 * A screen can take over raw input (the driving screen wants every swipe and pinch).
 * Return true from the capture to consume the key; Back keys always fall through.
 */
type KeyCapture = (e: KeyboardEvent) => boolean;
let capture: KeyCapture | null = null;
export function setKeyCapture(c: KeyCapture | null): void {
  capture = c;
}

/** Install the global handler. Returns a cleanup function. */
export function installSpatialNav(onEscape: () => void): () => void {
  let lastSynth: {el: Element; at: number} | null = null;
  let lastFocusChange = -Infinity;

  const onKey = (e: KeyboardEvent) => {
    if (capture && !isBack(e) && capture(e)) {
      e.preventDefault();
      return;
    }
    const dir = dirOf(e);
    if (dir) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.defaultPrevented) {
        // Something upstream (e.g. the glasses browser) claimed this press. Only step
        // in if focus did not change at all since the press, so it never moves twice.
        const pressedAt = e.timeStamp;
        setTimeout(() => {
          if (lastFocusChange < pressedAt) navigate(dir);
        }, 40);
        return;
      }
      e.preventDefault();
      navigate(dir);
      return;
    }
    if (isEnter(e) && !e.defaultPrevented) {
      // Real Enter presses activate buttons natively. A synthesized one (isTrusted
      // false) does not, so press the focused control ourselves.
      if (focusIsLost()) {
        e.preventDefault();
        focusDefault();
        return;
      }
      const el = document.activeElement as HTMLElement;
      if (!e.isTrusted && typeof el.click === 'function') {
        e.preventDefault();
        lastSynth = {el, at: performance.now()};
        el.click();
      }
      return;
    }
    if (isBack(e) && !e.defaultPrevented) {
      e.preventDefault();
      onEscape();
    }
  };

  // If we synthesized a click, swallow a duplicate the host may fire right after.
  const onClick = (e: MouseEvent) => {
    if (!lastSynth || !e.isTrusted) return; // our own el.click() passes through here first
    const dup = performance.now() - lastSynth.at < 300 && e.target instanceof Node && lastSynth.el.contains(e.target);
    if (dup && e.isTrusted) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
    lastSynth = null;
  };

  // When the page becomes active (glasses wake, app switch), make sure a control has focus.
  const recover = () => {
    if (!document.hidden && focusIsLost()) requestAnimationFrame(() => focusIsLost() && focusDefault());
  };

  const onFocusIn = () => {
    lastFocusChange = performance.now();
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onClick, true);
  window.addEventListener('focus', recover);
  window.addEventListener('pageshow', recover);
  document.addEventListener('visibilitychange', recover);
  return () => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('focus', recover);
    window.removeEventListener('pageshow', recover);
    document.removeEventListener('visibilitychange', recover);
  };
}
