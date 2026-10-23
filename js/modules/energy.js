// Energy log: a few quick check-ins a day (energy, mood, a tag or two),
// and after a couple of weeks, what tends to go with your better days.
//
// Data (store key "energy"):
//   { entries: [ { id, at: ISO datetime, energy: 1–5, mood: 1–5, tags: [string] } ],  newest first
//     tags: [string] }  the tag choices, in the order shown

import * as store from "../store.js";
import { el, isoDate, addDays, parseDate, MONTHS, timePick, sortable, moveItem } from "../ui.js";

const ID = "energy";
const DEFAULT_TAGS = ["slept well", "slept badly", "exercised", "outside", "saw friends", "scrolled a lot", "caffeine", "alcohol", "worked late", "ate well"];
const ENERGY_WORDS = ["", "Drained", "Low", "OK", "Good", "Great"];
const MOOD_WORDS = ["", "Low", "Meh", "OK", "Good", "Great"];
const MIN_DAYS = 7; // days of check-ins before patterns are shown

const today = () => isoDate(new Date());
const dayOf = e => isoDate(new Date(e.at));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const timeOf = e => { const d = new Date(e.at); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n).toFixed(1);

function loadData() {
  const d = store.load(ID, { entries: [], tags: DEFAULT_TAGS });
  if (!Array.isArray(d.entries)) d.entries = [];
  if (!Array.isArray(d.tags)) d.tags = DEFAULT_TAGS.slice();
  return d;
}

// One row per day: average energy and mood, and every tag used that day.
function days(entries) {
  const map = new Map();
  for (const e of entries) {
    const k = dayOf(e);
    if (!map.has(k)) map.set(k, { day: k, energy: [], mood: [], tags: new Set() });
    const d = map.get(k);
    d.energy.push(e.energy); d.mood.push(e.mood); (e.tags || []).forEach(t => d.tags.add(t));
  }
  return [...map.values()].map(d => ({ day: d.day, energy: avg(d.energy), mood: avg(d.mood), tags: d.tags }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// For each tag: how days with it compare with days without it.
function tagEffects(dayRows) {
  const all = new Set(); dayRows.forEach(d => d.tags.forEach(t => all.add(t)));
  const out = [];
  for (const t of all) {
    const w = dayRows.filter(d => d.tags.has(t)), wo = dayRows.filter(d => !d.tags.has(t));
    if (w.length < 3 || wo.length < 3) continue;
    out.push({ tag: t, n: w.length, energy: avg(w.map(d => d.energy)) - avg(wo.map(d => d.energy)), mood: avg(w.map(d => d.mood)) - avg(wo.map(d => d.mood)) });
  }
  return out.sort((a, b) => (b.energy + b.mood) - (a.energy + a.mood));
}

export default {
  id: ID,
  name: "Energy log",
  tab: "Energy",
  icon: "energy",
  color: "var(--m-energy)",
  views: [["", "Check in"], ["patterns", "Patterns"]],

  hasData() { return loadData().entries.length > 0; },
  todayEntries() { return loadData().entries.filter(e => dayOf(e) === today()); },
  timeOf,

  exportData() { return loadData(); },
  importData(data) {
    if (!Array.isArray(data?.entries)) return null;
    const mine = loadData();
    const ids = new Set(mine.entries.map(e => e.id));
    let added = 0;
    for (const e of data.entries) {
      if (!e?.id || ids.has(e.id) || !e.at || !(e.energy >= 1 && e.energy <= 5) || !(e.mood >= 1 && e.mood <= 5)) continue;
      mine.entries.push({ id: e.id, at: e.at, energy: e.energy, mood: e.mood, tags: Array.isArray(e.tags) ? e.tags.map(String) : [] });
      ids.add(e.id); added++;
    }
    mine.entries.sort((a, b) => b.at.localeCompare(a.at));
    (data.tags || []).forEach(t => { if (typeof t === "string" && !mine.tags.includes(t)) mine.tags.push(t); });
    if (added && !store.save(ID, mine)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept: data.entries.length - added, noun: ["check-in", "check-ins"] };
  },

  mount(root, { view }) {
    let data = loadData();
    const pick = { energy: null, mood: null, tags: new Set() };
    let editingTags = false;
    let editing = null; // the check-in being changed, if any
    let range = 30;

    function startEdit(e) {
      editing = { id: e.id, at: e.at };
      pick.energy = e.energy; pick.mood = e.mood; pick.tags = new Set(e.tags || []);
      render(); window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function stopEdit() { editing = null; pick.energy = pick.mood = null; pick.tags.clear(); render(); }

    function save() {
      const ok = store.save(ID, data);
      return ok;
    }

    function render() { const y = window.scrollY; root.replaceChildren(); view === "patterns" ? renderPatterns() : renderCheckin(); window.scrollTo(0, y); }

    // ----- check in -----
    function scale(key, words, color) {
      const box = el("div", { class: "scale", role: "group", "aria-label": key === "energy" ? "Energy" : "Mood" });
      for (let n = 1; n <= 5; n++) box.append(el("button", {
        type: "button", style: `--sc:var(--s${n})`, "aria-pressed": String(pick[key] === n), "aria-label": `${n}, ${words[n]}`,
        onclick: () => { pick[key] = n; render(); },
      }, String(n), el("small", { text: words[n] })));
      return box;
    }

    function renderCheckin() {
      const msg = el("span", { class: "savestate", "aria-live": "polite" });
      const tagBox = el("div", { class: editingTags ? "rows sortable" : "chips" });
      data.tags.forEach(t => {
        if (editingTags) {
          tagBox.append(el("div", { class: "row", style: "padding:4px 8px 4px 4px;gap:6px" },
            el("span", { class: "drag-handle", "data-drag": "", "aria-hidden": "true", text: "⠿" }),
            el("div", { class: "main" }, el("span", { class: "title", style: "font-size:15.5px", text: t })),
            el("button", { type: "button", class: "linkbtn", style: "color:var(--q-drop);padding:0 6px", "aria-label": `Remove tag ${t}`, onclick: () => {
              data.tags = data.tags.filter(x => x !== t); pick.tags.delete(t); save(); render();
            } }, "Remove")));
        } else {
          tagBox.append(el("button", { type: "button", class: "chip", "aria-pressed": String(pick.tags.has(t)), onclick: () => {
            pick.tags.has(t) ? pick.tags.delete(t) : pick.tags.add(t); render();
          } }, t));
        }
      });
      if (editingTags) sortable(tagBox, (from, to) => { data.tags = moveItem(data.tags, from, to); save(); render(); });
      const newTag = el("input", { type: "text", id: "en-newtag", placeholder: "New tag", maxlength: 24, autocomplete: "off", style: "flex:1;min-width:0" });
      const addTag = () => {
        const t = newTag.value.trim().toLowerCase();
        if (t && !data.tags.includes(t)) { data.tags.push(t); save(); }
        newTag.value = ""; render(); setTimeout(() => document.getElementById("en-newtag")?.focus(), 0);
      };
      newTag.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } });

      const ready = pick.energy && pick.mood;
      const hhmm = at => { const d = new Date(at); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
      const editHead = editing ? el("div", { class: "rowhead" },
        el("span", { class: "field-label" }, "Changing the check-in at ",
          timePick(hhmm(editing.at), { value: hhmm(editing.at), className: "datelink", ariaLabel: "Change the time of this check-in" }, v => {
            const d = new Date(editing.at); const [h, m] = v.split(":").map(Number); d.setHours(h, m, 0, 0); editing.at = d.toISOString(); render();
          })),
        el("button", { class: "linkbtn", style: "color:var(--q-drop)", onclick: () => {
          data.entries = data.entries.filter(x => x.id !== editing.id); save(); stopEdit();
        } }, "Delete")) : null;
      const saveBtn = el("button", { class: "btn primary", disabled: !ready, onclick: () => {
        if (editing) {
          const i = data.entries.findIndex(x => x.id === editing.id);
          if (i >= 0) data.entries[i] = { ...data.entries[i], at: editing.at, energy: pick.energy, mood: pick.mood, tags: [...pick.tags] };
          data.entries.sort((a, b) => b.at.localeCompare(a.at));
          if (!save()) { msg.textContent = "Couldn't save. Your phone may be out of storage."; return; }
          stopEdit();
          const m = root.querySelector(".savestate"); if (m) m.textContent = "Changed";
          return;
        }
        data.entries.unshift({ id: newId(), at: new Date().toISOString(), energy: pick.energy, mood: pick.mood, tags: [...pick.tags] });
        if (!save()) { data.entries.shift(); msg.textContent = "Couldn't save. Your phone may be out of storage."; return; }
        pick.energy = pick.mood = null; pick.tags.clear();
        render();
        const m = root.querySelector(".savestate"); if (m) m.textContent = "Saved";
      } }, editing ? "Save changes" : "Save check-in");
      root.append(el("section", { class: "card", style: "--fc:var(--m-energy)" + (editing ? ";border-color:var(--m-energy)" : "") },
        editHead,
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Energy" }), scale("energy", ENERGY_WORDS)),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Mood" }), scale("mood", MOOD_WORDS)),
        el("div", { class: "field" },
          el("div", { class: "rowhead" },
            el("span", { class: "field-label", text: editingTags ? "Hold and drag to reorder" : "Anything going on? (optional)" }),
            el("button", { class: "linkbtn", onclick: () => { editingTags = !editingTags; render(); } }, editingTags ? "Done" : "Edit tags")),
          tagBox,
          editingTags ? el("div", { class: "tools", style: "flex-wrap:nowrap" }, newTag, el("button", { class: "btn small", onclick: addTag }, "Add")) : null),
        el("div", { class: "actions" },
          editing ? el("button", { class: "btn", onclick: stopEdit }, "Cancel") : msg,
          saveBtn)));

      const todays = data.entries.filter(e => dayOf(e) === today());
      root.append(el("section", { class: "section" },
        el("div", { class: "rowhead" }, el("h2", { text: "Today" }), el("span", { class: "mono muted", text: todays.length ? `${todays.length} check-in${todays.length === 1 ? "" : "s"}` : "" })),
        todays.length
          ? el("div", { class: "rows" }, todays.map(entryRow))
          : el("p", { class: "small muted", text: "Nothing yet today. Two or three quick check-ins a day is plenty." })));

      const earlier = data.entries.filter(e => dayOf(e) < today() && dayOf(e) >= addDays(today(), -6));
      if (earlier.length) root.append(el("details", { class: "en-earlier" },
        el("summary", { class: "mono muted", text: `Earlier this week · ${earlier.length}` }),
        el("div", { class: "rows" }, earlier.map(e => entryRow(e, true)))));

      const dayCount = days(data.entries).length;
      if (dayCount < MIN_DAYS) root.append(el("p", { class: "small muted", text: `Patterns appear after ${MIN_DAYS} days of check-ins. You're at ${dayCount}.` }));
    }

    function entryRow(e, withDay = false) {
      const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(e.at).getDay()];
      return el("div", { class: "row" },
        el("span", { class: "mono", style: withDay ? "width:40px;line-height:1.3" : "width:40px" }, withDay ? dayName + " " : "", timeOf(e)),
        el("div", { class: "main" },
          el("span", { class: "title", style: "font-size:15.5px" },
            el("span", { style: `color:var(--s${e.energy})`, text: `Energy ${e.energy}` }), "  ·  ",
            el("span", { style: `color:var(--s${e.mood})`, text: `Mood ${e.mood}` })),
          e.tags?.length ? el("span", { class: "meta", text: e.tags.join(", ") }) : null),
        el("button", { class: "linkbtn", "aria-label": `Edit the check-in at ${timeOf(e)}`, onclick: () => startEdit(e) }, editing?.id === e.id ? "Editing" : "Edit"));
    }

    // ----- patterns -----
    function renderPatterns() {
      const rows = days(data.entries);
      if (rows.length < MIN_DAYS) {
        root.append(el("section", { class: "card empty-state" },
          el("h2", { style: "font-size:21px", text: `${rows.length} of ${MIN_DAYS} days so far` }),
          el("p", { class: "muted", text: "Once you've checked in on a week's worth of days, this shows how your energy and mood move over time and which tags tend to come with better or worse days. It gets more reliable the longer you keep going." })));
        return;
      }

      root.append(el("div", { class: "chips", role: "group", "aria-label": "Time range" },
        [[14, "2 weeks"], [30, "Month"], [90, "3 months"], [365, "Year"]].map(([n, l]) =>
          el("button", { class: "chip", "aria-pressed": String(range === n), onclick: () => { range = n; render(); } }, l))));

      const from = addDays(today(), -(range - 1));
      const inRange = rows.filter(d => d.day >= from);
      root.append(el("section", { class: "card" },
        el("div", { class: "rowhead" },
          el("h2", { style: "font-size:19px;font-weight:500", text: "Daily average" }),
          el("span", { class: "wr-legend mono muted" },
            el("span", {}, el("i", { style: "background:var(--m-energy);border-color:var(--m-energy)" }), "Energy"),
            el("span", {}, el("i", { style: "background:var(--m-review);border-color:var(--m-review)" }), "Mood"))),
        chart(inRange, from, range),
        el("p", { class: "mono muted", text: inRange.length
          ? `Energy ${avg(inRange.map(d => d.energy)).toFixed(1)} · Mood ${avg(inRange.map(d => d.mood)).toFixed(1)} on average over ${inRange.length} days`
          : "No check-ins in this period." })));

      const effects = tagEffects(inRange.length >= MIN_DAYS ? inRange : rows);
      const lifts = effects.filter(t => t.energy + t.mood > 0.3);
      const drags = effects.filter(t => t.energy + t.mood < -0.3).reverse();
      const effectRow = t => el("div", { class: "row" },
        el("div", { class: "main" },
          el("span", { class: "title", text: t.tag }),
          el("span", { class: "meta", text: `${signed(t.energy)} energy, ${signed(t.mood)} mood on ${t.n} days with it` })),
        el("div", { style: "width:90px;display:flex;flex-direction:column;gap:5px" }, meter(t.energy, "var(--m-energy)"), meter(t.mood, "var(--m-review)")));
      root.append(el("section", { class: "section" },
        el("h2", { text: "What goes with your days" }),
        el("p", { class: "small muted", text: "Days with each tag compared with days without it. A tag needs at least 3 days of each before it shows. These are patterns, not proof." }),
        lifts.length ? el("div", { class: "section" }, el("div", { class: "month", text: "Better days" }), el("div", { class: "rows" }, lifts.map(effectRow))) : null,
        drags.length ? el("div", { class: "section" }, el("div", { class: "month", text: "Harder days" }), el("div", { class: "rows" }, drags.map(effectRow))) : null,
        !lifts.length && !drags.length ? el("p", { class: "small", text: "No tag stands out yet. Keep tagging and check back in a week or two." }) : null));

      // Time of day
      const parts = [["Morning", h => h < 12], ["Afternoon", h => h >= 12 && h < 17], ["Evening", h => h >= 17]];
      const recent = data.entries.filter(e => dayOf(e) >= from);
      const tod = parts.map(([label, f]) => { const xs = recent.filter(e => f(new Date(e.at).getHours())); return { label, n: xs.length, energy: xs.length ? avg(xs.map(e => e.energy)) : null }; }).filter(p => p.n >= 3);
      if (tod.length >= 2) root.append(el("section", { class: "section" },
        el("h2", { text: "Energy by time of day" }),
        el("div", { class: "rows" }, tod.map(p => el("div", { class: "row" },
          el("div", { class: "main" }, el("span", { class: "title", text: p.label }), el("span", { class: "meta", text: `${p.n} check-ins` })),
          el("span", { class: "mono", text: p.energy.toFixed(1) }),
          el("div", { class: "meter", style: "width:90px" }, el("i", { style: `left:0;width:${((p.energy - 1) / 4) * 100}%;--mc:var(--m-energy)` })))))));
    }

    // Diverging bar, centred, for a difference of up to ±2 points.
    function meter(v, color) {
      const w = Math.min(Math.abs(v), 2) / 2 * 50;
      return el("div", { class: "meter", style: "height:6px" },
        el("i", { style: `--mc:${color};width:${w}%;left:${v >= 0 ? 50 : 50 - w}%` }),
        el("i", { style: "left:calc(50% - 1px);width:2px;--mc:var(--muted);border-radius:0" }));
    }

    function chart(rowsIn, from, span) {
      const W = 400, H = 180, L = 22, R = 6, T = 10, B = 26;
      const x = day => L + ((parseDate(day) - parseDate(from)) / 86400000) / Math.max(1, span - 1) * (W - L - R);
      const y = v => T + (5 - v) / 4 * (H - T - B);
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Daily average energy and mood");
      svg.style.width = "100%"; svg.style.height = "auto"; svg.style.display = "block";
      const add = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.append(n); return n; };
      [1, 3, 5].forEach(v => {
        add("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--line)", "stroke-width": 1 });
        add("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 13, "font-family": "var(--font-mono)" }).textContent = v;
      });
      // first and last date labels
      [[from, "start"], [today(), "end"]].forEach(([d, anchor]) => {
        const dt = parseDate(d);
        add("text", { x: anchor === "start" ? L : W - R, y: H - 6, "text-anchor": anchor, fill: "var(--muted)", "font-size": 13, "font-family": "var(--font-mono)" }).textContent = `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
      });
      [["energy", "var(--m-energy)"], ["mood", "var(--m-review)"]].forEach(([k, color]) => {
        if (!rowsIn.length) return;
        add("polyline", { points: rowsIn.map(d => `${x(d.day).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" "), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" });
        const r = span > 120 ? 1.5 : span > 40 ? 2.2 : 3;
        rowsIn.forEach(d => add("circle", { cx: x(d.day).toFixed(1), cy: y(d[k]).toFixed(1), r, fill: color }));
      });
      return svg;
    }

    render();
    const off = store.onChange(ID, () => { data = loadData(); render(); });
    return {
      setView(v) { view = v; data = loadData(); render(); window.scrollTo(0, 0); },
      unmount() { off(); },
    };
  },
};
