// Goals: a few things you want to make happen, each with why it matters, what
// done looks like, small steps (the first unticked one is the next step) and
// the habits that move it along. Home and the weekly review show the next steps.
//
// Data (store key "goals"):
//   { goals: [ { id, title, why, finish, due ("YYYY-MM-DD" or ""),
//                steps: [ { id, text, done, doneAt } ], habits: [habit ids],
//                status: "active" | "someday" | "achieved" | "dropped",
//                createdAt, updatedAt, achievedAt } ] }

import * as store from "../store.js";
import { el, isoDate, parseDate, formatDate, MONTHS, datePick, sortable, moveItem, ding } from "../ui.js";
import { loadHabits, habitThisWeek } from "../habits.js";

const ID = "goals";
const FOCUS = 3; // more active goals than this gets a gentle note

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();
const today = () => isoDate(new Date());

function loadGoals() {
  const d = store.load(ID, { goals: [] });
  return (Array.isArray(d.goals) ? d.goals : []).filter(g => g?.id && typeof g.title === "string")
    .map(({ tracks, ...g }) => ({ why: "", finish: "", due: "", steps: [], habits: [], status: "active", ...g,
      // A short-lived version split steps into tracks; they're one list again.
      steps: (g.steps || []).map(({ track, ...st }) => st) }));
}
function saveGoals(goals) { return store.save(ID, { goals }); }

const nextStep = g => g.steps.find(s => !s.done) || null;
const progress = g => g.steps.length ? g.steps.filter(s => s.done).length / g.steps.length : 0;
// Active goals, soonest due first, then oldest first.
const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.createdAt.localeCompare(b.createdAt);
const active = goals => goals.filter(g => g.status === "active").sort(byDue);

function dueText(g) {
  if (!g.due) return "";
  const days = Math.round((parseDate(g.due) - parseDate(today())) / 864e5);
  const d = parseDate(g.due), when = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (days < 0) return `was due ${when}`;
  if (days === 0) return "due today";
  if (days < 14) return `by ${when} · ${days} day${days === 1 ? "" : "s"} left`;
  if (days < 120) return `by ${when} · ${Math.round(days / 7)} weeks left`;
  return `by ${formatDate(g.due)}`;
}
function stepsText(g) {
  if (!g.steps.length) return "No steps yet";
  return `${g.steps.filter(s => s.done).length} of ${g.steps.length} steps`;
}

// Ticks one of a goal's steps (its next step by default). Shared with Home.
function tickNext(id, stepId) {
  const goals = loadGoals(), g = goals.find(x => x.id === id);
  const s = g && (stepId ? g.steps.find(x => x.id === stepId) : nextStep(g));
  if (!s || s.done) return;
  s.done = true; s.doneAt = now(); g.updatedAt = now();
  saveGoals(goals);
  if (g.steps.every(x => x.done)) ding();
}

// A goal as a row: title, progress, and the next step with a tick.
function goalRow(g, onChange) {
  const step = nextStep(g), p = progress(g);
  const due = dueText(g);
  const late = g.due && g.due < today();
  return el("div", { class: "row goal-row" },
    step
      ? el("button", { class: "goal-tick", "aria-label": `Tick off: ${step.text}`, onclick: () => { tickNext(g.id, step.id); onChange(); } })
      : el("span", { class: "goal-tick none", "aria-hidden": "true" }),
    el("a", { class: "main", href: `#/${ID}/${g.id}` },
      el("span", { class: "title", text: g.title }),
      el("span", { class: "meta goal-next", text: step ? `Next: ${step.text}` : g.steps.length ? "All steps done. Tap to mark it achieved." : "Tap to add the first small step." }),
      el("span", { class: "goal-bar", "aria-hidden": "true" }, el("i", { style: `width:${p * 100}%` })),
      el("span", { class: "meta mono", style: late ? "color:var(--q-drop)" : "", text: [stepsText(g), due.replace(/^by [^·]*· /, "")].filter(Boolean).join(" · ") })));
}

export default {
  id: ID,
  name: "Goals",
  tab: "Goals",
  icon: "goals",
  color: "var(--m-goals)",

  backTo(view) { return view ? ID : null; },
  hasData() { return loadGoals().length > 0; },

  // For Home and the weekly review.
  activeGoals() { return active(loadGoals()); },
  nextStep, stepsText, dueText, tickNext, goalRow,

  exportData() { return { goals: loadGoals() }; },
  importData(data) {
    if (!Array.isArray(data?.goals)) return null;
    const mine = loadGoals();
    let added = 0, kept = 0;
    for (const g of data.goals) {
      if (!g?.id || typeof g.title !== "string") continue;
      const m = mine.findIndex(x => x.id === g.id);
      if (m < 0) { mine.push(g); added++; }
      else if ((g.updatedAt || "") > (mine[m].updatedAt || "")) { mine[m] = g; added++; }
      else kept++;
    }
    if (added && !saveGoals(mine)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["goal", "goals"] };
  },

  mount(root, { view, navigate, refreshChrome }) {
    let goals = loadGoals();
    let show = { someday: false, achieved: false };

    const patch = (id, p) => {
      goals = goals.map(g => g.id === id ? { ...g, ...p, updatedAt: now() } : g);
      saveGoals(goals);
    };
    const reload = () => { goals = loadGoals(); render(); };

    function render() {
      const y = window.scrollY;
      root.replaceChildren();
      if (!view) renderList();
      else {
        const g = goals.find(x => x.id === view);
        g ? renderGoal(g) : root.append(el("p", { class: "muted", text: "That goal isn't on this phone." }));
      }
      window.scrollTo(0, y);
      refreshChrome?.();
    }

    // ----- the list -----
    function addForm(big) {
      const input = el("input", { id: "goal-new", type: "text", maxlength: 120, placeholder: big ? "Run a 10k, save £2,000, finish the course…" : "Another goal", "aria-label": "New goal" });
      const add = () => {
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        const g = { id: newId(), title, why: "", finish: "", due: "", steps: [], habits: [], status: "active", createdAt: now(), updatedAt: now() };
        goals.push(g); saveGoals(goals);
        navigate(`${ID}/${g.id}`);
      };
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      return el("div", { class: "goal-add" }, input, el("button", { class: big ? "btn primary" : "btn", onclick: add }, "Add"));
    }

    function renderList() {
      const act = active(goals);
      if (!goals.length) {
        root.append(el("section", { class: "card empty-state", style: "--fc:var(--m-goals);gap:12px" },
          el("h2", { style: "font-size:21px", text: "What do you want to make happen?" }),
          el("p", { class: "muted", text: "Pick one to three things for the next few months. For each, you'll write why it matters, what done looks like, and the small steps to get there. The next step shows on Home so it's always in front of you." }),
          addForm(true)));
        return;
      }

      if (act.length) {
        root.append(el("div", { class: "rowhead" },
          el("h2", { style: "font-size:20px;font-weight:500", text: `${act.length} active` }),
          el("span", { class: "mono muted", text: "tick the circle when a step is done" })));
        root.append(el("div", { class: "rows" }, act.map(g => goalRow(g, reload))));
        if (act.length > FOCUS) root.append(el("p", { class: "small muted", text: `${FOCUS} or fewer active goals is easier to keep moving. You could move one to Someday from its page.` }));
      } else {
        root.append(el("p", { class: "small muted", text: "No active goals. Add one, or bring one back from Someday." }));
      }
      root.append(addForm(false));

      for (const [key, label, statuses] of [["someday", "Someday", ["someday"]], ["achieved", "Achieved and let go", ["achieved", "dropped"]]]) {
        const list = goals.filter(g => statuses.includes(g.status)).sort((a, b) => (b.achievedAt || b.updatedAt).localeCompare(a.achievedAt || a.updatedAt));
        if (!list.length) continue;
        root.append(el("button", { class: "linkbtn", style: "align-self:flex-start;color:var(--muted)", onclick: () => { show[key] = !show[key]; render(); } },
          show[key] ? `Hide ${label.toLowerCase()}` : `${label} (${list.length})`));
        if (show[key]) root.append(el("div", { class: "rows" }, list.map(g =>
          el("a", { class: `row goal-row ${g.status}`, href: `#/${ID}/${g.id}` },
            el("div", { class: "main" },
              el("span", { class: "title", text: g.title }),
              el("span", { class: "meta", text: g.status === "achieved"
                ? `Achieved ${g.achievedAt ? formatDate(isoDate(new Date(g.achievedAt))) : ""}`
                : g.status === "dropped" ? "Let go" : stepsText(g) }))))));
      }
    }

    // ----- one goal -----
    function renderGoal(g) {
      const saved = el("span", { class: "savestate", "aria-live": "polite" });
      const autosave = (node, key) => {
        let t = null;
        const save = () => { clearTimeout(t); patch(g.id, { [key]: node.value.trim() }); saved.textContent = "Saved"; };
        node.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 600); });
        node.addEventListener("change", save);
        return node;
      };
      const title = autosave(el("textarea", { rows: 2, maxlength: 120, value: g.title, "aria-label": "Goal", style: "min-height:0" }), "title");
      title.addEventListener("change", () => { if (!title.value.trim()) { title.value = g.title; } });
      const why = autosave(el("textarea", { rows: 3, value: g.why, placeholder: "When it gets hard, this is what you'll read." }), "why");
      const finish = autosave(el("input", { type: "text", maxlength: 160, value: g.finish, placeholder: "How you'll know you've got there." }), "finish");

      const dueRow = el("div", { class: "tools" },
        datePick(g.due ? formatDate(g.due) : "Pick a date", { value: g.due, className: "btn small", ariaLabel: "Target date" }, v => { patch(g.id, { due: v }); render(); }),
        g.due ? el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: () => { patch(g.id, { due: "" }); render(); } }, "No date") : null,
        g.due ? el("span", { class: "mono muted", text: dueText(g).replace(/^by [^·]*· /, "") }) : null);

      root.append(el("section", { class: "card", style: "--fc:var(--m-goals)" },
        el("label", { class: "field" }, el("span", { text: "Goal" }), title),
        el("label", { class: "field" }, el("span", { text: "Why it matters" }), why),
        el("label", { class: "field" }, el("span", { text: "Done looks like" }), finish),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "By when" }), dueRow),
        el("div", { class: "actions" }, saved)));

      root.append(stepsCard(g), habitsCard(g), statusCard(g));
    }

    function stepsCard(g) {
      const card = el("section", { class: "card", style: "--fc:var(--m-goals);gap:10px" });
      const draw = () => {
        g = goals.find(x => x.id === g.id);
        const done = g.steps.filter(s => s.done).length;
        const setGoal = p => { patch(g.id, p); draw(); };
        const setSteps = steps => setGoal({ steps });

        // Tap a step's words to edit them in a full-width box that grows to fit.
        const editable = s => {
          const span = el("span", { class: "goal-step-text", text: s.text, role: "button", tabindex: "0", "aria-label": `Edit step: ${s.text}` });
          const edit = () => {
            const box = el("textarea", { class: "goal-step-edit", rows: 1, maxlength: 300, value: s.text, "aria-label": "Edit step" });
            const fit = () => { box.style.height = "auto"; box.style.height = box.scrollHeight + 2 + "px"; };
            const save = () => {
              const text = box.value.trim().replace(/\s*\n\s*/g, " ");
              if (text && text !== s.text) setSteps(g.steps.map(x => x.id === s.id ? { ...x, text } : x)); else draw();
            };
            box.addEventListener("input", fit);
            box.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } else if (e.key === "Escape") draw(); });
            span.closest(".goal-step").replaceWith(el("div", { class: "goal-step-editor" }, box,
              el("div", { class: "tools", style: "justify-content:flex-end" },
                el("button", { class: "btn small", onclick: draw }, "Cancel"),
                el("button", { class: "btn small primary", onclick: save }, "Save"))));
            fit(); box.focus(); box.setSelectionRange(box.value.length, box.value.length);
          };
          span.addEventListener("click", edit);
          span.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); edit(); } });
          return span;
        };

        const stepRow = s => el("div", { class: "goal-step" + (s.done ? " done" : "") },
          el("button", { class: "goal-tick" + (s.done ? " on" : ""), "aria-pressed": String(s.done), "aria-label": s.done ? `Untick: ${s.text}` : `Tick off: ${s.text}`,
            onclick: () => {
              const steps = g.steps.map(x => x.id === s.id ? { ...x, done: !x.done, doneAt: x.done ? null : now() } : x);
              setSteps(steps);
              if (!s.done && steps.every(x => x.done)) ding();
            } }, s.done ? "✓" : ""),
          editable(s),
          el("button", { class: "linkbtn goal-del", "aria-label": `Remove step: ${s.text}`, onclick: () => setSteps(g.steps.filter(x => x.id !== s.id)) }, "×"),
          el("span", { class: "drag-handle", "data-drag": "", "aria-hidden": "true", text: "⠿" }));

        // The steps, draggable to reorder.
        const stepList = () => {
          const list = el("div", { class: "goal-steps sortable" }, g.steps.map(stepRow));
          sortable(list, (from, to) => setSteps(moveItem(g.steps, from, to)));
          return g.steps.length ? list : null;
        };
        const addStep = placeholder => {
          const input = el("input", { id: "goal-step", type: "text", maxlength: 300, placeholder, "aria-label": "New step" });
          const add = () => {
            const text = input.value.trim();
            if (!text) { input.focus(); return; }
            setSteps([...g.steps, { id: newId(), text, done: false, doneAt: null }]);
            card.querySelector("#goal-step")?.focus();
          };
          input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
          return el("div", { class: "goal-add" }, input, el("button", { class: "btn", onclick: add }, "Add"));
        };

        const intro = !g.steps.length
          ? el("p", { class: "small muted", text: "Break it down until each step feels easy to start. The first unticked step is your next step, and it shows on Home." }) : null;
        card.replaceChildren(...[
          el("div", { class: "rowhead" },
            el("h2", { style: "font-size:19px;font-weight:500", text: "Steps" }),
            g.steps.length ? el("span", { class: "mono muted", text: `${done} of ${g.steps.length} done` }) : null),
          intro,
          stepList(),
          addStep(g.steps.length ? "Add a step" : "The first small step"),
          g.steps.length ? el("p", { class: "small muted", style: "margin:0", text: "Tap a step to change it. Drag ⠿ to reorder." }) : null].filter(Boolean));
      };
      draw();
      return card;
    }

    function habitsCard(g) {
      const habits = loadHabits().filter(h => h.kind === "do" || g.habits.includes(h.id));
      const card = el("section", { class: "card", style: "--fc:var(--m-goals);gap:10px" });
      const draw = () => {
        g = goals.find(x => x.id === g.id);
        const lines = g.habits.map(habitThisWeek).filter(Boolean);
        card.replaceChildren(...[
          el("h2", { style: "font-size:19px;font-weight:500", text: "Habits that help" }),
          habits.length
            ? el("div", { class: "chips", role: "group", "aria-label": "Habits that help" }, habits.map(h =>
                el("button", { class: "chip", "aria-pressed": String(g.habits.includes(h.id)), onclick: () => {
                  patch(g.id, { habits: g.habits.includes(h.id) ? g.habits.filter(x => x !== h.id) : [...g.habits, h.id] }); draw();
                } }, h.name)))
            : el("p", { class: "small muted" }, "Regular habits are often what get a goal done. Add some on ", el("a", { href: "#/home" }, "Home"), " and link them here."),
          lines.length ? el("div", { class: "small" }, lines.map(l => el("div", {}, `${l.name}: `, el("span", { class: "muted", text: `${l.text} this week` })))) : null].filter(Boolean));
      };
      draw();
      return card;
    }

    function statusCard(g) {
      const box = el("div", { class: "tools", style: "justify-content:space-between" });
      const set = (status, extra = {}) => { patch(g.id, { status, ...extra }); };
      const buttons = g.status === "active"
        ? [el("button", { class: "btn primary", onclick: () => { set("achieved", { achievedAt: now() }); ding(); navigate(ID); } }, "Achieved"),
           el("button", { class: "btn", onclick: () => { set("someday"); navigate(ID); } }, "Someday"),
           el("button", { class: "btn", onclick: () => { set("dropped"); navigate(ID); } }, "Let it go")]
        : [el("button", { class: "btn primary", onclick: () => { set("active", { achievedAt: null }); render(); } }, "Make it active again")];
      const del = el("div", { class: "tools" });
      const idle = () => del.replaceChildren(el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Delete"));
      const ask = () => del.replaceChildren(
        el("span", { class: "small", text: "Delete this goal for good?" }),
        el("button", { class: "btn small danger", onclick: () => { goals = goals.filter(x => x.id !== g.id); saveGoals(goals); navigate(ID); } }, "Delete"),
        el("button", { class: "btn small", onclick: idle }, "Keep"));
      idle();
      box.append(el("div", { class: "tools" }, buttons));
      const note = g.status === "achieved" ? `Achieved ${g.achievedAt ? formatDate(isoDate(new Date(g.achievedAt))) : ""}. Well done.`
        : g.status === "someday" ? "On the someday list. It won't show on Home."
        : g.status === "dropped" ? "Let go. That's a decision too."
        : `Started ${formatDate(isoDate(new Date(g.createdAt)))}.`;
      return el("div", { style: "display:flex;flex-direction:column;gap:12px" }, box, el("p", { class: "small muted", text: note }), del);
    }

    render();
    const offs = [store.onChange(ID, reload), store.onChange("habits", () => { if (view) render(); })];
    return {
      setView(v) { view = v; goals = loadGoals(); render(); window.scrollTo(0, 0); },
      unmount() { offs.forEach(f => f()); },
    };
  },
};
