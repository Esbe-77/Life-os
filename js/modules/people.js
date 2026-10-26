// Relationships: the 15–20 people who matter most, and a gentle nudge
// when it's been a while.
//
// Data (store key "people"):
//   { people: { <id>: { id, name, note, every (days), contacts: ["YYYY-MM-DD", ... newest first],
//                       createdAt, updatedAt } } }

import * as store from "../store.js";
import { el, isoDate, parseDate, addDays, formatDate, datePick } from "../ui.js";

const ID = "people";
const EVERY = [[7, "Week"], [14, "2 weeks"], [30, "Month"], [60, "2 months"], [90, "3 months"]];
const LAST = [[0, "Today"], [4, "This week"], [15, "This month"], [60, "Longer ago"], [null, "Not sure"]];

const today = () => isoDate(new Date());
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const everyLabel = n => (EVERY.find(([d]) => d === n)?.[1] || `${n} days`).toLowerCase();

function loadAll() { return store.load(ID, { people: {} }).people || {}; }
function saveAll(people) { return store.save(ID, { people }); }
const list = all => Object.values(all).filter(p => p && p.id);

function daysSince(p) {
  const last = p.contacts?.[0];
  return last ? Math.max(0, Math.round((parseDate(today()) - parseDate(last)) / 86400000)) : null;
}
// 1 or more means it's time; unknown last contact counts as time.
function urgency(p) { const d = daysSince(p); return d == null ? 1.5 : d / (p.every || 30); }
// Four colours, from in touch to long overdue (twice the gap you wanted, or
// never logged).
const LEVELS = [
  { key: "ok", label: "In touch", color: "var(--p-ok)" },
  { key: "soon", label: "Soon", color: "var(--p-soon)" },
  { key: "due", label: "Time to reach out", color: "var(--p-due)" },
  { key: "long", label: "It's been a long time", color: "var(--p-long)" },
];
function status(p) {
  const u = urgency(p);
  return LEVELS[u >= 1.5 ? 3 : u >= 1 ? 2 : u >= 0.75 ? 1 : 0];
}
function sinceText(p) {
  const d = daysSince(p);
  if (d == null) return "No conversation logged yet";
  if (d === 0) return "Talked today";
  if (d === 1) return "Talked yesterday";
  if (d < 14) return `Talked ${d} days ago`;
  if (d < 60) return `Talked ${Math.round(d / 7)} weeks ago`;
  return `Talked ${Math.round(d / 30.4)} months ago`;
}
const byUrgency = (a, b) => urgency(b) - urgency(a) || a.name.localeCompare(b.name);
function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

// Log a conversation today. Returns the previous contacts for undo.
function logToday(all, id) {
  const p = all[id], prev = p.contacts || [];
  if (prev[0] === today()) return prev;
  all[id] = { ...p, contacts: [today(), ...prev], updatedAt: new Date().toISOString() };
  saveAll(all);
  return prev;
}

export default {
  id: ID,
  name: "People",
  tab: "People",
  icon: "people",
  color: "var(--m-people)",

  title(view) {
    if (view === "add") return "Add a person";
    if (view) return loadAll()[view]?.name || "Person";
    return "People";
  },
  backTo(view) { return view ? ID : null; },
  hasData() { return list(loadAll()).length > 0; },
  due() { return list(loadAll()).filter(p => urgency(p) >= 1).sort(byUrgency); },
  sinceText,
  status,
  logToday(id) { const all = loadAll(); if (all[id]) logToday(all, id); },

  exportData() { return { people: list(loadAll()) }; },
  importData(data) {
    const items = Array.isArray(data?.people) ? data.people : null;
    if (!items) return null;
    const all = loadAll();
    let added = 0, kept = 0;
    for (const p of items) {
      if (!p?.id || !p.name) continue;
      const mine = all[p.id];
      if (mine && (mine.updatedAt || "") >= (p.updatedAt || "")) {
        // Still merge any conversations the backup knows about.
        const merged = [...new Set([...(mine.contacts || []), ...(p.contacts || [])])].sort().reverse();
        if (merged.length !== (mine.contacts || []).length) { all[p.id] = { ...mine, contacts: merged }; added++; } else kept++;
        continue;
      }
      const merged = [...new Set([...(p.contacts || []), ...(mine?.contacts || [])])].sort().reverse();
      all[p.id] = { ...p, contacts: merged };
      added++;
    }
    if (added && !saveAll(all)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["person", "people"] };
  },

  mount(root, { view, navigate, refreshChrome }) {
    let all = loadAll();
    // After "Talked today" the row offers Undo for a few seconds, then the list
    // re-sorts so the person drops to their new place. moved marks that row.
    let settle = null, moved = null;
    const settleSoon = id => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        settle = null; moved = id;
        const r = root.querySelector(".pp-row.logged");
        if (r) { r.classList.add("leaving"); setTimeout(render, 220); } else render();
      }, 2500);
    };

    function render() {
      root.replaceChildren();
      if (!view) renderList();
      else if (view === "add") renderForm();
      else if (all[view]) renderDetail(all[view]);
      else root.append(el("p", { class: "muted", text: "That person isn't on this phone." }));
      refreshChrome();
    }

    // ----- list -----
    function renderList() {
      const people = list(all).sort(byUrgency);
      if (!people.length) {
        root.append(el("section", { class: "card empty-state" },
          el("h2", { style: "font-size:21px", text: "Who matters most to you?" }),
          el("p", { class: "muted", text: "Add the 15 to 20 people you most want to stay close to, and how often you'd like to be in touch. This will gently point out who you haven't spoken to in a while." }),
          el("a", { class: "btn primary", href: `#/${ID}/add` }, "Add the first person")));
        return;
      }

      const due = people.filter(p => urgency(p) >= 1);
      const firstNames = due.slice(0, 3).map(p => p.name.split(" ")[0]);
      root.append(el("p", { class: "small", style: "font-size:17px" },
        due.length
          ? `It's been a while with ${joinNames(firstNames)}${due.length > 3 ? ` and ${due.length - 3} more` : ""}. A short message counts.`
          : "You're in touch with everyone on your list."));

      const counts = LEVELS.map(l => [l, people.filter(p => status(p).key === l.key).length]).filter(([, n]) => n);
      root.append(el("div", { class: "pp-legend", "aria-label": "Colour key" }, counts.map(([l, n]) =>
        el("span", { style: `--pc:${l.color}` }, el("i"), `${n} ${l.label.toLowerCase()}`))));
      const rows = el("div", { class: "rows" });
      people.forEach(p => rows.append(personRow(p)));
      root.append(rows);
      moved = null;
      root.append(el("div", { class: "actions" },
        el("a", { class: "btn", href: `#/${ID}/add` }, "Add a person"),
        el("span", { class: "mono muted", text: `${people.length} ${people.length === 1 ? "person" : "people"}${people.length > 20 ? " · a shorter list is easier to keep up" : ""}` })));
    }

    function personRow(p) {
      const st = status(p);
      const right = el("div", { class: "tools" });
      const drawIdle = () => right.replaceChildren(
        daysSince(p) === 0
          ? el("span", { class: "pill", style: `--pc:${st.color}`, text: "Today" })
          : el("button", { class: "btn small", "aria-label": `Talked to ${p.name} today`, onclick: () => {
              const prev = logToday(all, p.id); all = loadAll(); p = all[p.id];
              right.replaceChildren(el("button", { class: "btn small", onclick: () => {
                  clearTimeout(settle); settle = null;
                  all[p.id] = { ...all[p.id], contacts: prev }; saveAll(all); render();
                } }, "Undo"));
              meta.textContent = `${sinceText(p)} · every ${everyLabel(p.every)}`;
              row.className = "row pp-row ok logged"; row.style.setProperty("--pc", "var(--p-ok)"); bar.style.width = "0%";
              settleSoon(p.id);
            } }, "Talked today"));
      const meta = el("span", { class: "meta", text: `${sinceText(p)} · every ${everyLabel(p.every)}` });
      const u = urgency(p);
      const bar = el("i", { style: `width:${Math.min(u, 1) * 100}%` });
      drawIdle();
      const row = el("div", { class: `row pp-row ${st.key}${moved === p.id ? " arrived" : ""}`, style: `--pc:${st.color}`, title: st.label },
        el("a", { class: "main", href: `#/${ID}/${p.id}` },
          el("span", { class: "title", text: p.name }), meta,
          el("span", { class: "pp-bar", "aria-hidden": "true" }, bar)),
        right);
      return row;
    }

    // ----- add / edit -----
    function chips(options, get, set) {
      const box = el("div", { class: "chips" });
      const draw = () => box.replaceChildren(...options.map(([v, label]) => el("button", {
        type: "button", class: "chip", "aria-pressed": String(get() === v), onclick: () => { set(v); draw(); },
      }, label)));
      draw();
      return box;
    }

    function renderForm(existing) {
      const d = { every: existing?.every || 30, last: 15 };
      const msg = el("span", { class: "savestate" });
      const name = el("input", { type: "text", id: "pp-name", value: existing?.name || "", placeholder: "Name", autocomplete: "off" });
      const note = el("input", { type: "text", id: "pp-note", value: existing?.note || "", placeholder: "Sister, old flatmate, mentor…", autocomplete: "off" });
      const form = el("form", { class: "card", style: "--fc:var(--m-people)" },
        el("label", { class: "field" }, el("span", { text: "Name" }), name),
        el("label", { class: "field" }, el("span", { text: "Who they are to you (optional)" }), note),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Like to be in touch about every" }), chips(EVERY, () => d.every, v => { d.every = v; })),
        existing ? null : el("div", { class: "field" }, el("span", { class: "field-label", text: "Last talked" }), chips(LAST, () => d.last, v => { d.last = v; })),
        el("div", { class: "actions" },
          el("a", { class: "btn", href: existing ? `#/${ID}/${existing.id}` : `#/${ID}` }, "Cancel"),
          msg,
          el("button", { class: "btn primary", type: "submit" }, existing ? "Save" : "Add")));
      form.addEventListener("submit", e => {
        e.preventDefault();
        if (!name.value.trim()) { msg.textContent = "Add a name first."; name.focus(); return; }
        const now = new Date().toISOString();
        if (existing) {
          all[existing.id] = { ...all[existing.id], name: name.value.trim(), note: note.value.trim(), every: d.every, updatedAt: now };
        } else {
          const id = newId();
          all[id] = { id, name: name.value.trim(), note: note.value.trim(), every: d.every,
            contacts: d.last == null ? [] : [addDays(today(), -d.last)], createdAt: now, updatedAt: now };
        }
        if (!saveAll(all)) { msg.textContent = "Couldn't save. Your phone may be out of storage."; return; }
        if (existing) navigate(`${ID}/${existing.id}`);
        else { name.value = ""; note.value = ""; msg.textContent = "Added. Add another, or go back."; name.focus(); }
      });
      root.append(form);
      if (!existing) {
        root.append(el("a", { class: "btn", href: `#/${ID}`, style: "align-self:flex-start" }, "Done"));
        setTimeout(() => name.focus({ preventScroll: true }), 0);
      }
    }

    // ----- detail -----
    function renderDetail(p) {
      const st = status(p);
      const setContacts = contacts => {
        all[p.id] = { ...p, contacts: [...new Set(contacts)].sort().reverse(), updatedAt: new Date().toISOString() };
        saveAll(all); render();
      };
      root.append(el("section", { class: "card" },
        el("div", { class: "rowhead" },
          el("div", {}, p.note ? el("p", { class: "muted", text: p.note }) : null,
            el("p", { class: "mono muted", text: `${sinceText(p)} · every ${everyLabel(p.every)}` })),
          el("span", { class: "pill", style: `--pc:${st.color}`, text: st.label })),
        el("div", { class: "tools" },
          el("button", { class: "btn primary", disabled: daysSince(p) === 0, onclick: () => { logToday(all, p.id); all = loadAll(); render(); } }, "Talked today"),
          datePick("Another day…", { max: today(), ariaLabel: `Log a conversation with ${p.name} on another day` },
            d => setContacts([d, ...(p.contacts || [])])))));

      const hist = (p.contacts || []);
      root.append(el("section", { class: "section" },
        el("div", { class: "rowhead" }, el("h2", { text: "Conversations" }), hist.length ? el("span", { class: "small muted", text: "Tap a date to change it" }) : null),
        hist.length
          ? el("div", { class: "rows" }, hist.slice(0, 24).map(dte => el("div", { class: "row" },
              el("div", { class: "main" },
                datePick(formatDate(dte), { value: dte, max: today(), className: "datelink", ariaLabel: `Change ${formatDate(dte)}` },
                  d => setContacts(hist.map(x => x === dte ? d : x)))),
              el("button", { class: "linkbtn", style: "color:var(--muted)", "aria-label": `Remove ${formatDate(dte)}`, onclick: () => setContacts(hist.filter(x => x !== dte)) }, "Remove"))))
          : el("p", { class: "muted small", text: "None logged yet." })));

      const del = el("div", { class: "tools" });
      const idle = () => del.replaceChildren(
        el("button", { class: "linkbtn", onclick: () => { root.replaceChildren(); renderForm(p); } }, "Edit"),
        el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Remove from list"));
      const ask = () => del.replaceChildren(
        el("span", { class: "small", text: `Remove ${p.name} and their history?` }),
        el("button", { class: "btn small danger", onclick: () => { delete all[p.id]; saveAll(all); navigate(ID); } }, "Remove"),
        el("button", { class: "btn small", onclick: idle }, "Keep"));
      idle();
      root.append(del);
    }

    render();
    const off = store.onChange(ID, () => { all = loadAll(); if (!view) render(); });
    return {
      setView(v) { view = v; all = loadAll(); render(); window.scrollTo(0, 0); },
      unmount() { off(); clearTimeout(settle); },
    };
  },
};
