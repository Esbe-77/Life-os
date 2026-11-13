// Tasks: jot down what needs doing, say how big each one is, add a note on
// how you'll do it if you like, and tick it off. (It began as "On my mind",
// so its id, route and store key are still "mind".)
//
// Data (store key "mind"):
//   { items: [ { id, text, weight: 1–3 (small, medium, big), plan,
//                status: "open" | "done", createdAt, updatedAt, doneAt } ] }

import * as store from "../store.js";
import { el, formatDate, isoDate, weekStart } from "../ui.js";

const ID = "mind";
const WEIGHTS = [[1, "Small", "var(--w1)"], [2, "Medium", "var(--w2)"], [3, "Big", "var(--w3)"]];
const weightOf = n => WEIGHTS.find(w => w[0] === n) || WEIGHTS[1];

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();

function loadItems() {
  const d = store.load(ID, { items: [] });
  return (Array.isArray(d.items) ? d.items : []).filter(i => i?.id && typeof i.text === "string")
    .map(i => ({ weight: 2, plan: "", status: "open", ...i }));
}
function saveItems(items) { return store.save(ID, { items }); }
const open = items => items.filter(i => i.status !== "done")
  .sort((a, b) => b.weight - a.weight || b.createdAt.localeCompare(a.createdAt));

// Tasks ticked off this week (Monday to Sunday) stay in the list, ticked,
// until the week ends; older ones move to "Done".
const doneThisWeek = items => {
  const ws = weekStart(isoDate(new Date()));
  return items.filter(i => i.status === "done" && i.doneAt && isoDate(new Date(i.doneAt)) >= ws)
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt));
};

let lastWeight = 2; // the add form remembers the last size picked

export default {
  id: ID,
  name: "Tasks",
  tab: "Tasks",
  icon: "tasks",
  color: "var(--m-mind)",

  backTo(view) { return view ? ID : null; },
  hasData() { return loadItems().length > 0; },
  openItems() { return open(loadItems()); },
  doneThisWeek() { return doneThisWeek(loadItems()); },
  reopen(id) {
    return saveItems(loadItems().map(i => i.id === id ? { ...i, status: "open", doneAt: null, updatedAt: now() } : i));
  },
  // For Home: add a task, or tick one off.
  add(text) {
    const items = loadItems();
    items.push({ id: newId(), text, weight: lastWeight, plan: "", status: "open", createdAt: now(), updatedAt: now() });
    return saveItems(items);
  },
  complete(id) {
    return saveItems(loadItems().map(i => i.id === id ? { ...i, status: "done", doneAt: now(), updatedAt: now() } : i));
  },

  exportData() { return { items: loadItems() }; },
  importData(data) {
    if (!Array.isArray(data?.items)) return null;
    const mine = loadItems();
    let added = 0, kept = 0;
    for (const i of data.items) {
      if (!i?.id || typeof i.text !== "string") continue;
      const m = mine.findIndex(x => x.id === i.id);
      if (m < 0) { mine.push(i); added++; }
      else if ((i.updatedAt || "") > (mine[m].updatedAt || "")) { mine[m] = i; added++; }
      else kept++;
    }
    if (added && !saveItems(mine)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["task", "tasks"] };
  },

  mount(root, { view, navigate }) {
    let items = loadItems();
    let showDone = false;

    const patch = (id, p) => {
      items = items.map(i => i.id === id ? { ...i, ...p, updatedAt: now() } : i);
      saveItems(items);
    };

    function render() {
      const y = window.scrollY;
      root.replaceChildren();
      if (!view) renderList();
      else {
        const it = items.find(i => i.id === view);
        it ? renderItem(it) : root.append(el("p", { class: "muted", text: "That isn't on this phone." }));
      }
      window.scrollTo(0, y);
    }

    function sizeChips(value, onPick, label) {
      return el("div", { class: "chips", role: "group", "aria-label": label }, WEIGHTS.map(([n, l, c]) =>
        el("button", { type: "button", class: "chip mind-chip", style: `--wc:${c}`, "aria-pressed": String(value === n), onclick: () => onPick(n) }, l)));
    }

    // ----- the list -----
    function renderList() {
      const input = el("textarea", { id: "mind-new", rows: 2, placeholder: "What needs doing?", maxlength: 300, "aria-label": "New task" });
      const add = () => {
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        items.push({ id: newId(), text, weight: lastWeight, plan: "", status: "open", createdAt: now(), updatedAt: now() });
        saveItems(items);
        render();
        setTimeout(() => document.getElementById("mind-new")?.focus(), 0);
      };
      input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } });
      let sizes;
      const drawSizes = () => sizes.replaceChildren(sizeChips(lastWeight, n => { lastWeight = n; drawSizes(); }, "How big is it?"));
      sizes = el("div", {});
      drawSizes();

      root.append(el("section", { class: "card", style: "--fc:var(--m-mind);gap:12px" },
        input,
        el("div", { class: "actions" }, sizes, el("button", { class: "btn primary", onclick: add }, "Add"))));

      const list = open(items), week = doneThisWeek(items);
      if (!list.length && !week.length) {
        root.append(el("p", { class: "small muted", text: items.length
          ? "Nothing to do. Nice."
          : "Write down anything you need to get done, big or small. Tap one to add a note, and tick it off when it's done." }));
      } else {
        const planned = list.filter(i => i.plan.trim()).length;
        root.append(el("div", { class: "rowhead" },
          el("h2", { style: "font-size:20px;font-weight:500", text: list.length ? `${list.length} to do` : "All done" }),
          el("span", { class: "mono muted", text: planned ? `${planned} with a note` : "tap one to add a note" })));
        root.append(el("div", { class: "rows" }, [...list, ...week].map(itemRow)));
      }

      const done = items.filter(i => i.status === "done" && !week.includes(i)).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
      if (done.length) {
        root.append(el("button", { class: "linkbtn", style: "align-self:flex-start;color:var(--muted)", onclick: () => { showDone = !showDone; render(); } },
          showDone ? "Hide done" : `Done (${done.length})`));
        if (showDone) root.append(el("div", { class: "rows" }, done.map(itemRow)));
      }
    }

    function itemRow(i) {
      const [, label, color] = weightOf(i.weight);
      const isDone = i.status === "done";
      return el("a", { class: `row mind-row${isDone ? " done" : ""}`, href: `#/${ID}/${i.id}`, style: `--wc:${color}` },
        el("div", { class: "main" },
          el("span", { class: "title", text: i.text }),
          (isDone || i.plan.trim()) ? el("span", { class: "meta", text: isDone
            ? `Done ${i.doneAt ? formatDate(isoDate(new Date(i.doneAt))) : ""}`
            : i.plan.trim().split("\n")[0] }) : null),
        isDone ? null : el("span", { class: "pill", style: `--pc:${color}`, text: label }));
    }

    // ----- one item -----
    function renderItem(i) {
      const text = el("textarea", { id: "mind-text", rows: 3, maxlength: 300, value: i.text, "aria-label": "Task" });
      text.addEventListener("change", () => { if (text.value.trim()) patch(i.id, { text: text.value.trim() }); });
      const plan = el("textarea", { id: "mind-plan", rows: 5, value: i.plan, placeholder: "The first step, who could help, anything to remember." });
      const saved = el("span", { class: "savestate", "aria-live": "polite" });
      let t = null;
      plan.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { patch(i.id, { plan: plan.value }); saved.textContent = "Saved"; }, 600); });
      plan.addEventListener("change", () => { clearTimeout(t); patch(i.id, { plan: plan.value }); saved.textContent = "Saved"; });

      const isDone = i.status === "done";
      const del = el("div", { class: "tools" });
      const idle = () => del.replaceChildren(el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Delete"));
      const ask = () => del.replaceChildren(
        el("span", { class: "small", text: "Delete this for good?" }),
        el("button", { class: "btn small danger", onclick: () => { items = items.filter(x => x.id !== i.id); saveItems(items); navigate(ID); } }, "Delete"),
        el("button", { class: "btn small", onclick: idle }, "Keep"));
      idle();

      root.append(
        el("section", { class: "card", style: "--fc:var(--m-mind)" },
          el("label", { class: "field" }, el("span", { text: "Task" }), text),
          el("div", { class: "field" }, el("span", { class: "field-label", text: "How big is it?" }),
            sizeChips(i.weight, n => { patch(i.id, { weight: n }); render(); }, "How big is it?")),
          el("label", { class: "field" },
            el("span", { text: "Notes" }), plan),
          el("div", { class: "actions" },
            saved,
            isDone
              ? el("button", { class: "btn", onclick: () => { patch(i.id, { status: "open", doneAt: null }); render(); } }, "Not done yet")
              : el("button", { class: "btn primary", onclick: () => { patch(i.id, { plan: plan.value, status: "done", doneAt: now() }); navigate(ID); } }, "Done"))),
        el("p", { class: "small muted", text: `Added ${formatDate(isoDate(new Date(i.createdAt)))}.` + (isDone ? "" : " Tap Done once it's done, or once you've decided to let it go.") }),
        del);
    }

    render();
    const off = store.onChange(ID, () => { items = loadItems(); render(); });
    return {
      setView(v) { view = v; items = loadItems(); render(); window.scrollTo(0, 0); },
      unmount() { off(); },
    };
  },
};
