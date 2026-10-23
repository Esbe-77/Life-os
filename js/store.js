// On-device storage shared by every module.
//
// Each module owns one JSON document, kept in localStorage under
// "lifeos.v1.<moduleId>". Modules never touch localStorage directly: they
// call load/save here, so the storage engine can change later in one place.

const PREFIX = "lifeos.v1.";
const META_KEY = PREFIX + "_meta";
const listeners = new Map(); // moduleId -> Set<fn>

export function load(moduleId, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + moduleId);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

// Returns true when saved. A false return means the phone refused the write
// (storage full or blocked); callers should tell the person.
export function save(moduleId, data) {
  try {
    localStorage.setItem(PREFIX + moduleId, JSON.stringify(data));
  } catch {
    return false;
  }
  saveListeners.forEach(fn => fn(moduleId));
  return true;
}

// Fires after any module saves in this window (used to keep reminders in step).
const saveListeners = new Set();
export function onAnySave(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }

// Fires when another tab or window of the app changes a module's data.
export function onChange(moduleId, fn) {
  if (!listeners.has(moduleId)) listeners.set(moduleId, new Set());
  listeners.get(moduleId).add(fn);
  return () => listeners.get(moduleId).delete(fn);
}
window.addEventListener("storage", e => {
  if (!e.key || !e.key.startsWith(PREFIX)) return;
  const id = e.key.slice(PREFIX.length);
  listeners.get(id)?.forEach(fn => fn());
});

export function getMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
}
export function setMeta(patch) {
  try { localStorage.setItem(META_KEY, JSON.stringify({ ...getMeta(), ...patch })); } catch { return; }
  saveListeners.forEach(fn => fn("_meta"));
}

// Ask the browser not to clear the app's data when the phone is low on space.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
