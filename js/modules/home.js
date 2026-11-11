// Home: the one calm page. Habits for today, tasks, goals, this week's priorities,
// the weekly review, who to reach out to, and decisions waiting on you.
// Each section folds away by tapping its heading (remembered in meta "homeClosed").
// It owns the habits list; everything else it reads from the other modules.
//
// Habit data and the habit settings page live in js/habits.js.

import * as store from "../store.js";
import * as backup from "../backup.js";
import { el, addDays, parseDate, formatDate, foldHead } from "../ui.js";
import { loadHabits, saveHabits, mergeHabits, habitsSection, renderHabitPage, renderPlanPage, renderWeekPage, planTitle, tickTimers, getHabit } from "../habits.js";
import review from "./weekly-review.js";
import decisions from "./decisions.js";
import people from "./people.js";
import mind from "./mind.js";
import goals from "./goals.js";

const ID = "home";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


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

  title(view) { return view === "plan" ? planTitle() : view === "week" ? "This week" : view.startsWith("habit/") ? (getHabit(view.slice(6))?.name || "Habit") : greeting(); },
  backTo(view) { return view ? "home" : null; },
  subtitle(view) { if (view) return ""; const d = new Date(); return `${DAYS[d.getDay()]} ${d.getDate()} ${LONG_MONTHS[d.getMonth()]}`; },
  hasData() { return loadHabits().length > 0; },

  exportData() { return { habits: loadHabits() }; },
  importData(data) {
    if (!Array.isArray(data?.habits)) return null;
    const { mine, added, kept } = mergeHabits(data.habits);
    if (added && !saveHabits(mine)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["habit", "habits"] };
  },

  mount(root, { view, navigate, refreshChrome }) {
    let editing = false;
    let closed = { ...store.getMeta().homeClosed };
    const isOpen = key => !closed[key];
    const toggle = key => () => { closed = { ...closed, [key]: !closed[key] }; store.setMeta({ homeClosed: closed }); render(); };
    const head = (key, title, summary, tools) => foldHead(title, { open: isOpen(key), onToggle: toggle(key), summary, tools });

    function render() {
      const y = window.scrollY;
      root.replaceChildren();
      if (view === "plan") { renderPlanPage(root, navigate); return; }
      if (view === "week") { renderWeekPage(root, navigate); return; }
      if (view.startsWith("habit/")) { renderHabitPage(root, view.slice(6), navigate); return; }
      const sections = [sundayNudge(), habitsSection(render, { open: isOpen("habits"), toggle: toggle("habits") }), tasksSection(), goalsSection(), prioritiesSection(), peopleSection(), decisionsSection(), backupNudge()];
      sections.forEach(s => s && root.append(s));
      window.scrollTo(0, y);
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

    // ----- priorities from the latest review -----
    function prioritiesSection() {
      const r = review.latest();
      if (!r || !(r.answers?.matters?.trim() || r.answers?.drop?.trim())) return null;
      const stale = parseDate(r.week) < parseDate(addDays(review.thisSunday(), -7));
      const from = el("span", { class: "mono muted", text: stale ? `from week of ${review.weekLabel(r.week)}` : "from Sunday's review" });
      return el("section", { class: "section" },
        head("priorities", "This week's priorities", "", from),
        isOpen("priorities") && el("div", { class: "card", style: "gap:12px" },
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
        const st = people.status(p);
        rows.append(el("div", { class: `row pp-row ${st.key}`, style: `--pc:${st.color}` },
          el("a", { class: "main", href: `#/people/${p.id}` }, el("span", { class: "title", text: p.name }), el("span", { class: "meta", text: people.sinceText(p) })),
          right));
      });
      return el("section", { class: "section" },
        head("people", "Reach out to", `${due.length} due`, el("a", { class: "linkbtn", href: "#/people" }, "All people")),
        isOpen("people") && rows);
    }

    // ----- decisions due -----
    function decisionsSection() {
      const due = decisions.due();
      if (!due.length) return null;
      return el("section", { class: "section" },
        head("decisions", "Decisions to look back on", `${due.length} due`),
        isOpen("decisions") && el("div", { class: "rows" }, due.slice(0, 3).map(d => el("a", { class: "row", href: `#/decisions/${d.id}` },
          el("div", { class: "main" }, el("span", { class: "title", text: d.title }), el("span", { class: "meta", text: `Decided ${formatDate(d.decidedOn)}` })),
          el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: "Look back" })))));
    }

    // ----- goals: progress on each active goal -----
    function goalsSection() {
      const list = goals.activeGoals();
      if (!list.length) return null;
      return el("section", { class: "section" },
        head("goals", "Goals", `${list.length} active`, el("a", { class: "linkbtn", href: "#/goals" }, list.length > 3 ? `All ${list.length}` : "Open")),
        isOpen("goals") && el("div", { class: "rows" }, list.slice(0, 3).map(g => goals.goalRow(g, render, { next: false }))));
    }

    // ----- tasks: the open ones, ready to tick, and a line to add one -----
    function tasksSection() {
      const items = mind.openItems();
      const input = el("input", { type: "text", class: "hm-task-new", placeholder: "Add a task", maxlength: 300, "aria-label": "Add a task", enterkeyhint: "done" });
      const add = () => {
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        mind.add(text); // saving redraws Home
        setTimeout(() => root.querySelector(".hm-task-new")?.focus(), 0);
      };
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      const shown = items.slice(0, 5);
      return el("section", { class: "section" },
        head("tasks", "Tasks", items.length ? `${items.length} to do` : "", el("a", { class: "linkbtn", href: "#/mind" }, items.length > shown.length ? `All ${items.length}` : "Open")),
        isOpen("tasks") && el("div", { class: "rows" },
          shown.map(i => el("div", { class: "row goal-row" },
            el("button", { class: "goal-tick hm-task-tick", "aria-label": `Done: ${i.text}`, onclick: e => {
              e.currentTarget.classList.add("on"); e.currentTarget.textContent = "✓";
              setTimeout(() => mind.complete(i.id), 250);
            } }),
            el("a", { class: "main", href: `#/mind/${i.id}` }, el("span", { class: "title", text: i.text.split("\n")[0] })))),
          el("div", { class: "row hm-task-add" }, input, el("button", { class: "btn small", onclick: add }, "Add"))));
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
    const offs = ["habits", "weekly-review", "people", "decisions", "mind", "goals"].map(k => store.onChange(k, render));
    const stopTimers = tickTimers(root, () => render());
    const tick = () => { if (document.visibilityState === "visible") { render(); refreshChrome(); } };
    document.addEventListener("visibilitychange", tick);
    return {
      setView(v) { view = v; render(); window.scrollTo(0, 0); },
      unmount() { offs.forEach(f => f()); stopTimers(); document.removeEventListener("visibilitychange", tick); },
    };
  },
};
