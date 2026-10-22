// Home: the one calm page. Habits for today, this week's priorities,
// the weekly review, who to reach out to, and decisions waiting on you.
// It owns the habits list; everything else it reads from the other modules.
//
// Data (store key "habits"):
//   { habits: [ { id, name, createdAt, done: ["YYYY-MM-DD", ...] } ] }

import * as store from "../store.js";
import * as backup from "../backup.js";
import { el, isoDate, addDays, parseDate, formatDate } from "../ui.js";
import review from "./weekly-review.js";
import decisions from "./decisions.js";
import people from "./people.js";
import energy from "./energy.js";

const ID = "home";
const KEY = "habits";
const SUGGESTED = ["Move for 20 minutes", "Read", "Get outside", "Phone out of the bedroom"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const today = () => isoDate(new Date());
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function loadHabits() { const d = store.load(KEY, { habits: [] }); return Array.isArray(d.habits) ? d.habits : []; }
function saveHabits(habits) { return store.save(KEY, { habits }); }

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default {
  id: ID,
  name: "Home",
  backupName: "Habits",
  tab: "Home",
  icon: "home",
  color: "var(--accent)",

  title() { return greeting(); },
  subtitle() { const d = new Date(); return `${DAYS[d.getDay()]} ${d.getDate()} ${LONG_MONTHS[d.getMonth()]}`; },
  hasData() { return loadHabits().length > 0; },

  exportData() { return { habits: loadHabits() }; },
  importData(data) {
    if (!Array.isArray(data?.habits)) return null;
    const mine = loadHabits();
    let added = 0, kept = 0;
    for (const h of data.habits) {
      if (!h?.id || !h.name) continue;
      const m = mine.find(x => x.id === h.id);
      if (!m) { mine.push({ id: h.id, name: h.name, createdAt: h.createdAt || new Date().toISOString(), done: (h.done || []).slice() }); added++; continue; }
      const merged = [...new Set([...(m.done || []), ...(h.done || [])])].sort();
      if (merged.length !== (m.done || []).length) { m.done = merged; added++; } else kept++;
    }
    if (added && !saveHabits(mine)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["habit", "habits"] };
  },

  mount(root, { navigate, refreshChrome }) {
    let editing = false;

    function render() {
      root.replaceChildren();
      const sections = [sundayNudge(), habitsSection(), energySection(), prioritiesSection(), peopleSection(), decisionsSection(), backupNudge()];
      sections.forEach(s => s && root.append(s));
    }

    // ----- weekly review nudge (Sundays, and Mondays if it was missed) -----
    function sundayNudge() {
      const dow = new Date().getDay();
      const sun = review.thisSunday();
      const done = review.latest()?.week === sun;
      if (done || (dow !== 0 && dow !== 1)) return null;
      return el("a", { class: "card", href: "#/weekly-review", style: "text-decoration:none;color:inherit;border-color:var(--m-review);gap:6px" },
        el("span", { class: "mono", style: "color:var(--m-review)", text: dow === 0 ? "IT'S SUNDAY" : "STILL TIME" }),
        el("h2", { style: "font-size:21px", text: "Your weekly review" }),
        el("p", { class: "small muted", text: "Five questions, about ten minutes." }));
    }

    // ----- habits -----
    function habitsSection() {
      const habits = loadHabits();
      const t = today();
      const sec = el("section", { class: "section" });
      sec.append(el("div", { class: "rowhead" },
        el("h2", { text: "Today's habits" }),
        habits.length || editing ? el("button", { class: "linkbtn", onclick: () => { editing = !editing; render(); } }, editing ? "Done" : "Edit") : null));

      if (!habits.length && !editing) {
        sec.append(el("div", { class: "card", style: "gap:10px" },
          el("p", { class: "small", text: "A few small things you'd like to do most days. Tap to tick them off. Pick one to start, or write your own." }),
          el("div", { class: "chips" }, SUGGESTED.map(name => el("button", { class: "chip", onclick: () => { addHabit(name); render(); } }, "+ " + name))),
          el("button", { class: "linkbtn", style: "align-self:flex-start", onclick: () => { editing = true; render(); } }, "Write your own")));
        return sec;
      }

      const rows = el("div", { class: "rows" });
      habits.forEach(h => {
        const doneToday = (h.done || []).includes(t);
        const last7 = el("div", { "aria-hidden": "true", style: "display:flex;gap:3px" });
        for (let i = 6; i >= 0; i--) {
          const d = addDays(t, -i);
          last7.append(el("i", { style: `width:7px;height:7px;border-radius:50%;background:${(h.done || []).includes(d) ? "var(--m-habits)" : "var(--line)"}` }));
        }
        const count7 = (h.done || []).filter(d => d > addDays(t, -7)).length;
        if (editing) {
          rows.append(el("div", { class: "row" },
            el("div", { class: "main" }, el("span", { class: "title", text: h.name })),
            el("button", { class: "linkbtn", style: "color:var(--q-drop)", onclick: () => { saveHabits(loadHabits().filter(x => x.id !== h.id)); render(); } }, "Remove")));
        } else {
          rows.append(el("button", {
            class: "row", style: "width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left",
            "aria-pressed": String(doneToday), "aria-label": `${h.name}, ${doneToday ? "done today" : "not done yet"}`,
            onclick: () => {
              const all = loadHabits(), x = all.find(y => y.id === h.id);
              x.done = doneToday ? x.done.filter(d => d !== t) : [...(x.done || []), t].sort();
              saveHabits(all); render();
            },
          },
            el("span", { style: `width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;border:2px solid var(--m-habits);${doneToday ? "background:var(--m-habits);color:var(--paper)" : ""}`, text: doneToday ? "✓" : "" }),
            el("div", { class: "main" },
              el("span", { class: "title", style: doneToday ? "color:var(--muted)" : "", text: h.name }),
              el("span", { class: "meta", text: `${count7} of the last 7 days` })),
            last7));
        }
      });
      if (habits.length) sec.append(rows);
      if (editing) {
        const input = el("input", { type: "text", id: "habit-new", placeholder: "A small daily habit", maxlength: 40, autocomplete: "off", style: "flex:1;min-width:0" });
        const add = () => { if (input.value.trim()) { addHabit(input.value.trim()); render(); document.getElementById("habit-new")?.focus(); } };
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
        sec.append(el("div", { class: "tools", style: "flex-wrap:nowrap" }, input, el("button", { class: "btn", onclick: add }, "Add")));
        if (habits.length >= 5) sec.append(el("p", { class: "small muted", text: "Fewer habits are easier to keep. Three to five is plenty." }));
      }
      return sec;
    }
    function addHabit(name) {
      const habits = loadHabits();
      habits.push({ id: newId(), name, createdAt: new Date().toISOString(), done: [] });
      saveHabits(habits);
    }

    // ----- priorities from the latest review -----
    function prioritiesSection() {
      const r = review.latest();
      if (!r || !(r.answers?.matters?.trim() || r.answers?.drop?.trim())) return null;
      const stale = parseDate(r.week) < parseDate(addDays(review.thisSunday(), -7));
      return el("section", { class: "section" },
        el("div", { class: "rowhead" },
          el("h2", { text: "This week's priorities" }),
          el("span", { class: "mono muted", text: stale ? `from week of ${review.weekLabel(r.week)}` : "from Sunday's review" })),
        el("div", { class: "card", style: "gap:12px" },
          r.answers.matters?.trim() ? el("div", { class: "wr-ans", style: "--qc:var(--q-matters)" },
            el("div", {}, el("div", { class: "k", text: "What matters" }), el("div", { class: "v", text: r.answers.matters.trim() }))) : null,
          r.answers.drop?.trim() ? el("div", { class: "wr-ans", style: "--qc:var(--q-drop)" },
            el("div", {}, el("div", { class: "k", text: "Dropping" }), el("div", { class: "v", text: r.answers.drop.trim() }))) : null));
    }

    // ----- who to reach out to -----
    function peopleSection() {
      const due = people.due().slice(0, 3);
      if (!due.length) return null;
      const rows = el("div", { class: "rows" });
      due.forEach(p => {
        const right = el("div", { class: "tools" });
        right.append(el("button", { class: "btn small", onclick: () => {
          people.logToday(p.id);
          right.replaceChildren(el("span", { class: "pill", style: "--pc:var(--q-well)", text: "Logged" }));
        } }, "Talked today"));
        rows.append(el("div", { class: "row" },
          el("a", { class: "main", href: `#/people/${p.id}` }, el("span", { class: "title", text: p.name }), el("span", { class: "meta", text: people.sinceText(p) })),
          right));
      });
      return el("section", { class: "section" },
        el("div", { class: "rowhead" }, el("h2", { text: "Reach out to" }), el("a", { class: "linkbtn", href: "#/people" }, "All people")),
        rows);
    }

    // ----- decisions due -----
    function decisionsSection() {
      const due = decisions.due();
      if (!due.length) return null;
      return el("section", { class: "section" },
        el("h2", { text: "Decisions to look back on" }),
        el("div", { class: "rows" }, due.slice(0, 3).map(d => el("a", { class: "row", href: `#/decisions/${d.id}` },
          el("div", { class: "main" }, el("span", { class: "title", text: d.title }), el("span", { class: "meta", text: `Decided ${formatDate(d.decidedOn)}` })),
          el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: "Look back" })))));
    }

    // ----- energy -----
    function energySection() {
      const todays = energy.todayEntries();
      const last = todays[0];
      return el("a", { class: "card", href: "#/energy", style: "text-decoration:none;color:inherit;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px" },
        el("div", { style: "display:flex;flex-direction:column;gap:2px;min-width:0" },
          el("span", { style: "font-family:var(--font-display);font-size:17px", text: "How are you feeling?" }),
          el("span", { class: "small muted", text: last ? `Checked in ${todays.length}× today, last at ${energy.timeOf(last)}` : "No check-in yet today" })),
        el("span", { class: "btn small", style: "flex:none", text: "Check in" }));
    }

    // ----- backup reminder -----
    function backupNudge() {
      if (!backup.hasAnyData()) return null;
      const since = backup.daysSinceBackup();
      if (since != null && since < 30) return null;
      return el("div", { class: "notice" },
        el("span", { text: since == null ? "Everything lives on this phone. Save a backup so it's safe." : `Your last backup was ${since} days ago.` }),
        el("a", { class: "btn small", href: "#/settings" }, "Back up"));
    }

    render();
    const offs = ["habits", "weekly-review", "people", "decisions", "energy"].map(k => store.onChange(k, render));
    const tick = () => { if (document.visibilityState === "visible") { render(); refreshChrome(); } };
    document.addEventListener("visibilitychange", tick);
    return {
      setView() { render(); },
      unmount() { offs.forEach(f => f()); document.removeEventListener("visibilitychange", tick); },
    };
  },
};
