// The app's only network use: public market prices and headlines for the
// Stocks tab. Nothing of yours is sent. Inside the Android app the request
// goes through the app (pages can't read other sites directly); on the web
// it's a plain fetch, which those sites may refuse.

let seq = 0;
const waiting = new Map();

window.__lifeosHttp = (id, status, text) => {
  const w = waiting.get(id); if (!w) return;
  waiting.delete(id);
  status >= 200 && status < 300 ? w.resolve(text) : w.reject(new Error(`HTTP ${status}`));
};

export function getText(url, { timeout = 20000 } = {}) {
  const app = window.LifeOSAndroid;
  if (app?.httpGet) {
    return new Promise((resolve, reject) => {
      const id = "r" + ++seq;
      waiting.set(id, { resolve, reject });
      setTimeout(() => { if (waiting.delete(id)) reject(new Error("timeout")); }, timeout);
      app.httpGet(id, url);
    });
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  return fetch(url, { signal: ctl.signal })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .finally(() => clearTimeout(t));
}

export const getJSON = (url, opts) => getText(url, opts).then(JSON.parse);
