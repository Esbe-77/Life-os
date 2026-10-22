// Decision journal: write a decision down before hindsight can rewrite it,
// then look back when the check-in date comes round.
//
// Data (store key "decisions"):
//   { decisions: { <id>: { id, title, area, decision, why, expect, confidence (50–95),
//                          decidedOn, reviewOn, createdAt, updatedAt,
//                          outcome: null | { rating: "better"|"expected"|"worse", happened, lessons, reviewedOn } } } }

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

function loadAll() { return store.load(ID, { decisions: {} }).decisions || {}; }
function saveAll(decisions) { return store.save(ID, { decisions }); }
const list = all => Object.values(all).filter(d => d && d.id);
const isDue = d => !d.outcome && d.reviewOn <= today();

export default {
  id: ID,
  name: "Decision journal",
  tab: "Decisions",
  icon: "decisions",
  color: "var(--m-decisions)",

  title(view) { return view === "new" ? "New decision" : view ? "Decision" : "Decision journal"; },
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
      all[d.id] = d; added++;
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

    function render() {
      root.replaceChildren();
      if (!view) renderList();
      else if (view === "new") renderForm();
      else if (all[view]) renderDetail(all[view]);
      else root.append(el("p", { class: "muted", text: "That decision isn't on this phone." }));
      window.scrollTo(0, 0);
    }

    // ----- list -----
    function row(d) {
      let pill;
      if (d.outcome) pill = el("span", { class: "pill", style: `--pc:${RATINGS[d.outcome.rating]?.color}`, text: RATINGS[d.outcome.rating]?.label.split(" ")[0] || "Reviewed" });
      else if (isDue(d)) pill = el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: "Look back" });
      else pill = el("span", { class: "pill", text: until(d.reviewOn) });
      return el("a", { class: "row", href: `#/${ID}/${d.id}` },
        el("div", { class: "main" },
          el("span", { class: "title", text: d.title }),
          el("span", { class: "meta", text: `Decided ${formatDate(d.decidedOn)}${d.area ? " · " + d.area : ""}` })),
        pill);
    }

    function renderList() {
      const items = list(all);
      root.append(el("a", { class: "btn primary", href: `#/${ID}/new`, style: "align-self:flex-start" }, "Log a decision"));

      if (!items.length) {
        root.append(el("section", { class: "card empty-state" },
          el("h2", { style: "font-size:21px", text: "Write it down before you know how it ends" }),
          el("p", { class: "muted", text: "Before a meaningful choice (a job, money, a relationship, a big purchase), note what you decided, why, and what you expect. When the check-in date comes, this asks how it turned out. Over time you learn how good your judgment really is, without hindsight rewriting the story." })));
        return;
      }

      const due = items.filter(isDue).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
      const waiting = items.filter(d => !d.outcome && !isDue(d)).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
      const done = items.filter(d => d.outcome).sort((a, b) => (b.outcome.reviewedOn || "").localeCompare(a.outcome.reviewedOn || ""));

      if (due.length) root.append(el("section", { class: "section" },
        el("h2", { text: "Time to look back" }),
        el("p", { class: "small muted", text: "Before reading what you wrote, think for a moment about how it actually went." }),
        el("div", { class: "rows" }, due.map(row))));

      if (done.length >= 3) root.append(insights(done));

      if (waiting.length) root.append(el("section", { class: "section" },
        el("h2", { text: "Waiting to see" }),
        el("div", { class: "rows" }, waiting.map(row))));

      if (done.length) root.append(el("section", { class: "section" },
        el("h2", { text: "Looked back" }),
        el("div", { class: "rows" }, done.map(row))));
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

    // ----- new / edit -----
    // Single-choice chips. With allowNone, tapping the chosen one clears it.
    function choiceChips(options, selected, onPick, allowNone = false) {
      const box = el("div", { class: "chips" });
      const draw = () => {
        box.replaceChildren(...options.map(([v, label]) => el("button", {
          type: "button", class: "chip", "aria-pressed": String(selected() === v),
          onclick: () => { onPick(allowNone && selected() === v ? null : v); draw(); },
        }, label)));
      };
      draw();
      return box;
    }

    function renderForm(existing) {
      const d = existing ? { ...existing } : { area: null, confidence: 80, months: 6 };
      const msg = el("span", { class: "savestate" });
      const title = el("input", { type: "text", id: "dj-title", value: d.title || "", placeholder: "Take the job offer from Northwind?", autocomplete: "off" });
      const decision = el("textarea", { id: "dj-decision", rows: 2, placeholder: "What you're going to do." });
      const why = el("textarea", { id: "dj-why", rows: 3, placeholder: "The reasons you'd give today, including what you're unsure about." });
      const expect = el("textarea", { id: "dj-expect", rows: 3, placeholder: "What you think will happen, as specifically as you can." });
      decision.value = d.decision || ""; why.value = d.why || ""; expect.value = d.expect || "";

      const form = el("form", { class: "card", style: "--fc:var(--m-decisions)" },
        el("label", { class: "field" }, el("span", { text: "What are you deciding?" }), title),
        el("label", { class: "field" }, el("span", { text: "What did you decide?" }), decision),
        el("label", { class: "field" }, el("span", { text: "Why?" }), why),
        el("label", { class: "field" }, el("span", { text: "What do you expect to happen?" }), expect),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "How sure are you?" }),
          choiceChips(CONFIDENCE.map(([v, l]) => [v, l]), () => d.confidence, v => { d.confidence = v; })),
        el("div", { class: "field" }, el("span", { class: "field-label", text: "Area" }),
          choiceChips(AREAS.map(a => [a, a]), () => d.area, v => { d.area = v; }, true)),
        existing ? null : el("div", { class: "field" }, el("span", { class: "field-label", text: "Ask me how it went in" }),
          choiceChips(CHECKIN, () => d.months, v => { d.months = v; })),
        el("div", { class: "actions" },
          el("a", { class: "btn", href: existing ? `#/${ID}/${existing.id}` : `#/${ID}` }, "Cancel"),
          msg,
          el("button", { class: "btn primary", type: "submit" }, existing ? "Save changes" : "Save decision")));

      form.addEventListener("submit", e => {
        e.preventDefault();
        if (!title.value.trim()) { msg.textContent = "Give it a short name first."; title.focus(); return; }
        const now = new Date().toISOString();
        const rec = existing
          ? { ...existing, title: title.value.trim(), decision: decision.value, why: why.value, expect: expect.value, confidence: d.confidence, area: d.area, updatedAt: now }
          : { id: newId(), title: title.value.trim(), decision: decision.value, why: why.value, expect: expect.value, confidence: d.confidence, area: d.area,
              decidedOn: today(), reviewOn: addMonths(today(), d.months), createdAt: now, updatedAt: now, outcome: null };
        all[rec.id] = rec;
        if (persist(msg)) navigate(`${ID}/${rec.id}`);
      });
      root.append(form);
      if (!existing) setTimeout(() => title.focus({ preventScroll: true }), 0);
    }

    // ----- detail -----
    function block(label, text, color = "var(--m-decisions)") {
      return el("div", { class: "wr-ans", style: `--qc:${color}` },
        el("div", {}, el("div", { class: "k", text: label }),
          el("div", { class: "v" + (text?.trim() ? "" : " empty"), text: text?.trim() || "Not written" })));
    }

    function renderDetail(d) {
      const editable = Date.now() - new Date(d.createdAt).getTime() < 24 * 3600 * 1000;
      const conf = CONFIDENCE.find(([v]) => v === d.confidence)?.[1] || `${d.confidence}%`;
      root.append(el("section", { class: "card" },
        el("div", { class: "rowhead" },
          el("h2", { style: "font-size:24px", text: d.title }),
          d.area ? el("span", { class: "pill", style: "--pc:var(--m-decisions)", text: d.area }) : null),
        el("p", { class: "mono muted", text: `Decided ${formatDate(d.decidedOn)} · felt: ${conf.toLowerCase()}` }),
        el("div", { class: "wr-summary" },
          block("Decided", d.decision), block("Why", d.why), block("Expected", d.expect)),
        editable && !d.outcome ? el("div", { class: "tools" },
          el("button", { class: "linkbtn", onclick: () => { root.replaceChildren(); renderForm(d); } }, "Edit"),
          el("span", { class: "small muted", text: "You can edit for a day. After that it stays as you wrote it, so hindsight can't creep in." })) : null));

      if (d.outcome) {
        const r = RATINGS[d.outcome.rating];
        root.append(el("section", { class: "card dj-outcome" },
          el("div", { class: "rowhead" },
            el("h2", { style: "font-size:20px;font-weight:500", text: "How it turned out" }),
            el("span", { class: "pill", style: `--pc:${r.color}`, text: r.label })),
          el("p", { class: "mono muted", text: `Looked back ${formatDate(d.outcome.reviewedOn)}` }),
          el("div", { class: "wr-summary" },
            block("What happened", d.outcome.happened, r.color),
            block("Next time", d.outcome.lessons, r.color)),
          el("div", { class: "tools" }, el("button", { class: "linkbtn", onclick: () => renderOutcomeOnly(d, true) }, "Change this"))));
      } else {
        renderOutcomeOnly(d, isDue(d));
      }

      // delete, with an in-page confirmation
      const del = el("div", { class: "tools" });
      const ask = () => del.replaceChildren(
        el("span", { class: "small", text: "Delete this decision for good?" }),
        el("button", { class: "btn small danger", onclick: () => { delete all[d.id]; persist(); navigate(ID); } }, "Delete"),
        el("button", { class: "btn small", onclick: idle }, "Keep it"));
      const idle = () => del.replaceChildren(el("button", { class: "linkbtn", style: "color:var(--muted)", onclick: ask }, "Delete decision"));
      idle();
      root.append(del);
    }

    function renderOutcomeOnly(d, open) {
      const existingCard = root.querySelector(".dj-outcome");
      const card = el("section", { class: "card dj-outcome", style: "--fc:var(--m-decisions)" });
      existingCard ? existingCard.replaceWith(card) : root.querySelectorAll(".card")[0].after(card);
      if (!open) {
        card.append(
          el("h2", { style: "font-size:19px;font-weight:500", text: `Check-in on ${formatDate(d.reviewOn)}` }),
          el("p", { class: "small muted", text: `This will ask how it turned out ${until(d.reviewOn)}. It'll be waiting at the top of the journal and on your home screen.` }),
          el("div", { class: "tools" }, el("button", { class: "linkbtn", onclick: () => renderOutcomeOnly(d, true) }, "Look back early")));
        return;
      }
      const prior = all[d.id].outcome;
      let rating = prior?.rating || null;
      const happened = el("textarea", { id: "dj-happened", rows: 3, placeholder: "What actually happened?" });
      const lessons = el("textarea", { id: "dj-lessons", rows: 2, placeholder: "Anything you'd weigh differently next time?" });
      happened.value = prior?.happened || ""; lessons.value = prior?.lessons || "";
      const msg = el("span", { class: "savestate" });
      const chips = el("div", { class: "chips" });
      const drawChips = () => chips.replaceChildren(...Object.entries(RATINGS).map(([k, r]) =>
        el("button", { type: "button", class: "chip", "aria-pressed": String(rating === k), onclick: () => { rating = k; drawChips(); } }, r.label)));
      drawChips();
      card.append(
        el("h2", { style: "font-size:21px", text: "How did it turn out?" }),
        chips,
        el("label", { class: "field" }, el("span", { text: "What happened" }), happened),
        el("label", { class: "field" }, el("span", { text: "Next time" }), lessons),
        el("div", { class: "actions" }, msg, el("button", { class: "btn primary", onclick: () => {
          if (!rating) { msg.textContent = "Pick how it compared to what you expected."; return; }
          const now = new Date().toISOString();
          all[d.id] = { ...all[d.id], outcome: { rating, happened: happened.value, lessons: lessons.value, reviewedOn: today() }, updatedAt: now };
          if (persist(msg)) { root.replaceChildren(); renderDetail(all[d.id]); }
        } }, "Save")));
    }

    render();
    const off = store.onChange(ID, () => { all = loadAll(); if (!view) render(); });
    return {
      setView(v) { view = v; all = loadAll(); render(); },
      unmount() { off(); },
    };
  },
};

