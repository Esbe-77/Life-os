// On my mind: a place to dump the things going round in your head, say how
// big each one feels, and (when you're ready) write how you'll deal with it.
//
// Data (store key "mind"):
//   { items: [ { id, text, weight: 1–3 (small, medium, big), plan,
//                status: "open" | "done", createdAt, updatedAt, doneAt } ] }

import * as store from "../store.js";
import { el, formatDate, isoDate } from "../ui.js";

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

let lastWeight = 2; // the add form remembers the last size picked

export default {
  id: ID,
  name: "On my mind",
  tab: "Mind",
  icon: "mind",
  color: "var(--m-mind)",

  backTo(view) { return view ? ID : null; },
  hasData() { return loadItems().length > 0; },
  openItems() { return open(loadItems()); },

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
    return { added, kept, noun: ["thing on your mind", "things on your mind"] };
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
      const input = el("textarea", { id: "mind-new", rows: 2, placeholder: "What's going round in your head?", maxlength: 300, "aria-label": "Something on your mind" });
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
      const drawSizes = () => sizes.replaceChildren(sizeChips(lastWeight, n => { lastWeight = n; drawSizes(); }, "How big does it feel?"));
      sizes = el("div", {});
      drawSizes();

      root.append(el("section", { class: "card", style: "--fc:var(--m-mind);gap:12px" },
        input,
        el("div", { class: "actions" }, sizes, el("button", { class: "btn primary", onclick: add }, "Dump it"))));

      const list = open(items);
      if (!list.length) {
        root.append(el("p", { class: "small muted", text: items.length
          ? "Nothing open. Your head should feel a little lighter."
          : "Write down anything that keeps coming back: worries, jobs, decisions, conversations you're putting off. Getting it out of your head is the point. You can come back and decide what to do about each one later." }));
      } else {
        const planned = list.filter(i => i.plan.trim()).length;
        root.append(el("div", { class: "rowhead" },
          el("h2", { style: "font-size:20px;font-weight:500", text: `${list.length} on your mind` }),
          el("span", { class: "mono muted", text: planned ? `${planned} with a plan` : "tap one to plan it" })));
        root.append(el("div", { class: "rows" }, list.map(itemRow)));
      }

      const done = items.filter(i => i.status === "done").sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
      if (done.length) {
        root.append(el("button", { class: "linkbtn", style: "align-self:flex-start;color:var(--muted)", onclick: () => { showDone = !showDone; render(); } },
          showDone ? "Hide dealt with" : `Dealt with (${done.length})`));
        if (showDone) root.append(el("div", { class: "rows" }, done.map(itemRow)));
      }
    }

    function itemRow(i) {
      const [, label, color] = weightOf(i.weight);
      const isDone = i.status === "done";
      return el("a", { class: `row mind-row${isDone ? " done" : ""}`, href: `#/${ID}/${i.id}`, style: `--wc:${color}` },
        el("div", { class: "main" },
          el("span", { class: "title", text: i.text }),
          el("span", { class: "meta", text: isDone
            ? `Dealt with ${i.doneAt ? formatDate(isoDate(new Date(i.doneAt))) : ""}`
            : i.plan.trim() ? "Plan: " + i.plan.trim().split("\n")[0] : "No plan yet" })),
        isDone ? null : el("span", { class: "pill", style: `--pc:${color}`, text: label }));
    }

    // ----- one item -----
    function renderItem(i) {
      const text = el("textarea", { id: "mind-text", rows: 3, maxlength: 300, value: i.text, "aria-label": "What's on your mind" });
      text.addEventListener("change", () => { if (text.value.trim()) patch(i.id, { text: text.value.trim() }); });
      const plan = el("textarea", { id: "mind-plan", rows: 5, value: i.plan, placeholder: "The next small step, who could help, or what you'll let go of." });
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
          el("label", { class: "field" }, el("span", { text: "On my mind" }), text),
          el("div", { class: "field" }, el("span", { class: "field-label", text: "How big does it feel?" }),
            sizeChips(i.weight, n => { patch(i.id, { weight: n }); render(); }, "How big does it feel?")),
          el("label", { class: "field" },
            el("span", { text: "How I'll deal with it" }), plan),
          el("div", { class: "actions" },
            saved,
            isDone
              ? el("button", { class: "btn", onclick: () => { patch(i.id, { status: "open", doneAt: null }); render(); } }, "Back on my mind")
              : el("button", { class: "btn primary", onclick: () => { patch(i.id, { plan: plan.value, status: "done", doneAt: now() }); navigate(ID); } }, "Dealt with"))),
        el("p", { class: "small muted", text: `Added ${formatDate(isoDate(new Date(i.createdAt)))}.` + (isDone ? "" : " Tap Dealt with once it's sorted, or once you've decided to let it go.") }),
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
