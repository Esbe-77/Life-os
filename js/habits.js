// Habits, shown on Home. There are two kinds:
//   "do"    something to do more of. You plan its days each week (on Sunday,
//           after the review), tick it off, and can add reminders and a timer.
//   "break" something to do less of. You log each time it happens, and its
//           page shows when it tends to happen.
//
// Weeks run Monday to Sunday. Planning for the next week opens on Sunday at
// the review time (7pm unless changed in Settings), or once the review is done.
//
// Data (store key "habits"):
//   { habits: [ { id, name, createdAt, kind: "do" | "break",
//                 done: ["YYYY-MM-DD", ...] (days it was completed),
//                 target: times a day (1 for most), counts: { "YYYY-MM-DD": n } (when target > 1),
//                 plans: { "<Monday YYYY-MM-DD>": [0–6] (Date.getDay(), 0 = Sunday) },
//                 fixed: bool (use the latest plan when a week has none),
//                 reminders: [ { id, time: "HH:MM" } ], completedAt (last time a day was completed),
//                 timerMin: number | null, timerEndsAt: ISO datetime | null,
//                 log: [ { id, at: "YYYY-MM-DDTHH:MM", note } ] } ] }
// Older data had one `days` list instead of `plans`: it becomes this week's
// plan, so nothing changes until the next week is planned.

import * as store from "./store.js";
import * as reminders from "./reminders.js";
import { el, isoDate, addDays, parseDate, timePick, WEEKDAYS, weekStart, MONTHS, sortable, moveItem, ding } from "./ui.js";

const KEY = "habits";
const ALL = [0, 1, 2, 3, 4, 5, 6];
const SUGGESTED = [["Move for 20 minutes", "do"], ["Read", "do"], ["Get outside", "do"], ["Snacking", "break"], ["People pleasing", "break"]];
const TIMERS = [[null, "No timer"], [5, "5 min"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PARTS = [["Morning", 5, 12], ["Afternoon", 12, 17], ["Evening", 17, 22], ["Night", 22, 29]];

const pad = n => String(n).padStart(2, "0");
const today = () => isoDate(new Date());
const nowStamp = () => { const d = new Date(); return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const shortDate = iso => { const d = parseDate(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const weekDates = ws => Array.from({ length: 7 }, (_, i) => addDays(ws, i));

// ---------- data ----------
function normalize(h) {
  const n = { kind: "do", reminders: [], timerMin: null, timerEndsAt: null, done: [], log: [], fixed: false, target: 1, counts: {}, ...h };
  n.target = Math.max(1, Math.min(20, Math.round(+n.target) || 1));
  if (!n.counts || typeof n.counts !== "object") n.counts = {};
  if (n.kind !== "break") n.kind = "do";
  if (!n.plans || typeof n.plans !== "object") {
    n.plans = {};
    if (Array.isArray(h.days) && h.days.length) n.plans[weekStart(today())] = h.days.slice();
  }
  delete n.days;
  return n;
}
export function loadHabits() {
  const d = store.load(KEY, { habits: [] });
  return (Array.isArray(d.habits) ? d.habits : []).filter(h => h?.id).map(normalize);
}
export function saveHabits(habits) { return store.save(KEY, { habits }); }
export function getHabit(id) { return loadHabits().find(h => h.id === id) || null; }
function patchHabit(id, patch) { return saveHabits(loadHabits().map(h => h.id === id ? { ...h, ...patch } : h)); }
export function addHabit(name, kind = "do") {
  const habits = loadHabits();
  habits.push(normalize({ id: newId(), name, kind, createdAt: new Date().toISOString() }));
  saveHabits(habits);
}

// Merges a backup's habits in: ticks, plans and log entries are combined.
export function mergeHabits(incoming) {
  const mine = loadHabits();
  let added = 0, kept = 0;
  for (const raw of incoming) {
    if (!raw?.id || !raw.name) continue;
    const h = normalize(raw);
    const m = mine.find(x => x.id === h.id);
    if (!m) { mine.push({ ...h, timerEndsAt: null }); added++; continue; }
    const done = [...new Set([...m.done, ...h.done])].sort();
    const ids = new Set(m.log.map(e => e.id));
    const log = [...m.log, ...h.log.filter(e => e?.id && !ids.has(e.id))].sort((a, b) => a.at.localeCompare(b.at));
    const plans = { ...h.plans, ...m.plans };
    const counts = { ...m.counts };
    for (const [d, n] of Object.entries(h.counts)) if (!(counts[d] >= n)) counts[d] = n;
    if (done.length !== m.done.length || log.length !== m.log.length || Object.keys(plans).length !== Object.keys(m.plans).length || JSON.stringify(counts) !== JSON.stringify(m.counts)) {
      Object.assign(m, { done, log, plans, counts }); added++;
    } else kept++;
  }
  return { mine, added, kept };
}

// ---------- weeks and plans ----------
export function resetTime() { return store.getMeta().reviewReminder?.time || "19:00"; }

// The week being planned: this week, or next week from Sunday at the review
// time (or as soon as Sunday's review is done, if that's earlier).
export function planWeek(now = new Date()) {
  const iso = isoDate(now), ws = weekStart(iso);
  if (now.getDay() !== 0) return ws;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const reviewed = store.load("weekly-review", { reviews: {} }).reviews?.[iso]?.status === "done";
  return hhmm >= resetTime() || reviewed ? addDays(ws, 7) : ws;
}

// Planned days for the week starting ws, or null if it hasn't been planned.
export function daysFor(h, ws) {
  if (h.plans[ws]) return h.plans[ws];
  if (!h.fixed) return null;
  const earlier = Object.keys(h.plans).filter(k => k < ws).sort().pop();
  return earlier ? h.plans[earlier] : null;
}
const isOn = (h, iso) => (daysFor(h, weekStart(iso)) || []).includes(parseDate(iso).getDay());
export function plannedDates(h, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isOn(h, d)) out.push(d);
  return out;
}
const doHabits = () => loadHabits().filter(h => h.kind === "do");
export const needsPlan = (ws = planWeek()) => doHabits().filter(h => !daysFor(h, ws));

function setPlan(id, ws, days) {
  const h = getHabit(id); if (!h) return;
  const plans = { ...h.plans };
  plans[ws] = [...days].sort();
  patchHabit(id, { plans });
}
function daysText(days) {
  if (!days?.length) return "No days";
  if (days.length === 7) return "Every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every(x => days.includes(x))) return "Weekdays";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "Weekends";
  return WEEKDAYS.filter(([n]) => days.includes(n)).map(([, l]) => l).join(", ");
}
const weekName = ws => ws === weekStart(today()) ? "this week" : ws > today() ? "next week" : `week of ${shortDate(ws)}`;

// ---------- ticks, timers and logs ----------
// Done taps from habit notifications (Android app), queued by the app until
// the page is open. Returns how many were applied.
export function applyNotificationDone() {
  let list = [];
  try { list = JSON.parse(window.LifeOSAndroid?.takeDone?.() || "[]"); } catch {}
  let n = 0;
  for (const e of list) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.date || "")) continue;
    if (e.review) { if (completeReview(e.date)) n++; }
    else if (e.habit && bump(e.habit, e.date, 1) != null) n++;
  }
  return n;
}

// Complete on the Sunday review reminder: marks that week's review done,
// keeping anything already written in it.
function completeReview(iso) {
  const d = parseDate(iso), sun = addDays(iso, -d.getDay());
  const data = store.load("weekly-review", { reviews: {} });
  const reviews = data.reviews || {}, r = reviews[sun];
  if (r?.status === "done") return false;
  const now = new Date().toISOString();
  reviews[sun] = { week: sun, answers: r?.answers || { well: "", drained: "", avoided: "", matters: "", drop: "" },
    status: "done", createdAt: r?.createdAt || now, updatedAt: now };
  return store.save("weekly-review", { ...data, reviews });
}

// How many times it's been done on a day, and a change of that by one.
// Reaching the target completes the day.
export const countOn = (h, iso) => h.counts[iso] ?? (h.done.includes(iso) ? h.target : 0);
function bump(id, iso, by) {
  const h = getHabit(id); if (!h) return null;
  const n = Math.max(0, Math.min(h.target, countOn(h, iso) + by));
  const counts = { ...h.counts };
  if (h.target > 1 && n) counts[iso] = n; else delete counts[iso];
  const done = new Set(h.done);
  const finished = n >= h.target && !done.has(iso);
  n >= h.target ? done.add(iso) : done.delete(iso);
  patchHabit(id, { counts, done: [...done].sort(), ...(finished ? { completedAt: new Date().toISOString() } : {}) });
  return n;
}

// A tap in the app. Completing a habit for today (the last go, if it's
// several times a day) plays a chime.
function tap(id, iso, by) {
  const h = getHabit(id); if (!h) return null;
  const before = countOn(h, iso), n = bump(id, iso, by);
  if (iso === today() && before < h.target && n >= h.target) ding();
  return n;
}

// A finished timer counts one go on the day it ended.
export function settleTimers() {
  const now = Date.now();
  for (const h of loadHabits()) {
    if (h.timerEndsAt && new Date(h.timerEndsAt).getTime() <= now) {
      patchHabit(h.id, { timerEndsAt: null });
      bump(h.id, isoDate(new Date(h.timerEndsAt)), 1);
    }
  }
}

function logOnce(id, at = nowStamp()) {
  const h = getHabit(id); if (!h) return null;
  const entry = { id: newId(), at, note: "" };
  patchHabit(id, { log: [...h.log, entry].sort((a, b) => a.at.localeCompare(b.at)) });
  return entry;
}
function patchEntry(id, entryId, patch) {
  const h = getHabit(id); if (!h) return;
  const log = patch ? h.log.map(e => e.id === entryId ? { ...e, ...patch } : e) : h.log.filter(e => e.id !== entryId);
  patchHabit(id, { log: log.sort((a, b) => a.at.localeCompare(b.at)) });
}
const countIn = (h, from, to) => h.log.filter(e => { const d = e.at.slice(0, 10); return d >= from && d <= to; }).length;

function weekSummary(h, ws = weekStart(today())) {
  const dates = weekDates(ws);
  if (h.kind === "break") return { dates, count: countIn(h, ws, addDays(ws, 6)) };
  const planned = (daysFor(h, ws) || []).length;
  const done = dates.filter(d => h.done.includes(d)).length;
  return { dates, planned, done };
}

// One line per habit for a week (used by the weekly review and goals).
function weekLine(h, ws) {
  const s = weekSummary(h, ws);
  if (h.kind === "break") {
    const before = countIn(h, addDays(ws, -7), addDays(ws, -1));
    return { id: h.id, name: h.name, text: `${s.count} time${s.count === 1 ? "" : "s"}${before || s.count ? ` (week before: ${before})` : ""}` };
  }
  return { id: h.id, name: h.name, text: s.planned ? `${s.done} of ${s.planned} days` : `${s.done} day${s.done === 1 ? "" : "s"}, not planned` };
}
export function weekLines(ws) {
  return loadHabits().filter(h => new Date(h.createdAt) <= new Date(addDays(ws, 7))).map(h => weekLine(h, ws));
}
// This week's line for one habit, or null if it's gone.
export function habitThisWeek(id) {
  const h = getHabit(id);
  return h ? weekLine(h, weekStart(today())) : null;
}

function nextOn(h) {
  for (let i = 1; i <= 7; i++) { const d = addDays(today(), i); if (isOn(h, d)) return i === 1 ? "tomorrow" : DAY_NAMES[parseDate(d).getDay()]; }
  return "";
}
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const timeOf = at => at.slice(11, 16);

// ---------- the section on Home ----------
let justLogged = null; // { habitId, entryId, until } so a mistaken tap can be undone
let reordering = false; // Home shows drag handles instead of ticks while true
// Whether Home shows the habits not planned for today (remembered on this phone).
let showLater = !!store.getMeta().showLaterHabits;
const rememberFold = () => store.setMeta({ showLaterHabits: showLater });

export function habitsSection(rerender) {
  settleTimers();
  const habits = loadHabits();
  const t = today();
  let adding = false, addKind = "do";
  const sec = el("section", { class: "section" });

  const draw = () => {
    sec.replaceChildren();
    sec.append(el("div", { class: "rowhead" },
      el("h2", { text: reordering ? "Drag to reorder" : "Habits" }),
      reordering
        ? el("button", { class: "linkbtn", onclick: () => { reordering = false; rerender(); } }, "Done")
        : habits.length ? el("span", { class: "tools", style: "gap:16px" },
            habits.length > 1 && !adding ? el("button", { class: "linkbtn", onclick: () => { reordering = true; rerender(); } }, "Reorder") : null,
            el("button", { class: "linkbtn", onclick: () => { adding = !adding; draw(); if (adding) sec.querySelector("#habit-new")?.focus(); } }, adding ? "Done" : "Add")) : null));

    if (!habits.length) {
      sec.append(el("div", { class: "card", style: "gap:10px" },
        el("p", { class: "small", text: "A few small things to do more of, and any you'd like to do less of. Plan the days each Sunday and tick them off here." }),
        el("div", { class: "chips" }, SUGGESTED.map(([name, kind]) => el("button", { class: "chip", onclick: () => { addHabit(name, kind); rerender(); } }, (kind === "break" ? "− " : "+ ") + name))),
        addRow()));
      return;
    }

    const dos = habits.filter(h => h.kind === "do"), breaks = habits.filter(h => h.kind === "break");
    if (reordering) {
      // Each row gets a handle, which drags at once; holding the row works too.
      const dragRow = h => el("div", { class: "row", style: "padding:6px 6px 6px 16px" },
        el("div", { class: "main" }, el("span", { class: "title", text: h.name })),
        el("span", { class: "drag-handle", "data-drag": "", "aria-hidden": "true", text: "⠿" }));
      if (dos.length) sec.append(sortable(el("div", { class: "rows sortable" }, dos.map(dragRow)), (from, to) => reorder(dos, from, to)));
      if (breaks.length) {
        sec.append(el("span", { class: "mono muted", style: "margin-top:4px", text: "DOING LESS OF" }));
        sec.append(sortable(el("div", { class: "rows sortable" }, breaks.map(dragRow)), (from, to) => reorder(breaks, from, to)));
      }
      return;
    }

    const plan = planCard();
    if (plan) sec.append(plan);
    // Sorted by when each is next due: today first (earliest reminder first),
    // then tomorrow, then the day after. Habits finished for today, or for the
    // whole week, sink to the bottom, the most recently completed first.
    // Ties keep your own order.
    const ws = weekStart(t), we = addDays(ws, 6);
    const key = h => {
      const week = plannedDates(h, ws, we);
      if (h.done.includes(t) || (week.length && week.every(d => h.done.includes(d)))) {
        // Newest completion first: invert the timestamp's digits so it sorts descending.
        return "9" + (h.completedAt ? h.completedAt.replace(/\d/g, c => 9 - c) : "~");
      }
      const next = plannedDates(h, t, addDays(t, 13)).find(d => !h.done.includes(d));
      if (!next) return "8";
      const first = h.reminders.map(r => r.time).sort()[0] || "99:99";
      return next + (next === t ? first : "");
    };
    const sorted = dos.map((h, i) => [key(h), i, h]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])).map(x => x[2]);
    // Habits not planned for today fold into one row, to keep Home tidy.
    const onToday = sorted.filter(h => isOn(h, t)), later = sorted.filter(h => !isOn(h, t));
    const fold = later.length ? el("button", { class: "row hb-fold", "aria-expanded": String(showLater), onclick: () => { showLater = !showLater; rememberFold(); draw(); } },
      el("span", { class: "main" }, el("span", { class: "title", text: `Not today (${later.length})` }),
        el("span", { class: "meta", text: showLater ? "Tap to hide" : later.map(h => h.name).join(", ") })),
      el("span", { class: "hb-chev", "aria-hidden": "true", text: "⌄" })) : null;
    if (dos.length) sec.append(holdToReorder(el("div", { class: "rows" },
      onToday.map(h => habitRow(h, true)), fold, showLater ? later.map(h => habitRow(h, false)) : null)));
    if (breaks.length) {
      sec.append(el("span", { class: "mono muted", style: "margin-top:4px", text: "DOING LESS OF" }));
      sec.append(holdToReorder(el("div", { class: "rows" }, breaks.map(breakRow))));
    }
    if (adding) sec.append(addRow());
  };

  // Holding a habit (not its buttons) switches Home into reorder mode.
  function holdToReorder(list) {
    let timer = null, start = null, held = false, moved = 0;
    const stop = () => { clearTimeout(timer); timer = null; };
    list.addEventListener("pointerdown", e => {
      if (e.target.closest("button")) return;
      start = { x: e.clientX, y: e.clientY }; held = false; moved = 0;
      timer = setTimeout(enter, 420);
    });
    // The phone's own long-press (contextmenu) counts as a hold too.
    const enter = () => {
      if (held) return;
      stop(); held = true; navigator.vibrate?.(15); reordering = true; rerender();
      // The lifting finger's tap would land on whatever is now under it.
      const swallow = e => { e.preventDefault(); e.stopPropagation(); };
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 1000);
    };
    list.addEventListener("pointermove", e => { if (!start) return; moved = Math.hypot(e.clientX - start.x, e.clientY - start.y); if (timer && moved > 8) stop(); });
    ["pointerup", "pointerleave"].forEach(t => list.addEventListener(t, stop));
    // A scroll cancels the hold; a cancel without movement may be the phone's long-press, so contextmenu decides.
    list.addEventListener("pointercancel", () => { if (moved > 3) stop(); });
    list.addEventListener("contextmenu", e => { e.preventDefault(); if (timer) enter(); });
    list.classList.add("holdable");
    return list;
  }

  // Moves a habit within its list (to do, or to do less of), keeping the other list where it is.
  function reorder(group, from, to) {
    const ids = moveItem(group.map(h => h.id), from, to);
    const byId = new Map(habits.map(h => [h.id, h]));
    let k = 0;
    saveHabits(habits.map(h => group.some(g => g.id === h.id) ? byId.get(ids[k++]) : h));
    rerender();
  }

  function planCard() {
    const ws = planWeek(), missing = needsPlan(ws);
    if (!missing.length) return null;
    const next = ws > t;
    return el("a", { class: "card", href: "#/home/plan", style: "text-decoration:none;color:inherit;border-color:var(--m-habits);gap:4px;padding:16px 20px" },
      el("span", { style: "font-family:var(--font-display);font-size:17px", text: next ? "Plan next week's habits" : "Plan this week's habits" }),
      el("span", { class: "small muted", text: missing.length === 1 ? `Pick the days for ${missing[0].name}.` : `Pick the days for ${missing.length} habits.` }));
  }

  function addRow() {
    const input = el("input", { type: "text", id: "habit-new", placeholder: addKind === "do" ? "Something to do more of" : "Something to do less of", maxlength: 40, autocomplete: "off", style: "flex:1;min-width:0" });
    const add = () => { if (input.value.trim()) { addHabit(input.value.trim(), addKind); rerender(); setTimeout(() => document.getElementById("habit-new")?.focus(), 0); } };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    const kinds = el("div", { class: "chips" }, [["do", "Do more"], ["break", "Do less"]].map(([k, l]) =>
      el("button", { type: "button", class: "chip", "aria-pressed": String(addKind === k), onclick: () => { addKind = k; const v = input.value; draw(); const i = sec.querySelector("#habit-new"); i.value = v; i.focus(); } }, l)));
    return el("div", { class: "field" }, kinds, el("div", { class: "tools", style: "flex-wrap:nowrap" }, input, el("button", { class: "btn", onclick: add }, "Add")));
  }

  function habitRow(h, onToday) {
    const doneToday = h.done.includes(t);
    const { dates, planned, done } = weekSummary(h);
    const dots = el("span", { "aria-hidden": "true", style: "display:inline-flex;gap:4px;align-items:center" },
      dates.map(d => {
        const on = isOn(h, d), hit = h.done.includes(d);
        const size = on || hit ? 8 : 4;
        return el("i", { style: `width:${size}px;height:${size}px;border-radius:50%;${hit ? "background:var(--m-habits)" : on ? "border:1.5px solid var(--m-habits);opacity:.55" : "background:var(--line)"}${d === t ? ";outline:1.5px solid var(--muted);outline-offset:1.5px" : ""}` });
      }));
    const unplanned = !daysFor(h, weekStart(t));
    const n = countOn(h, t), multi = h.target > 1;
    const todayPart = multi && (onToday || n) ? `${n} of ${h.target} today · ` : "";
    const meta = unplanned ? `${todayPart}Not planned this week${done ? ` · ${done} done` : ""}`
      : onToday ? `${todayPart}${done} of ${planned} ${multi ? "days " : ""}this week${!multi && h.reminders.length ? " · " + h.reminders.map(r => r.time).sort().join(", ") : ""}`
      : `Not today · ${done} of ${planned} this week${nextOn(h) ? " · next " + nextOn(h) : ""}`;

    let timerEl = null;
    if (h.timerMin) {
      if (h.timerEndsAt) {
        timerEl = el("button", { class: "btn small hb-timer running", "data-ends": h.timerEndsAt, "aria-label": `Stop the ${h.name} timer`, onclick: () => {
          reminders.cancelTimer(h.id); patchHabit(h.id, { timerEndsAt: null }); rerender();
        } }, mmss(new Date(h.timerEndsAt) - Date.now()));
      } else if (!doneToday) {
        timerEl = el("button", { class: "btn small hb-timer", "aria-label": `Start a ${h.timerMin} minute timer for ${h.name}`, onclick: () => {
          const ends = new Date(Date.now() + h.timerMin * 60000).toISOString();
          patchHabit(h.id, { timerEndsAt: ends });
          const after = Math.min(h.target, n + 1);
          reminders.startTimer(h.id, h.timerMin * 60, h.name, `${h.timerMin} minutes done. ` + (multi && after < h.target ? `${after} of ${h.target} today.` : "Ticked off for today."));
          rerender();
        } }, `▶ ${h.timerMin} min`);
      }
    }

    return el("div", { class: "row", style: onToday || doneToday ? "" : "opacity:.72" },
      el("button", {
        class: "hb-check" + (doneToday ? " on" : "") + (multi && n && !doneToday ? " part" : ""), "aria-pressed": String(doneToday),
        style: multi ? `--p:${(n / h.target) * 100}%` : null,
        "aria-label": multi
          ? `${h.name}: ${n} of ${h.target} today. ${doneToday ? "Tap to take one off" : "Tap to add one"}`
          : `${h.name}: ${doneToday ? "done today, tap to undo" : "tap when done"}`,
        onclick: () => { tap(h.id, t, doneToday ? -1 : 1); rerender(); },
      }, doneToday ? "✓" : multi ? String(n) : ""),
      el("a", { class: "main", href: `#/home/habit/${h.id}` },
        el("span", { class: "title", style: doneToday ? "color:var(--muted)" : "", text: h.name }),
        el("span", { class: "meta", text: meta }),
        dots),
      timerEl);
  }

  function breakRow(h) {
    const ws = weekStart(t);
    const todayN = countIn(h, t, t), week = countIn(h, ws, t), last = countIn(h, addDays(ws, -7), addDays(ws, -1));
    const undo = justLogged?.habitId === h.id && justLogged.until > Date.now() ? justLogged : null;
    const meta = undo ? `Logged at ${timeOf(getEntry(h, undo.entryId)?.at || nowStamp())}`
      : `Today ${todayN} · this week ${week} · last week ${last}`;
    return el("div", { class: "row" },
      el("a", { class: "main", href: `#/home/habit/${h.id}` },
        el("span", { class: "title", text: h.name }),
        el("span", { class: "meta", text: meta })),
      undo ? el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: () => { patchEntry(h.id, undo.entryId, null); justLogged = null; rerender(); } }, "Undo") : null,
      el("button", { class: "btn small hb-log", "aria-label": `Log a time: ${h.name}`, onclick: () => {
        const e = logOnce(h.id);
        justLogged = { habitId: h.id, entryId: e.id, until: Date.now() + 6000 };
        rerender();
        setTimeout(() => { if (justLogged?.entryId === e.id) { justLogged = null; rerender(); } }, 6100);
      } }, "+ Log"));
  }
  const getEntry = (h, id) => getHabit(h.id)?.log.find(e => e.id === id);

  draw();
  return sec;
}

// Keeps running timers counting down on screen. Returns a stop function.
export function tickTimers(root, onFinish) {
  const id = setInterval(() => {
    let finished = false;
    root.querySelectorAll(".hb-timer.running").forEach(b => {
      const left = new Date(b.dataset.ends) - Date.now();
      if (left <= 0) finished = true; else b.textContent = mmss(left);
    });
    if (finished) onFinish();
  }, 1000);
  return () => clearInterval(id);
}

// ---------- planning the week (#/home/plan) ----------
export function planTitle() { return planWeek() > today() ? "Plan next week" : "Plan this week"; }

export function renderPlanPage(root, navigate) {
  const ws = planWeek();
  const redraw = () => { const y = window.scrollY; root.replaceChildren(); renderPlanPage(root, navigate); window.scrollTo(0, y); };
  const habits = doHabits();
  if (!habits.length) {
    root.append(el("p", { class: "muted", text: "No habits to plan yet. Add one on Home." }));
    return;
  }
  const prev = addDays(ws, -7);
  const canCopy = habits.some(h => daysFor(h, prev));
  const dates = weekDates(ws);

  root.append(...[
    el("p", { class: "small muted", text: `${shortDate(ws)} to ${shortDate(addDays(ws, 6))}. Tap the days you'll do each one. The plan opens again next Sunday at ${resetTime()}.` }),
    canCopy ? el("div", { class: "tools" }, el("button", { class: "btn small", onclick: () => {
      habits.forEach(h => { const d = daysFor(h, prev); if (d && !h.plans[ws]) setPlan(h.id, ws, d); });
      redraw();
    } }, "Same as last week")) : null,
    el("div", { class: "rows" }, habits.map(h => {
      const days = daysFor(h, ws) || [];
      return el("div", { class: "row", style: "flex-direction:column;align-items:stretch;gap:10px" },
        el("div", { class: "rowhead" },
          el("a", { class: "title", href: `#/home/habit/${h.id}`, style: "color:inherit;text-decoration:none", text: h.name }),
          el("span", { class: "mono muted", text: days.length ? `${days.length} day${days.length === 1 ? "" : "s"}` : "not planned" })),
        el("div", { class: "hb-days" }, WEEKDAYS.map(([n, label], i) => el("button", {
          type: "button", class: "chip", "aria-pressed": String(days.includes(n)), "aria-label": `${DAY_NAMES[n]} ${shortDate(dates[i])}`,
          onclick: () => { setPlan(h.id, ws, days.includes(n) ? days.filter(x => x !== n) : [...days, n]); redraw(); },
        }, el("span", { text: label }), el("small", { text: parseDate(dates[i]).getDate() })))));
    })),
    el("div", { class: "actions" }, el("button", { class: "btn primary", onclick: () => {
      habits.forEach(h => { if (!daysFor(h, ws)) setPlan(h.id, ws, []); }); // a habit left blank is planned as a week off
      navigate("home");
    } }, "Done"))].filter(Boolean));
}

// ---------- one habit's page ----------
export function renderHabitPage(root, id, navigate) {
  const h = getHabit(id);
  if (!h) { root.append(el("p", { class: "muted", text: "That habit isn't on this phone." })); return; }
  const redraw = () => { const y = window.scrollY; root.replaceChildren(); renderHabitPage(root, id, navigate); window.scrollTo(0, y); };
  const save = patch => { patchHabit(id, patch); redraw(); };

  const name = el("input", { type: "text", id: "hb-name", value: h.name, maxlength: 40, autocomplete: "off" });
  name.addEventListener("change", () => { if (name.value.trim()) { patchHabit(id, { name: name.value.trim() }); navigate(`home/habit/${id}`); } });

  const del = el("div", { class: "tools" });
  const ask = () => del.replaceChildren(
    el("span", { class: "small", text: `Remove “${h.name}” and its history?` }),
    el("button", { class: "btn small danger", onclick: () => { reminders.cancelTimer(id); saveHabits(loadHabits().filter(x => x.id !== id)); navigate("home"); } }, "Remove"),
    el("button", { class: "btn small", onclick: idle }, "Keep"));
  const idle = () => del.replaceChildren(el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Remove habit"));
  idle();

  if (h.kind === "break") { renderBreakPage(root, h, name, redraw); root.append(del); return; }

  // Days for the week being planned
  const ws = planWeek();
  const days = daysFor(h, ws) || [];
  const dayChips = el("div", { class: "hb-days" }, WEEKDAYS.map(([n, label], i) => el("button", {
    type: "button", class: "chip", "aria-pressed": String(days.includes(n)),
    onclick: () => { setPlan(id, ws, days.includes(n) ? days.filter(x => x !== n) : [...days, n]); redraw(); },
  }, el("span", { text: label }), el("small", { text: parseDate(addDays(ws, i)).getDate() }))));
  const fixed = el("label", { class: "small", style: "display:flex;gap:8px;align-items:center" },
    el("input", { type: "checkbox", checked: h.fixed, onchange: e => save({ fixed: e.target.checked }) }),
    "Same days every week, so there's nothing to plan");

  // Reminders
  const remRows = h.reminders.length
    ? el("div", { class: "rows" }, h.reminders.slice().sort((a, b) => a.time.localeCompare(b.time)).map(r => el("div", { class: "row" },
        el("div", { class: "main" }, timePick(r.time, { value: r.time, className: "datelink", ariaLabel: `Change the ${r.time} reminder` },
          v => save({ reminders: h.reminders.map(x => x.id === r.id ? { ...x, time: v } : x) }))),
        el("span", { class: "meta", text: "on planned days" }),
        el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: () => save({ reminders: h.reminders.filter(x => x.id !== r.id) }) }, "Remove"))))
    : null;
  const addReminder = timePick("Add a reminder time", { ariaLabel: "Add a reminder time" }, v => {
    reminders.askPermission();
    save({ reminders: [...h.reminders, { id: newId(), time: v }] });
  });

  // Timer
  const timerChips = el("div", { class: "chips" }, TIMERS.map(([v, l]) => el("button", {
    type: "button", class: "chip", "aria-pressed": String((h.timerMin || null) === v), onclick: () => save({ timerMin: v }),
  }, l)));

  // Times a day
  const stepper = (value, label, set, min, max) => el("div", { class: "hb-stepper", role: "group", "aria-label": label },
    el("button", { type: "button", class: "btn small", disabled: value <= min, "aria-label": `${label}: one fewer`, onclick: () => set(value - 1) }, "−"),
    el("span", { class: "mono", text: String(value) }),
    el("button", { type: "button", class: "btn small", disabled: value >= max, "aria-label": `${label}: one more`, onclick: () => set(value + 1) }, "+"));
  const setTarget = v => {
    // Days already done stay done; today's count is kept within the new target.
    const counts = {};
    for (const [d, n] of Object.entries(h.counts)) if (v > 1) counts[d] = Math.min(n, v);
    save({ target: v, counts });
  };
  const n = countOn(h, today());
  const spread = () => {
    const from = 9 * 60, to = 21 * 60, k = h.target;
    const times = Array.from({ length: k }, (_, i) => { const m = Math.round(from + (to - from) * (k === 1 ? 0 : i / (k - 1))); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; });
    reminders.askPermission();
    save({ reminders: times.map(time => ({ id: newId(), time })) });
  };

  root.append(
    el("section", { class: "card", style: "--fc:var(--m-habits)" },
      el("label", { class: "field" }, el("span", { text: "Habit" }), name),
      el("div", { class: "field" },
        el("span", { class: "field-label", text: `Days ${weekName(ws)}` }),
        dayChips, fixed),
      el("div", { class: "rowhead", style: "align-items:center" },
        el("div", {},
          el("span", { class: "field-label", text: "Times a day" }),
          el("p", { class: "small muted", text: h.target > 1 ? `Done for the day after ${h.target} goes.` : "Once is enough for most habits." })),
        stepper(h.target, "Times a day", setTarget, 1, 20)),
      h.target > 1 ? el("div", { class: "rowhead", style: "align-items:center" },
        el("span", { class: "field-label", text: `Today: ${n} of ${h.target}` }),
        stepper(n, "Today", v => { tap(id, today(), v - n); redraw(); }, 0, h.target)) : null),
    historyCard(h, redraw),
    el("section", { class: "card" },
      el("h2", { style: "font-size:19px;font-weight:500", text: "Reminders" }),
      el("p", { class: "small muted", text: reminders.canNotify()
        ? "Your phone will remind you at these times on the days you've planned."
        : "Reminders work in the Android app." }),
      remRows,
      el("div", { class: "tools" }, addReminder,
        h.target > 1 ? el("button", { class: "btn", onclick: spread }, `Spread ${h.target} through the day`) : null),
      h.target > 1 ? el("p", { class: "small muted", text: `Spreading sets ${h.target} reminders between 9:00 and 21:00. Once you've done all ${h.target}, the rest of the day's reminders stop.` }) : null),
    el("section", { class: "card" },
      el("h2", { style: "font-size:19px;font-weight:500", text: "Timer" }),
      el("p", { class: "small muted", text: h.target > 1 ? "With a timer, a ▶ button appears next to the habit. Each time it runs out you'll get a notification, and it counts as one go." : "With a timer, a ▶ button appears next to the habit. When the time is up you'll get a notification, and the habit is ticked off." }),
      timerChips),
    del);
}

// The last 8 weeks of a "do" habit: one line of days per week.
function historyCard(h, redraw) {
  const thisWs = weekStart(today());
  const first = weekStart(isoDate(new Date(h.createdAt)));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWs, -7 * i)).filter(w => w >= first);
  return el("section", { class: "card" },
    el("div", { class: "rowhead" },
      el("h2", { style: "font-size:19px;font-weight:500", text: "History" }),
      el("span", { class: "mono muted", text: `${h.done.length} time${h.done.length === 1 ? "" : "s"} in all` })),
    el("div", { class: "hb-history" }, weeks.map(w => {
      const s = weekSummary(h, w);
      return el("div", { class: "hb-week" },
        el("span", { class: "mono muted", text: shortDate(w) }),
        el("span", { class: "hb-cells" }, s.dates.map(d => {
          const hit = h.done.includes(d), cls = hit ? "hit" : isOn(h, d) ? "on" : "";
          if (d > today()) return el("i", { class: cls });
          const label = `${DAY_NAMES[parseDate(d).getDay()]} ${shortDate(d)}`;
          return el("button", { type: "button", class: cls, "aria-pressed": String(hit), "aria-label": `${label}: ${hit ? "done, tap to undo" : "tap to mark done"}`,
            onclick: () => { tap(h.id, d, hit ? -h.target : h.target); redraw(); } });
        })),
        el("span", { class: "mono", text: s.planned ? `${s.done}/${s.planned}` : `${s.done}` }));
    })),
    el("p", { class: "small muted", text: "Filled: done. Ringed: planned but not done. Tap a day to tick it off, or tap again to undo." }));
}

// ---------- a habit to do less of ----------
function renderBreakPage(root, h, name, redraw) {
  const t = today(), ws = weekStart(t);
  const since = addDays(t, -27);
  const recent = h.log.filter(e => e.at.slice(0, 10) >= since);

  // When it happens, over the last four weeks
  const parts = PARTS.map(([label, from, to]) => [label, recent.filter(e => { let hr = +e.at.slice(11, 13); if (hr < 5) hr += 24; return hr >= from && hr < to; }).length]);
  const byDay = WEEKDAYS.map(([n, label]) => [label, recent.filter(e => parseDate(e.at.slice(0, 10)).getDay() === n).length]);
  const bars = (rows, color) => {
    const max = Math.max(1, ...rows.map(r => r[1]));
    return el("div", { class: "hb-bars" }, rows.map(([label, n]) => el("div", { class: "hb-bar" },
      el("span", { class: "small", text: label }),
      el("div", { class: "meter", style: `--mc:${color}` }, el("i", { style: `left:0;width:${(n / max) * 100}%` })),
      el("span", { class: "mono", text: n }))));
  };
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i))).filter(w => w >= weekStart(isoDate(new Date(h.createdAt))));
  const weekRows = weeks.map(w => [shortDate(w), countIn(h, w, addDays(w, 6))]);

  const logNow = el("button", { class: "btn primary", onclick: () => { logOnce(h.id); redraw(); } }, "Log one now");
  const earlier = timePick("Earlier today…", { ariaLabel: "Log a time earlier today" }, v => { logOnce(h.id, `${t}T${v}`); redraw(); });

  // Recent entries, newest first, grouped by day
  const lastTwoWeeks = h.log.filter(e => e.at.slice(0, 10) >= addDays(t, -13)).slice().reverse();
  const groups = [];
  for (const e of lastTwoWeeks) {
    const d = e.at.slice(0, 10);
    if (!groups.length || groups[groups.length - 1][0] !== d) groups.push([d, []]);
    groups[groups.length - 1][1].push(e);
  }
  const entryRow = e => {
    const note = el("input", { type: "text", value: e.note || "", placeholder: "What was going on?", maxlength: 80, autocomplete: "off", "aria-label": `Note for ${timeOf(e.at)}` });
    note.addEventListener("change", () => patchEntry(h.id, e.id, { note: note.value.trim() }));
    return el("div", { class: "row", style: "gap:10px" },
      timePick(timeOf(e.at), { value: timeOf(e.at), className: "datelink mono", ariaLabel: `Change the time ${timeOf(e.at)}` }, v => { patchEntry(h.id, e.id, { at: `${e.at.slice(0, 10)}T${v}` }); redraw(); }),
      el("div", { class: "main" }, note),
      el("button", { class: "linkbtn", style: "color:var(--muted)", "aria-label": `Remove the entry at ${timeOf(e.at)}`, onclick: () => { patchEntry(h.id, e.id, null); redraw(); } }, "✕"));
  };
  const dayLabel = d => d === t ? "Today" : d === addDays(t, -1) ? "Yesterday" : `${DAY_NAMES[parseDate(d).getDay()]} ${shortDate(d)}`;

  const thisWeek = countIn(h, ws, t), lastWeek = countIn(h, addDays(ws, -7), addDays(ws, -1));
  root.append(...[
    el("section", { class: "card", style: "--fc:var(--q-drop)" },
      el("label", { class: "field" }, el("span", { text: "Doing less of" }), name),
      el("p", { class: "mono muted", text: `Today ${countIn(h, t, t)} · this week ${thisWeek} · last week ${lastWeek}` }),
      el("div", { class: "tools" }, logNow, earlier),
      el("p", { class: "small muted", text: "Log it each time, without judging it. A note on what was going on helps you spot what sets it off." })),
    recent.length >= 3 ? el("section", { class: "card" },
      el("div", { class: "rowhead" }, el("h2", { style: "font-size:19px;font-weight:500", text: "When it happens" }), el("span", { class: "mono muted", text: "last 4 weeks" })),
      bars(parts, "var(--q-drop)"),
      bars(byDay, "var(--q-drop)")) : null,
    weekRows.length > 1 ? el("section", { class: "card" },
      el("h2", { style: "font-size:19px;font-weight:500", text: "Week by week" }),
      bars(weekRows, "var(--muted)")) : null,
    el("section", { class: "section" },
      el("h2", { text: "Recent" }),
      groups.length
        ? groups.map(([d, list]) => el("div", { class: "section", style: "gap:6px" },
            el("span", { class: "mono muted", text: `${dayLabel(d)} · ${list.length}` }),
            el("div", { class: "rows" }, list.map(entryRow))))
        : el("p", { class: "small muted", text: "Nothing logged in the last two weeks." }))].filter(Boolean));
}
