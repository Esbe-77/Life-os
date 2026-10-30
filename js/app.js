// App shell: routing, the bottom tab bar, and the settings page.
//
// Routes are "#/<moduleId>/<view>". A module renders into the view element
// and may keep its state between its own views by returning setView().

import * as store from "./store.js";
import * as backup from "./backup.js";
import * as reminders from "./reminders.js";
import { applyNotificationDone } from "./habits.js";
import { $, el, timePick } from "./ui.js";
import { MODULES, TABS } from "./modules/index.js";

const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  review: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  decisions: '<path d="M12 3v18"/><path d="M5 6h10l3 3-3 3H5z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 4.6a3 3 0 010 6M21 20c0-3-1.6-5.2-4-5.8"/>',
  energy: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  mind: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  goals: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
  stocks: '<path d="M4 20h16"/><path d="M4 16l5-5 4 3 7-8"/><path d="M15 6h5v5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};
export const icon = name => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";
  return s;
};

const SETTINGS = { id: "settings", name: "Settings", mount: mountSettings, backTo: () => "home" };
const byId = id => MODULES.find(m => m.id === id) || (id === "settings" ? SETTINGS : null);

const viewEl = $("#view");
const headEl = $("#head");
const subtabsEl = $("#subtabs");
let current = null; // { module, instance, view }

export function navigate(path) {
  const target = "#/" + path;
  if (location.hash === target) route(); else location.hash = target;
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const module = byId(parts[0]) || MODULES[0];
  return { module, view: module.id === parts[0] ? parts.slice(1).join("/") : "" };
}

function route() {
  const { module, view } = parseHash();
  if (current && current.module === module && current.instance?.setView) {
    current.view = view;
    current.instance.setView(view);
  } else {
    current?.instance?.unmount?.();
    viewEl.replaceChildren();
    current = { module, view, instance: null };
    current.instance = module.mount(viewEl, { view, navigate, refreshChrome: renderChrome }) || null;
    window.scrollTo(0, 0);
  }
  renderChrome();
}

function renderChrome() {
  const { module, view } = current;

  // Page heading
  headEl.replaceChildren();
  const title = module.title ? module.title(view) : module.name;
  const sub = module.subtitle ? module.subtitle(view) : "";
  const h1 = el("h1", {}, title, sub ? el("span", { class: "sub", text: sub }) : null);
  const back = module.backTo?.(view);
  headEl.classList.toggle("detail", !!back);
  if (back) {
    // Detail pages: back on the left, the name centred.
    const a = el("a", { class: "iconbtn", href: "#/" + back, "aria-label": "Back" });
    a.append(icon("back"));
    headEl.append(a, h1, el("span", { "aria-hidden": "true" }));
  } else {
    headEl.append(h1);
    if (module.id === "home") {
      const a = el("a", { class: "iconbtn", href: "#/settings", "aria-label": "Settings and backup" });
      a.append(icon("settings"));
      headEl.append(a);
    }
  }

  // Sub-views (e.g. "This week" / "Look back")
  subtabsEl.replaceChildren();
  const views = module.views || [];
  const showSub = views.length > 1 && views.some(([v]) => v === view);
  subtabsEl.hidden = !showSub;
  if (showSub) views.forEach(([v, label]) => subtabsEl.append(el("a", {
    href: "#/" + module.id + (v ? "/" + v : ""), "aria-current": v === view ? "page" : null,
  }, label)));

  // Tab bar
  const nav = $("#tabbar nav");
  nav.replaceChildren();
  TABS.forEach(m => {
    const a = el("a", { href: "#/" + m.id, style: `--tc:${m.color}`, "aria-current": m === module ? "page" : null });
    a.append(icon(m.icon), el("span", { text: m.tab }));
    const n = m.badge?.() || 0;
    if (n) a.append(el("span", { class: "badge", "aria-label": `${n} waiting`, text: String(n) }));
    nav.append(a);
  });

  document.title = module.id === "home" ? "Life OS" : `${module.name} · Life OS`;
}

// ---------- settings ----------
function mountSettings(root) {
  const note = el("p", { class: "small muted", "aria-live": "polite" });
  const fileIn = el("input", { type: "file", accept: "application/json,.json", hidden: true });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files[0]; fileIn.value = "";
    if (!f) return;
    try {
      const lines = backup.restore(await f.text());
      note.replaceChildren(...lines.map(l => el("span", { style: "display:block", text: l })));
      renderChrome();
    } catch (e) { note.textContent = e.message; }
  });

  const since = backup.daysSinceBackup();
  const persisted = el("span", { text: "Checking…" });
  (async () => {
    if (window.LifeOSAndroid) {
      persisted.textContent = `Life OS app ${window.LifeOSAndroid.version()}. Your data stays through updates. Uninstalling the app deletes it, so save a backup first.`;
      return;
    }
    const ok = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    persisted.textContent = ok
      ? "Your phone has agreed to keep this app's data even when storage runs low."
      : "Install the app to your home screen so your phone treats its data as permanent.";
  })();

  const rr = { on: false, time: "19:00", ...store.getMeta().reviewReminder };
  const setRR = patch => { store.setMeta({ reviewReminder: { ...rr, ...patch } }); root.replaceChildren(); mountSettings(root); };
  const reminderCard = el("section", { class: "card" },
    el("h2", { style: "font-size:20px;font-weight:500", text: "Sunday review" }),
    el("div", { class: "row", style: "padding:0;border:0" },
      el("div", { class: "main" },
        el("span", { class: "title" }, "Sundays at ", timePick(rr.time, { value: rr.time, className: "datelink", ariaLabel: "Change the Sunday review time" }, t => setRR({ time: t }))),
        el("span", { class: "meta", text: reminders.canNotify() ? (rr.on ? "Your phone reminds you" : "No reminder") : "Reminders work in the Android app" })),
      reminders.canNotify() ? el("button", { class: "btn small", "aria-pressed": String(rr.on), onclick: () => {
        if (!rr.on) reminders.askPermission();
        setRR({ on: !rr.on });
      } }, rr.on ? "Turn off" : "Remind me") : null),
    el("p", { class: "small muted", text: "From this time on Sunday, Home asks you to plan next week's habits." + (reminders.canNotify() ? " Decisions remind you on their check-in day, at 9am. Habit reminders are set on each habit." : "") }));

  root.append(
    reminderCard,
    el("section", { class: "card" },
      el("h2", { style: "font-size:20px;font-weight:500", text: "Backup" }),
      el("p", { class: "small", text: "Everything you write stays on this phone. Nothing is sent anywhere. Save a backup now and then (to Google Drive, for example) so a lost or reset phone doesn't mean lost years." }),
      el("p", { class: "mono muted", text: since == null ? "No backup saved yet" : since === 0 ? "Last backup: today" : `Last backup: ${since} ${since === 1 ? "day" : "days"} ago` }),
      el("div", { class: "tools" },
        el("button", { class: "btn primary", onclick: async () => {
          const how = await backup.saveBackup();
          note.textContent = how === "cancelled" ? "Cancelled." : how === "failed" ? "Couldn't save the file. Try another place." : "Backup saved. Keep it somewhere other than this phone.";
          renderSettingsAgain();
        } }, "Save a backup"),
        el("button", { class: "btn", onclick: () => fileIn.click() }, "Restore from a backup"),
        fileIn),
      note,
      el("p", { class: "small muted", text: "Restoring adds what's in the file. Where both have the same entry, the more recently edited one is kept. You can also restore the backup file from the original Weekly Review page." })),
    el("section", { class: "card" },
      el("h2", { style: "font-size:20px;font-weight:500", text: "On this phone" }),
      el("p", { class: "small" }, persisted),
      window.LifeOSAndroid ? null : el("p", { class: "small muted", text: "To install: open this page in Chrome, tap the ⋮ menu, then “Add to Home screen” or “Install app”. It then opens like any other app and works offline." })),
  );
  function renderSettingsAgain() {
    const m = root.querySelector(".mono.muted");
    const d = backup.daysSinceBackup();
    if (m) m.textContent = d === 0 ? "Last backup: today" : `Last backup: ${d} days ago`;
  }
}

// ---------- start ----------
// Habits ticked off from a notification are applied before anything is drawn,
// and again whenever the app comes back to the front.
applyNotificationDone();
window.__lifeosResume = () => {
  if (!applyNotificationDone() || !current) return;
  current.instance?.unmount?.(); current = null; route();
};
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && current) renderChrome(); });
store.requestPersistence();
route();
// Keep the phone's reminders in step with what's saved.
let syncTimer = null;
store.onAnySave(() => { clearTimeout(syncTimer); syncTimer = setTimeout(reminders.syncReminders, 400); });
reminders.syncReminders();
// The Android app ships its files inside the APK, so it needs no offline cache.
if ("serviceWorker" in navigator && !window.LifeOSAndroid) navigator.serviceWorker.register("sw.js").catch(() => {});
