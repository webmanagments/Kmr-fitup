// GitHub Pages lets phones keep an old copy of the page for a while after an update. A moment
// after start-up, ask for the current version number (never cached) and, if it's newer, reload
// once from a fresh address so the new app is what runs.
declare const __BUILD__: string;
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

export function keepFresh(delay = 4000) {
  if (BUILD === 'dev' || !/^https?:$/.test(location.protocol)) return;
  setTimeout(async () => {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, {cache: 'no-store'});
      if (!r.ok) return;
      const {build} = (await r.json()) as {build?: string};
      if (!build || build === BUILD) return;
      if (sessionStorage.getItem('kmr.reloadFor') === build) return; // tried once already
      sessionStorage.setItem('kmr.reloadFor', build);
      const u = new URL(location.href);
      u.searchParams.set('v', build.replace(/\D/g, ''));
      location.replace(u.toString());
    } catch {
      /* offline: keep running what we have */
    }
  }, delay);
}
