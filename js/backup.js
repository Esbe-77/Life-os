// One backup file for the whole app, and restoring from it.
//
// Format: { app: "life-os", format: 1, exportedAt, modules: { <moduleId>: <module export> } }
// Restoring also accepts the original Weekly Review web page's backup
// ({ app: "weekly-review", reviews: [...] }).

import * as store from "./store.js";
import { MODULES } from "./modules/index.js";

export function buildBackup() {
  const modules = {};
  for (const m of MODULES) if (m.exportData) modules[m.id] = m.exportData();
  return { app: "life-os", format: 1, exportedAt: new Date().toISOString(), modules };
}

export function hasAnyData() {
  return MODULES.some(m => m.hasData?.());
}

// Returns a list of plain-language lines describing what was restored,
// or throws an Error whose message can be shown to the person.
export function restore(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error("That file isn't a Life OS backup."); }

  let sections;
  if (parsed?.app === "life-os" && parsed.modules && typeof parsed.modules === "object") sections = parsed.modules;
  else if (parsed?.app === "weekly-review" || Array.isArray(parsed?.reviews)) sections = { "weekly-review": parsed };
  else throw new Error("That file isn't a Life OS backup.");

  const lines = [];
  for (const m of MODULES) {
    if (!m.importData || !(m.id in sections)) continue;
    const result = m.importData(sections[m.id]);
    if (!result) continue;
    const label = m.backupName || m.name;
    if (result.error) { lines.push(`${label}: ${result.error}`); continue; }
    if (!result.added && !result.kept) continue;
    const [one, many] = result.noun;
    const added = result.added ? `${result.added} ${result.added === 1 ? one : many} restored` : `nothing new`;
    lines.push(`${label}: ${added}${result.kept ? `, ${result.kept} already up to date` : ""}.`);
  }
  if (!lines.length) lines.push("That backup was empty, so nothing changed.");
  return lines;
}

// Hands a file to the phone: the share sheet where available (so it can go
// straight to Google Drive or email), otherwise a normal download.
export async function saveFile(filename, text, type = "application/json") {
  // Inside the Android app: the phone's "save to" picker (Drive, Downloads…).
  if (window.LifeOSAndroid) {
    return new Promise(resolve => {
      window.__lifeosSaveResult = result => { window.__lifeosSaveResult = null; resolve(result); };
      window.LifeOSAndroid.saveFile(filename, text, type);
    });
  }
  const file = new File([text], filename, { type });
  try {
    // Phones get the share sheet; computers get a plain download.
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    }
  } catch (e) {
    if (e?.name === "AbortError") return "cancelled";
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

export async function saveBackup() {
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const how = await saveFile(`life-os-backup-${stamp}.json`, JSON.stringify(buildBackup(), null, 2));
  if (how !== "cancelled" && how !== "failed") store.setMeta({ lastBackupAt: new Date().toISOString() });
  return how;
}

export function daysSinceBackup() {
  const at = store.getMeta().lastBackupAt;
  return at ? Math.floor((Date.now() - new Date(at).getTime()) / 86400000) : null;
}
