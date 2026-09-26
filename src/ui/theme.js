// Power Link — theme (light / dark / follow device)
// Choice lives in chrome.storage.local 'pl_theme' ('device' | 'dark' | 'light'); it is per browser,
// never synced. Every extension page imports this module: it stamps html[data-theme] and keeps it
// current when the choice changes on another page or the OS switches between light and dark.
const KEY = 'pl_theme';
const media = globalThis.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
let choice = 'device';

const resolve = (c) => (c === 'dark' || c === 'light' ? c : media && media.matches ? 'dark' : 'light');
function apply() { document.documentElement.dataset.theme = resolve(choice); }

export const themeChoice = () => choice;
export const currentTheme = () => resolve(choice);
export async function setTheme(c) { choice = c; apply(); await chrome.storage.local.set({ [KEY]: c }); }

apply();
export const themeReady = chrome.storage.local.get(KEY).then((r) => { choice = r[KEY] || 'device'; apply(); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[KEY]) { choice = ch[KEY].newValue || 'device'; apply(); } });
if (media) media.addEventListener('change', apply);
