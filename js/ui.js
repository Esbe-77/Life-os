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
