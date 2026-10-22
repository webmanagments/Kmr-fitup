// Troubleshooting overlay, loaded only with ?debug in the URL.
// Shows exactly what input the glasses deliver, so problems can be diagnosed remotely.

function describe(el: EventTarget | Element | null): string {
  if (!el || !(el instanceof Element)) return String(el);
  const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 16) || '';
  return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList[0] ? '.' + el.classList[0] : ''}${label ? ` "${label}"` : ''}`;
}

export function installDebug(): void {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:fixed;left:4px;right:4px;bottom:4px;z-index:99999;pointer-events:none;' +
    'font:600 10px/1.35 ui-monospace,monospace;color:#9effa0;background:rgba(0,0,0,.82);' +
    'padding:4px 6px;border-radius:4px;white-space:pre-wrap;max-height:150px;overflow:hidden';
  document.body.appendChild(box);
  const lines: string[] = [];
  const push = (s: string) => {
    lines.unshift(s);
    lines.length = Math.min(lines.length, 7);
    render();
  };
  const render = () => {
    box.textContent =
      `vp ${innerWidth}×${innerHeight} dpr ${devicePixelRatio} zoom ${(document.getElementById('root') as HTMLElement)?.style.zoom || 1} ` +
      `| focus: ${describe(document.activeElement)}\n` +
      lines.join('\n');
  };
  const key = (phase: string) => (e: KeyboardEvent) =>
    push(`${phase} key=${e.key} code=${e.code} kc=${e.keyCode} trusted=${e.isTrusted} prevented=${e.defaultPrevented} mods=${+e.altKey}${+e.ctrlKey}${+e.metaKey}${+e.shiftKey} → ${describe(e.target)}`);
  window.addEventListener('keydown', key('down▸'), true);
  window.addEventListener('keydown', key('down◂'), false);
  window.addEventListener('keyup', key('up  '), true);
  for (const t of ['pointerdown', 'click'] as const)
    window.addEventListener(t, (e: Event) => {
      const m = e as MouseEvent;
      push(`${t} @${Math.round(m.clientX)},${Math.round(m.clientY)} trusted=${e.isTrusted} → ${describe(e.target)}`);
    }, true);
  window.addEventListener('wheel', e => push(`wheel dx=${Math.round(e.deltaX)} dy=${Math.round(e.deltaY)}`), true);
  window.addEventListener('popstate', () => push(`popstate len=${history.length}`));
  window.addEventListener('focus', () => push('window focus'));
  window.addEventListener('blur', () => push('window blur'));
  document.addEventListener('focusin', render);
  window.addEventListener('error', e => push(`ERROR ${e.message}`));
  window.addEventListener('unhandledrejection', e => push(`REJECT ${String(e.reason)}`));
  render();
}
