// Small DOM helpers and date utilities shared by modules.

export const $ = (sel, root = document) => root.querySelector(sel);

// el("button", { class: "btn", onclick }, "Label", childNode, [moreKids])
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "text") n.textContent = v;
    else if (k === "value") n.value = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Dates are stored as local "YYYY-MM-DD" strings.
const pad = n => String(n).padStart(2, "0");
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export function formatDate(s) { const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A tappable label that opens the phone's date picker. Choosing a date (or
// tapping Set) calls onPick("YYYY-MM-DD") straight away.
export function datePick(label, { value = "", max = "", className = "btn", ariaLabel = "" } = {}, onPick) {
  const input = el("input", { type: "date", class: "date-pick-input", value, max: max || null, "aria-label": ariaLabel || label });
  input.addEventListener("change", () => { if (input.value) onPick(input.value); });
  return el("label", { class: className + " date-pick" }, el("span", { text: label }), input);
}

// Same idea for a time of day ("HH:MM").
export function timePick(label, { value = "", className = "btn", ariaLabel = "" } = {}, onPick) {
  const input = el("input", { type: "time", class: "date-pick-input", value, "aria-label": ariaLabel || label });
  input.addEventListener("change", () => { if (input.value) onPick(input.value); });
  return el("label", { class: className + " date-pick" }, el("span", { text: label }), input);
}

// Monday-first week helpers. Days are numbered like Date.getDay(): 0 = Sunday.
export const WEEKDAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
export function weekStart(iso) { const d = parseDate(iso); return addDays(iso, -((d.getDay() + 6) % 7)); }

// Hold an item for a moment, then drag it up or down to move it. Items are
// the list's direct children; an element marked data-drag inside one starts a
// drag straight away (a handle). onMove(from, to) runs once, on drop, with
// the indexes before and after. Taps and scrolling work as normal.
export function sortable(list, onMove, { delay = 380 } = {}) {
  let timer = null, drag = null, start = null, swallowClick = false;
  const items = () => [...list.children];
  const cancelHold = () => { clearTimeout(timer); timer = null; };

  function begin(item, pointerId) {
    drag = { item, from: items().indexOf(item), pointerId };
    item.classList.add("dragging");
    list.classList.add("sorting");
    try { list.setPointerCapture(pointerId); } catch {}
    navigator.vibrate?.(12);
  }
  function finish(commit) {
    cancelHold();
    if (!drag) return;
    const { item, from } = drag, to = items().indexOf(item);
    item.classList.remove("dragging"); list.classList.remove("sorting");
    drag = null; swallowClick = true; setTimeout(() => { swallowClick = false; }, 350);
    if (commit && to !== from) onMove(from, to);
    else if (to !== from) { const rest = items().filter(c => c !== item); list.insertBefore(item, rest[from] || null); }
  }

  list.addEventListener("pointerdown", e => {
    if (drag || e.button > 0) return;
    const item = items().find(c => c.contains(e.target));
    if (!item) return;
    const handle = e.target.closest("[data-drag]");
    if (!handle && e.target.closest("button, input, select, textarea, label")) return;
    start = { x: e.clientX, y: e.clientY };
    if (handle) { e.preventDefault(); begin(item, e.pointerId); }
    else timer = setTimeout(() => begin(item, e.pointerId), delay);
  });
  list.addEventListener("pointermove", e => {
    if (!drag) { if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancelHold(); return; }
    e.preventDefault();
    const others = items().filter(c => c !== drag.item);
    const over = others.find(c => { const r = c.getBoundingClientRect(); return e.clientY >= r.top && e.clientY <= r.bottom; });
    if (!over) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(drag.item, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  });
  list.addEventListener("pointerup", () => finish(true));
  list.addEventListener("pointercancel", () => finish(false));
  // While dragging, the page must not scroll, and a long press must not open
  // the phone's link menu.
  list.addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });
  list.addEventListener("contextmenu", e => { if (timer || drag) e.preventDefault(); });
  list.addEventListener("click", e => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);
  return list;
}

// Moves one entry of an array, returning a new array.
export function moveItem(arr, from, to) { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; }
