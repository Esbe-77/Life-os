// Decision journal: help weigh a choice (options, pros and cons), record
// what you decided and why, then look back when the check-in date comes.
//
// Data (store key "decisions"):
//   { decisions: { <id>: {
//       id, title, status: "deciding" | "decided",
//       options: [ { id, name, pros: [{ id, text, big }], cons: [{ id, text, big }] } ],
//       chosen (option id or null), decision (what was chosen, as text),
//       why, expect, confidence (50–95), area,
//       decidedOn, reviewOn, createdAt, updatedAt,
//       outcome: null | { rating: "better"|"expected"|"worse", happened, lessons, reviewedOn } } } }
// Entries saved before options existed have no status; they load as "decided".

import * as store from "../store.js";
import { el, isoDate, parseDate, formatDate } from "../ui.js";

const ID = "decisions";
const AREAS = ["Work", "Money", "Relationships", "Purchase", "Health", "Home", "Other"];
const CONFIDENCE = [[50, "Coin flip"], [65, "Leaning"], [80, "Fairly sure"], [90, "Very sure"], [95, "Certain"]];
const CHECKIN = [[1, "1 month"], [3, "3 months"], [6, "6 months"], [12, "1 year"]];
const RATINGS = {
  better: { label: "Better than expected", color: "var(--q-well)" },
  expected: { label: "About as expected", color: "var(--q-matters)" },
  worse: { label: "Worse than expected", color: "var(--q-drop)" },
};
const MAX_OPTIONS = 5;

const today = () => isoDate(new Date());
function addMonths(iso, n) {
  const d = parseDate(iso), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return isoDate(d);
}
function until(iso) {
  const days = Math.round((parseDate(iso) - parseDate(today())) / 86400000);
  if (days <= 0) return "now";
  if (days < 14) return `in ${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30.4)} months`;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function normalize(d) {
  return { ...d, status: d.status || "decided", options: Array.isArray(d.options) ? d.options : [] };
}
function loadAll() {
  const raw = store.load(ID, { decisions: {} }).decisions || {};
  return Object.fromEntries(Object.entries(raw).map(([k, d]) => [k, normalize(d)]));
}
function saveAll(decisions) { return store.save(ID, { decisions }); }
const list = all => Object.values(all).filter(d => d && d.id);
const isDue = d => d.status === "decided" && !d.outcome && d.reviewOn && d.reviewOn <= today();
// A pro counts +1 and a con −1; one that matters a lot counts double.
const score = o => o.pros.reduce((n, p) => n + (p.big ? 2 : 1), 0) - o.cons.reduce((n, c) => n + (c.big ? 2 : 1), 0);
const signed = n => (n > 0 ? "+" : "") + n;

export default {
  id: ID,
  name: "Decision journal",
  tab: "Decisions",
  icon: "decisions",
  color: "var(--m-decisions)",

  title(view) {
    if (view === "new") return "New decision";
    if (view) return loadAll()[view]?.title || "Decision";
    return "Decisions";
  },
  backTo(view) { return view ? ID : null; },
  hasData() { return list(loadAll()).length > 0; },
  badge() { return list(loadAll()).filter(isDue).length; },
  due() { return list(loadAll()).filter(isDue).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn)); },

  exportData() { return { decisions: list(loadAll()) }; },
  importData(data) {
    const items = Array.isArray(data?.decisions) ? data.decisions : null;
    if (!items) return null;
    const all = loadAll();
    let added = 0, kept = 0;
    for (const d of items) {
      if (!d?.id || !d.title) continue;
      if (all[d.id] && (all[d.id].updatedAt || "") >= (d.updatedAt || "")) { kept++; continue; }
      all[d.id] = normalize(d); added++;
    }
    if (added && !saveAll(all)) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["decision", "decisions"] };
  },

  mount(root, { view, navigate, refreshChrome }) {
    let all = loadAll();

    function persist(msgEl) {
      const ok = saveAll(all);
      if (!ok && msgEl) msgEl.textContent = "Couldn't save. Your phone may be out of storage.";
      refreshChrome();
      return ok;
    }
    function update(id, patch) {
      all[id] = { ...all[id], ...patch, updatedAt: new Date().toISOString() };
      return persist();
    }

    function render() {
      const y = window.scrollY;
      root.replaceChildren();
      if (!view) renderList();
      else if (view === "new") renderNew();
      else if (all[view]) all[view].status === "deciding" ? renderDeciding(all[view]) : renderDecided(all[view]);
      else root.append(el("p", { class: "muted", text: "That decision isn't on this phone." }));
      window.scrollTo(0, y); // stay put while adding pros and cons
    }

    // ----- list -----
    function row(d) {
      let pill;
      if (d.status === "deciding") pill = el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: "Deciding" });
      else if (d.outcome) pill = el("span", { class: "pill", style: `--pc:${RATINGS[d.outcome.rating]?.color}`, text: RATINGS[d.outcome.rating]?.label.split(" ")[0] || "Reviewed" });
      else if (isDue(d)) pill = el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: "Look back" });
      else pill = el("span", { class: "pill", text: until(d.reviewOn) });
      const meta = d.status === "deciding"
        ? `${d.options.length} options · started ${formatDate(d.createdAt.slice(0, 10))}`
        : `${d.decision ? "Chose: " + d.decision + " · " : ""}${formatDate(d.decidedOn)}`;
      return el("a", { class: "row", href: `#/${ID}/${d.id}` },
        el("div", { class: "main" }, el("span", { class: "title", text: d.title }), el("span", { class: "meta", text: meta })),
        pill);
    }

    function renderList() {
      const items = list(all);
      // The prompt box: tapping it starts a new decision.
      root.append(el("a", { class: "card dj-prompt", href: `#/${ID}/new` },
        el("span", { class: "dj-prompt-q", text: "What are you trying to decide?" }),
        el("span", { class: "small muted", text: items.length ? "Tap to weigh up a new decision." : "Tap to start. List your options and their pros and cons, then decide. Months later, this asks how it turned out, so you learn how good your judgment really is." })));
      if (!items.length) return;

      const deciding = items.filter(d => d.status === "deciding").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const due = items.filter(isDue).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
      const waiting = items.filter(d => d.status === "decided" && !d.outcome && !isDue(d)).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
      const done = items.filter(d => d.outcome).sort((a, b) => (b.outcome.reviewedOn || "").localeCompare(a.outcome.reviewedOn || ""));

      const section = (title, rows, note) => rows.length ? root.append(el("section", { class: "section" },
        el("h2", { text: title }), note ? el("p", { class: "small muted", text: note }) : null,
        el("div", { class: "rows" }, rows.map(row)))) : null;
      section("Still deciding", deciding);
      section("Time to look back", due, "Before reading what you wrote, think for a moment about how it actually went.");
      if (done.length >= 3) root.append(insights(done));
      section("Waiting to see", waiting);
      section("Looked back", done);
    }

    function insights(done) {
      const n = k => done.filter(d => d.outcome.rating === k).length;
      const total = done.length;
      const meter = el("div", { class: "meter", style: "height:12px" });
      let left = 0;
      ["better", "expected", "worse"].forEach(k => {
        const w = (n(k) / total) * 100;
        meter.append(el("i", { style: `left:${left}%;width:${w}%;--mc:${RATINGS[k].color};border-radius:0` }));
        left += w;
      });
      const held = d => d.outcome.rating !== "worse";
      const sure = done.filter(d => d.confidence >= 80), unsure = done.filter(d => d.confidence < 80);
      const lines = [];
      if (sure.length >= 2) lines.push(`When you felt fairly sure or more, ${sure.filter(held).length} of ${sure.length} turned out as well as you expected or better.`);
      if (unsure.length >= 2) lines.push(`When you were less sure, ${unsure.filter(held).length} of ${unsure.length} did.`);
      return el("section", { class: "card" },
        el("div", { class: "rowhead" }, el("h2", { style: "font-size:19px;font-weight:500", text: "How your calls have held up" }), el("span", { class: "mono muted", text: `${total} looked back` })),
        meter,
        el("div", { class: "wr-legend mono muted" }, ["better", "expected", "worse"].map(k =>
          el("span", {}, el("i", { style: `background:${RATINGS[k].color};border-color:${RATINGS[k].color}` }), `${RATINGS[k].label.split(" ")[0]} ${n(k)}`))),
        lines.length ? el("p", { class: "small", text: lines.join(" ") }) : null);
    }

    // ----- new -----
    function renderNew() {
      const msg = el("span", { class: "savestate" });
      const title = el("input", { type: "text", id: "dj-title", placeholder: "Should I take the Northwind job?", autocomplete: "off" });
      const o1 = el("input", { type: "text", id: "dj-o1", placeholder: "Take it", autocomplete: "off" });
      const o2 = el("input", { type: "text", id: "dj-o2", placeholder: "Stay where I am", autocomplete: "off" });
      const form = el("form", { class: "card", style: "--fc:var(--m-decisions)" },
        el("label", { class: "field" }, el("span", { text: "What are you deciding?" }), title),
        el("div", { class: "field" },
          el("span", { class: "field-label", text: "What are the options?" }),
          el("span", { class: "field-hint", text: "Two is fine. You can add more later. Leave them blank for a simple yes or no." }),
          o1, o2),
        el("div", { class: "actions" },
          el("a", { class: "btn", href: `#/${ID}` }, "Cancel"), msg,
          el("button", { class: "btn primary", type: "submit" }, "Weigh it up")));
      form.addEventListener("submit", e => {
        e.preventDefault();
        if (!title.value.trim()) { msg.textContent = "Say what you're deciding first."; title.focus(); return; }
        const names = [o1.value.trim(), o2.value.trim()].filter(Boolean);
        const opts = (names.length ? names : ["Yes", "No"]).map(name => ({ id: newId(), name, pros: [], cons: [] }));
        if (opts.length === 1) opts.push({ id: newId(), name: "Not doing it", pros: [], cons: [] });
        const now = new Date().toISOString();
        const d = { id: newId(), title: title.value.trim(), status: "deciding", options: opts, chosen: null, decision: "", why: "", expect: "",
          confidence: 80, area: null, decidedOn: null, reviewOn: null, createdAt: now, updatedAt: now, outcome: null };
        all[d.id] = d;
        if (persist(msg)) navigate(`${ID}/${d.id}`);
      });
      root.append(form);
      setTimeout(() => title.focus({ preventScroll: true }), 0);
    }

    // ----- weighing it up -----
    function renderDeciding(d) {
      const scores = d.options.map(score);
      const best = Math.max(...scores);
      const leaders = d.options.filter((o, i) => scores[i] === best);
      const anyItems = d.options.some(o => o.pros.length || o.cons.length);

      d.options.forEach((o, i) => root.append(optionCard(d, o, scores[i], anyItems && leaders.length === 1 && leaders[0] === o)));

      root.append(el("div", { class: "tools" },
        d.options.length < MAX_OPTIONS ? el("button", { class: "btn", onclick: () => {
          update(d.id, { options: [...d.options, { id: newId(), name: `Option ${d.options.length + 1}`, pros: [], cons: [] }] });
          render(); root.querySelector(".dj-option:last-of-type .dj-optname")?.select();
        } }, "Add another option") : null));

      if (anyItems) {
        const ranked = d.options.map((o, i) => [o, scores[i]]).sort((a, b) => b[1] - a[1]);
        const text = leaders.length > 1
          ? `On paper, ${leaders.map(o => o.name).join(" and ")} are level. What would tip it?`
          : `On paper, ${ranked[0][0].name} comes out ahead (${signed(ranked[0][1])} against ${signed(ranked[1][1])}). Does that feel right? If not, something's missing from the list.`;
        root.append(el("p", { class: "small", style: "font-size:16px", text }));
      }

      const panel = el("div");
      root.append(panel);
      const openPanel = () => decidePanel(panel, d, leaders.length === 1 && anyItems ? leaders[0].id : null);
      panel.append(el("button", { class: "btn primary", style: "align-self:flex-start", onclick: openPanel }, "I've decided"));

      root.append(deleteControl(d));
    }

    function optionCard(d, o, sc, leading) {
      const save = patch => {
        const options = all[d.id].options.map(x => x.id === o.id ? { ...x, ...patch } : x);
        update(d.id, { options });
      };
      const name = el("input", { type: "text", class: "dj-optname", value: o.name, "aria-label": "Option name", maxlength: 60 });
      name.addEventListener("change", () => { if (name.value.trim()) save({ name: name.value.trim() }); else name.value = o.name; });

      const itemList = (kind, label, color) => {
        const items = o[kind];
        const box = el("div", { class: "dj-items", style: `--ic:${color}` },
          el("div", { class: "dj-items-head" }, el("span", { text: label })));
        items.forEach(it => box.append(el("div", { class: "dj-item" + (it.big ? " big" : "") },
          el("button", { class: "dj-star", "aria-pressed": String(!!it.big), "aria-label": it.big ? "Matters a lot (tap to undo)" : "Mark as mattering a lot", title: "Matters a lot", onclick: () => {
            save({ [kind]: items.map(x => x.id === it.id ? { ...x, big: !x.big } : x) }); render();
          } }, it.big ? "★" : "☆"),
          el("span", { class: "dj-item-text", text: it.text }),
          el("button", { class: "linkbtn", style: "color:var(--muted)", "aria-label": `Remove “${it.text}”`, onclick: () => {
            save({ [kind]: items.filter(x => x.id !== it.id) }); render();
          } }, "×"))));
        const input = el("input", { type: "text", placeholder: kind === "pros" ? "Add a pro" : "Add a con", maxlength: 120, "aria-label": `Add a ${kind === "pros" ? "pro" : "con"} for ${o.name}` });
        const add = () => {
          const t = input.value.trim(); if (!t) return;
          save({ [kind]: [...items, { id: newId(), text: t, big: false }] });
          render();
          // keep typing into the same box
          setTimeout(() => root.querySelector(`[data-add="${o.id}-${kind}"]`)?.focus(), 0);
        };
        input.dataset.add = `${o.id}-${kind}`;
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
        box.append(el("div", { class: "tools", style: "flex-wrap:nowrap" }, input, el("button", { class: "btn small", onclick: add }, "Add")));
        return box;
      };

      return el("section", { class: "card dj-option" + (leading ? " leading" : "") },
        el("div", { class: "rowhead", style: "flex-wrap:nowrap;align-items:center" },
          name,
          el("span", { class: "pill", style: `--pc:${sc > 0 ? "var(--q-well)" : sc < 0 ? "var(--q-drop)" : "var(--muted)"}`, title: "Pros minus cons. Starred ones count double.", text: signed(sc) })),
        itemList("pros", "Pros", "var(--q-well)"),
        itemList("cons", "Cons", "var(--q-drop)"),
        all[d.id].options.length > 2 ? el("button", { class: "linkbtn", style: "color:var(--muted);align-self:flex-start", onclick: () => {
          update(d.id, { options: all[d.id].options.filter(x => x.id !== o.id) }); render();
        } }, "Remove this option") : null);
    }

    // ----- choosing -----
    function chips(options, get, set, allowNone = false) {
      const box = el("div", { class: "chips" });
      const draw = () => box.replaceChildren(...options.map(([v, label]) => el("button", {
        type: "button", class: "chip", "aria-pressed": String(get() === v),
        onclick: () => { set(allowNone && get() === v ? null : v); draw(); },
      }, label)));
      draw();
      return box;
    }

    function decidePanel(panel, d, preselect, editing = false) {
      const st = { chosen: d.chosen || preselect, confidence: d.confidence || 80, area: d.area || null, months: 6 };
      const msg = el("span", { class: "savestate" });
      const why = el("textarea", { id: "dj-why", rows: 3, placeholder: "The reasons you'd give today, including what you're unsure about." });
      const expect = el("textarea", { id: "dj-expect", rows: 3, placeholder: "What you think will happen, as specifically as you can." });
      why.value = d.why || ""; expect.value = d.expect || "";
      const opts = d.options.length ? d.options.map(o => [o.id, o.name]) : null;
      const form = el("form", { class: "card", style: "--fc:var(--m-decisions)" },
        el("h2", { style: "font-size:21px", text: editing ? "Edit your decision" : "What did you decide?" }),
        opts ? chips(opts, () => st.chosen, v => { st.chosen = v; }) : null,
        el("label", { class: "field" }, el("span", { text: "Why?" }), why),
        el("label", { class: "field" }, el("span", { text: "What do you expect to happen?" }), expect),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "How sure are you?" }), chips(CONFIDENCE, () => st.confidence, v => { st.confidence = v; })),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Area (optional)" }), chips(AREAS.map(a => [a, a]), () => st.area, v => { st.area = v; }, true)),
        editing ? null : el("div", { class: "field" }, el("span", { class: "field-label", text: "Ask me how it went in" }), chips(CHECKIN, () => st.months, v => { st.months = v; })),
        el("div", { class: "actions" },
          el("button", { class: "btn", type: "button", onclick: () => render() }, "Not yet"), msg,
          el("button", { class: "btn primary", type: "submit" }, editing ? "Save" : "Save decision")));
      form.addEventListener("submit", e => {
        e.preventDefault();
        if (opts && !st.chosen) { msg.textContent = "Pick the option you chose."; return; }
        const chosenName = opts ? d.options.find(o => o.id === st.chosen)?.name || "" : d.decision;
        const patch = { chosen: st.chosen, decision: chosenName, why: why.value, expect: expect.value, confidence: st.confidence, area: st.area };
        if (!editing) Object.assign(patch, { status: "decided", decidedOn: today(), reviewOn: addMonths(today(), st.months) });
        if (update(d.id, patch)) render();
        window.scrollTo(0, 0);
      });
      panel.replaceChildren(form);
      form.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    // ----- decided -----
    function block(label, text, color = "var(--m-decisions)") {
      return el("div", { class: "wr-ans", style: `--qc:${color}` },
        el("div", {}, el("div", { class: "k", text: label }),
          el("div", { class: "v" + (text?.trim() ? "" : " empty"), text: text?.trim() || "Not written" })));
    }

    function renderDecided(d) {
      const editable = d.decidedOn && Date.now() - parseDate(d.decidedOn).getTime() < 2 * 86400000 && !d.outcome;
      const conf = CONFIDENCE.find(([v]) => v === d.confidence)?.[1] || `${d.confidence}%`;
      const panel = el("div");
      root.append(el("section", { class: "card" },
        el("div", { class: "rowhead" },
          el("p", { class: "mono muted", text: `Decided ${formatDate(d.decidedOn)} · felt ${conf.toLowerCase()}` }),
          d.area ? el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: d.area }) : null),
        el("div", { class: "wr-summary" },
          block("Chose", d.decision), block("Why", d.why), block("Expected", d.expect)),
        editable ? el("div", { class: "tools" },
          el("button", { class: "linkbtn", onclick: () => decidePanel(panel, d, d.chosen, true) }, "Edit"),
          el("span", { class: "small muted", text: "You can edit until tomorrow. After that it stays as you wrote it, so hindsight can't creep in." })) : null));
      root.append(panel);

      if (d.options.some(o => o.pros.length || o.cons.length)) {
        const det = el("details", { class: "card dj-weighed" }, el("summary", { text: "What you weighed up" }));
        d.options.forEach(o => det.append(el("div", { class: "section", style: "gap:4px" },
          el("div", { class: "rowhead" }, el("strong", { style: "font-family:var(--font-display);font-weight:500", text: o.name + (o.id === d.chosen ? " (chosen)" : "") }), el("span", { class: "mono muted", text: signed(score(o)) })),
          ...o.pros.map(p => el("span", { class: "small", text: `+ ${p.text}${p.big ? " ★" : ""}` })),
          ...o.cons.map(c => el("span", { class: "small muted", text: `− ${c.text}${c.big ? " ★" : ""}` })))));
        root.append(det);
      }

      if (d.outcome) {
        const r = RATINGS[d.outcome.rating];
        root.append(el("section", { class: "card dj-outcome" },
          el("div", { class: "rowhead" },
            el("h2", { style: "font-size:20px;font-weight:500", text: "How it turned out" }),
            el("span", { class: "pill", style: `--pc:${r.color}`, text: r.label })),
          el("p", { class: "mono muted", text: `Looked back ${formatDate(d.outcome.reviewedOn)}` }),
          el("div", { class: "wr-summary" }, block("What happened", d.outcome.happened, r.color), block("Next time", d.outcome.lessons, r.color)),
          el("div", { class: "tools" }, el("button", { class: "linkbtn", onclick: () => outcomeCard(d, true) }, "Change this"))));
      } else {
        outcomeCard(d, isDue(d));
      }
      root.append(deleteControl(d));
    }

    function outcomeCard(d, open) {
      const card = el("section", { class: "card dj-outcome", style: "--fc:var(--m-decisions)" });
      const existing = root.querySelector(".dj-outcome");
      if (existing) existing.replaceWith(card);
      else (root.querySelector(".dj-weighed") || root.querySelector(".card")).after(card);
      if (!open) {
        card.append(
          el("h2", { style: "font-size:19px;font-weight:500", text: `Check-in on ${formatDate(d.reviewOn)}` }),
          el("p", { class: "small muted", text: `This will ask how it turned out ${until(d.reviewOn)}. It'll be waiting at the top of the journal and on your home screen.` }),
          el("div", { class: "tools" }, el("button", { class: "linkbtn", onclick: () => outcomeCard(d, true) }, "Look back early")));
        return;
      }
      const prior = all[d.id].outcome;
      let rating = prior?.rating || null;
      const happened = el("textarea", { id: "dj-happened", rows: 3, placeholder: "What actually happened?" });
      const lessons = el("textarea", { id: "dj-lessons", rows: 2, placeholder: "Anything you'd weigh differently next time?" });
      happened.value = prior?.happened || ""; lessons.value = prior?.lessons || "";
      const msg = el("span", { class: "savestate" });
      const ratingChips = el("div", { class: "chips" });
      const draw = () => ratingChips.replaceChildren(...Object.entries(RATINGS).map(([k, r]) =>
        el("button", { type: "button", class: "chip", "aria-pressed": String(rating === k), onclick: () => { rating = k; draw(); } }, r.label)));
      draw();
      card.append(
        el("h2", { style: "font-size:21px", text: "How did it turn out?" }),
        ratingChips,
        el("label", { class: "field" }, el("span", { text: "What happened" }), happened),
        el("label", { class: "field" }, el("span", { text: "Next time" }), lessons),
        el("div", { class: "actions" }, msg, el("button", { class: "btn primary", onclick: () => {
          if (!rating) { msg.textContent = "Pick how it compared to what you expected."; return; }
          if (update(d.id, { outcome: { rating, happened: happened.value, lessons: lessons.value, reviewedOn: today() } })) render();
        } }, "Save")));
    }

    function deleteControl(d) {
      const del = el("div", { class: "tools" });
      const ask = () => del.replaceChildren(
        el("span", { class: "small", text: "Delete this decision for good?" }),
        el("button", { class: "btn small danger", onclick: () => { delete all[d.id]; persist(); navigate(ID); } }, "Delete"),
        el("button", { class: "btn small", onclick: idle }, "Keep it"));
      const idle = () => del.replaceChildren(el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Delete decision"));
      idle();
      return del;
    }

    render();
    const off = store.onChange(ID, () => { all = loadAll(); if (!view) render(); });
    return {
      setView(v) { view = v; all = loadAll(); render(); window.scrollTo(0, 0); },
      unmount() { off(); },
    };
  },
};
