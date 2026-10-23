// Habits, shown on Home. Each habit can run on chosen days of the week,
// remind you at set times, and have a timer that ticks it off when it ends.
//
// Data (store key "habits"):
//   { habits: [ { id, name, createdAt, done: ["YYYY-MM-DD", ...],
//                 days: [0–6] (Date.getDay(), 0 = Sunday; missing = every day),
//                 reminders: [ { id, time: "HH:MM" } ],
//                 timerMin: number | null, timerEndsAt: ISO datetime | null } ] }

import * as store from "./store.js";
import * as reminders from "./reminders.js";
import { el, isoDate, addDays, parseDate, timePick, WEEKDAYS, weekStart } from "./ui.js";

const KEY = "habits";
const ALL = [0, 1, 2, 3, 4, 5, 6];
const SUGGESTED = ["Move for 20 minutes", "Read", "Get outside", "Phone out of the bedroom"];
const TIMERS = [[null, "No timer"], [5, "5 min"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const today = () => isoDate(new Date());
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const daysOf = h => (h.days?.length ? h.days : ALL);
const isOn = (h, iso) => daysOf(h).includes(parseDate(iso).getDay());

export function loadHabits() {
  const d = store.load(KEY, { habits: [] });
  return (Array.isArray(d.habits) ? d.habits : []).map(h => ({ reminders: [], days: ALL, timerMin: null, timerEndsAt: null, done: [], ...h }));
}
export function saveHabits(habits) { return store.save(KEY, { habits }); }
export function getHabit(id) { return loadHabits().find(h => h.id === id) || null; }
function patchHabit(id, patch) {
  const habits = loadHabits().map(h => h.id === id ? { ...h, ...patch } : h);
  return saveHabits(habits);
}
export function addHabit(name) {
  const habits = loadHabits();
  habits.push({ id: newId(), name, createdAt: new Date().toISOString(), done: [], days: ALL, reminders: [], timerMin: null, timerEndsAt: null });
  saveHabits(habits);
}

function setDone(id, iso, on) {
  const h = getHabit(id); if (!h) return;
  const done = new Set(h.done);
  on ? done.add(iso) : done.delete(iso);
  patchHabit(id, { done: [...done].sort() });
}

// A finished timer ticks the habit off for the day it ended.
export function settleTimers() {
  const now = Date.now();
  for (const h of loadHabits()) {
    if (h.timerEndsAt && new Date(h.timerEndsAt).getTime() <= now) {
      const d = isoDate(new Date(h.timerEndsAt));
      patchHabit(h.id, { timerEndsAt: null, done: [...new Set([...h.done, d])].sort() });
    }
  }
}

function weekSummary(h) {
  const start = weekStart(today());
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const planned = dates.filter(d => isOn(h, d)).length;
  const done = dates.filter(d => h.done.includes(d)).length;
  return { dates, planned, done };
}
function nextOn(h) {
  for (let i = 1; i <= 7; i++) { const d = addDays(today(), i); if (isOn(h, d)) return i === 1 ? "tomorrow" : DAY_NAMES[parseDate(d).getDay()]; }
  return "";
}
function daysText(h) {
  const d = daysOf(h);
  if (d.length === 7) return "Every day";
  if (d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x))) return "Weekdays";
  if (d.length === 2 && d.includes(0) && d.includes(6)) return "Weekends";
  return WEEKDAYS.filter(([n]) => d.includes(n)).map(([, l]) => l).join(", ");
}
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// ---------- the section on Home ----------
export function habitsSection(rerender) {
  settleTimers();
  const habits = loadHabits();
  const t = today();
  let adding = false;
  const sec = el("section", { class: "section" });

  const draw = () => {
    sec.replaceChildren();
    sec.append(el("div", { class: "rowhead" },
      el("h2", { text: "Today's habits" }),
      habits.length ? el("button", { class: "linkbtn", onclick: () => { adding = !adding; draw(); if (adding) sec.querySelector("#habit-new")?.focus(); } }, adding ? "Done" : "Add") : null));

    if (!habits.length) {
      sec.append(el("div", { class: "card", style: "gap:10px" },
        el("p", { class: "small", text: "A few small things you'd like to do. Tick them off here. Tap a habit's name to pick its days, add a reminder or a timer." }),
        el("div", { class: "chips" }, SUGGESTED.map(name => el("button", { class: "chip", onclick: () => { addHabit(name); rerender(); } }, "+ " + name))),
        addRow()));
      return;
    }

    const todays = habits.filter(h => isOn(h, t)), others = habits.filter(h => !isOn(h, t));
    const rows = el("div", { class: "rows" });
    [...todays, ...others].forEach(h => rows.append(habitRow(h, isOn(h, t))));
    sec.append(rows);
    if (adding) sec.append(addRow());
  };

  function addRow() {
    const input = el("input", { type: "text", id: "habit-new", placeholder: "A small habit", maxlength: 40, autocomplete: "off", style: "flex:1;min-width:0" });
    const add = () => { if (input.value.trim()) { addHabit(input.value.trim()); rerender(); setTimeout(() => document.getElementById("habit-new")?.focus(), 0); } };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    return el("div", { class: "tools", style: "flex-wrap:nowrap" }, input, el("button", { class: "btn", onclick: add }, "Add"));
  }

  function habitRow(h, onToday) {
    const doneToday = h.done.includes(t);
    const { dates, planned, done } = weekSummary(h);
    const dots = el("span", { "aria-hidden": "true", style: "display:inline-flex;gap:4px;align-items:center" },
      dates.map(d => {
        const on = isOn(h, d), hit = h.done.includes(d);
        const size = on ? 8 : 4;
        return el("i", { style: `width:${size}px;height:${size}px;border-radius:50%;${hit ? "background:var(--m-habits)" : on ? "border:1.5px solid var(--m-habits);opacity:.55" : "background:var(--line)"}${d === t ? ";outline:1.5px solid var(--muted);outline-offset:1.5px" : ""}` });
      }));
    const meta = onToday
      ? `${done} of ${planned} this week${h.reminders.length ? " · " + h.reminders.map(r => r.time).join(", ") : ""}`
      : `Not today · next ${nextOn(h)}`;

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
          reminders.startTimer(h.id, h.timerMin * 60, h.name, `${h.timerMin} minutes done. Ticked off for today.`);
          rerender();
        } }, `▶ ${h.timerMin} min`);
      }
    }

    return el("div", { class: "row", style: onToday ? "" : "opacity:.72" },
      el("button", {
        class: "hb-check" + (doneToday ? " on" : ""), "aria-pressed": String(doneToday),
        "aria-label": `${h.name}: ${doneToday ? "done today, tap to undo" : "tap when done"}`,
        onclick: () => { setDone(h.id, t, !doneToday); rerender(); },
      }, doneToday ? "✓" : ""),
      el("a", { class: "main", href: `#/home/habit/${h.id}` },
        el("span", { class: "title", style: doneToday ? "color:var(--muted)" : "", text: h.name }),
        el("span", { class: "meta", text: meta }),
        dots),
      timerEl);
  }

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

// ---------- one habit's settings ----------
export function renderHabitPage(root, id, navigate) {
  const h = getHabit(id);
  if (!h) { root.append(el("p", { class: "muted", text: "That habit isn't on this phone." })); return; }
  const redraw = () => { const y = window.scrollY; root.replaceChildren(); renderHabitPage(root, id, navigate); window.scrollTo(0, y); };
  const save = patch => { patchHabit(id, patch); redraw(); };

  const name = el("input", { type: "text", id: "hb-name", value: h.name, maxlength: 40, autocomplete: "off" });
  name.addEventListener("change", () => { if (name.value.trim()) { patchHabit(id, { name: name.value.trim() }); navigate(`home/habit/${id}`); } });

  // Days
  const days = daysOf(h);
  const dayChips = el("div", { class: "chips" }, WEEKDAYS.map(([n, label]) => el("button", {
    type: "button", class: "chip", "aria-pressed": String(days.includes(n)),
    onclick: () => { const next = days.includes(n) ? days.filter(x => x !== n) : [...days, n]; if (next.length) save({ days: next.sort() }); },
  }, label)));
  const presets = el("div", { class: "tools" },
    [["Every day", ALL], ["Weekdays", [1, 2, 3, 4, 5]], ["Weekends", [0, 6]]].map(([l, v]) =>
      el("button", { type: "button", class: "linkbtn", onclick: () => save({ days: v }) }, l)));

  // Reminders
  const remRows = h.reminders.length
    ? el("div", { class: "rows" }, h.reminders.slice().sort((a, b) => a.time.localeCompare(b.time)).map(r => el("div", { class: "row" },
        el("div", { class: "main" }, timePick(r.time, { value: r.time, className: "datelink", ariaLabel: `Change the ${r.time} reminder` },
          v => save({ reminders: h.reminders.map(x => x.id === r.id ? { ...x, time: v } : x) }))),
        el("span", { class: "meta", text: daysText(h) }),
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

  const del = el("div", { class: "tools" });
  const ask = () => del.replaceChildren(
    el("span", { class: "small", text: `Remove “${h.name}” and its history?` }),
    el("button", { class: "btn small danger", onclick: () => { reminders.cancelTimer(id); saveHabits(loadHabits().filter(x => x.id !== id)); navigate("home"); } }, "Remove"),
    el("button", { class: "btn small", onclick: idle }, "Keep"));
  const idle = () => del.replaceChildren(el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Remove habit"));
  idle();

  const { planned, done } = weekSummary(h);
  root.append(
    el("section", { class: "card", style: "--fc:var(--m-habits)" },
      el("label", { class: "field" }, el("span", { text: "Habit" }), name),
      el("div", { class: "field" }, el("span", { class: "field-label", text: "Which days?" }), dayChips, presets),
      el("p", { class: "mono muted", text: `${done} of ${planned} this week · ${h.done.length} times in all` })),
    el("section", { class: "card" },
      el("h2", { style: "font-size:19px;font-weight:500", text: "Reminders" }),
      el("p", { class: "small muted", text: reminders.canNotify()
        ? `Your phone will remind you at these times, ${daysText(h).toLowerCase() === "every day" ? "every day" : "on " + daysText(h)}.`
        : "Reminders work in the Android app." }),
      remRows,
      el("div", { class: "tools" }, addReminder)),
    el("section", { class: "card" },
      el("h2", { style: "font-size:19px;font-weight:500", text: "Timer" }),
      el("p", { class: "small muted", text: "With a timer, a ▶ button appears next to the habit. When the time is up you'll get a notification, and the habit is ticked off." }),
      timerChips),
    del);
}
