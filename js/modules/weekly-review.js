// Weekly review: five questions every Sunday, with a look back over months.
//
// Data (store key "weekly-review"):
//   { reviews: { "<Sunday YYYY-MM-DD>": { week, answers: {well, drained, avoided, matters, drop},
//                                         status: "draft" | "done", createdAt, updatedAt } } }

import * as store from "../store.js";
import { weekLines, needsPlan, planWeek } from "../habits.js";
import goals from "./goals.js";
import { $, el, MONTHS, MONTHS_LONG, isoDate, parseDate, addDays, prefersReducedMotion } from "../ui.js";

const ID = "weekly-review";

const QUESTIONS = [
  { key: "well",    short: "Went well", title: "What went well?",         hint: "Wins, small or large. What made them possible?",                    color: "var(--q-well)" },
  { key: "drained", short: "Drained",   title: "What drained you?",       hint: "People, tasks or situations that took more energy than they gave.", color: "var(--q-drained)" },
  { key: "avoided", short: "Avoided",   title: "What did you avoid?",     hint: "Anything you kept pushing back. Name it plainly.",                  color: "var(--q-avoided)" },
  { key: "matters", short: "Next week", title: "What matters next week?", hint: "One to three things that would make the coming week count.",        color: "var(--q-matters)" },
  { key: "drop",    short: "Drop",      title: "One thing to drop",       hint: "A commitment, habit or worry you'll let go of.",                    color: "var(--q-drop)" },
];

// A week is keyed by its Sunday.
const sundayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return isoDate(x); };
const thisSunday = () => sundayOf(new Date());
function weekLabel(sun) {
  const end = parseDate(sun), start = parseDate(addDays(sun, -6));
  const s = start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  return `${s}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
}
const emptyAnswers = () => Object.fromEntries(QUESTIONS.map(q => [q.key, ""]));

// ---------- data ----------
function loadReviews() { return store.load(ID, { reviews: {} }).reviews || {}; }
function allReviews(reviews) { return Object.values(reviews).filter(r => r && r.week).sort((a, b) => b.week.localeCompare(a.week)); }

// ---------- module ----------
export default {
  id: ID,
  name: "Weekly review",
  tab: "Review",
  icon: "review",
  color: "var(--m-review)",
  views: [["", "This week"], ["lookback", "Look back"]],

  hasData() { return Object.keys(loadReviews()).length > 0; },

  // For the dashboard: the latest finished review's plans for this week.
  latest() { return allReviews(loadReviews()).find(r => r.status === "done") || null; },
  weekLabel,
  thisSunday,

  summary() {
    const list = allReviews(loadReviews()).filter(r => r.status === "done");
    const sun = thisSunday();
    const doneThisWeek = list.some(r => r.week === sun);
    if (!list.length) return { text: "No reviews yet. Your first one takes about ten minutes.", due: true };
    const last = list[0];
    return {
      text: doneThisWeek ? "This week's review is done." : `Last reviewed: week of ${weekLabel(last.week)}.`,
      due: !doneThisWeek && new Date().getDay() === 0,
    };
  },

  exportData() {
    return { reviews: allReviews(loadReviews()) };
  },

  // Accepts this module's export, or the original web version's backup
  // ({ app: "weekly-review", reviews: [...] }). Newer edits win.
  importData(data) {
    const list = Array.isArray(data) ? data : data?.reviews;
    if (!Array.isArray(list)) return null;
    const reviews = loadReviews();
    let added = 0, kept = 0;
    for (const r of list) {
      if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.week || "") || typeof r.answers !== "object" || !r.answers) continue;
      const existing = reviews[r.week];
      if (existing && (existing.updatedAt || "") >= (r.updatedAt || "")) { kept++; continue; }
      const now = new Date().toISOString();
      reviews[r.week] = {
        week: r.week,
        answers: Object.fromEntries(QUESTIONS.map(q => [q.key, String(r.answers[q.key] || "")])),
        status: r.status === "draft" ? "draft" : "done",
        createdAt: r.createdAt || now,
        updatedAt: r.updatedAt || now,
      };
      added++;
    }
    if (added && !store.save(ID, { reviews })) return { error: "Your phone refused to save. Free up some storage and try again." };
    return { added, kept, noun: ["week", "weeks"] };
  },

  mount(root, { view, navigate }) {
    const s = {
      reviews: loadReviews(),
      week: thisSunday(),
      step: 0,
      draft: emptyAnswers(),
      dirty: false,
      saveMsg: "",
      range: "6m",
      query: "",
      demo: false,
      realReviews: null,
    };

    // ----- saving -----
    let saveTimer = null;
    function loadWeekIntoDraft() {
      const r = s.reviews[s.week];
      s.draft = Object.assign(emptyAnswers(), r ? r.answers : {});
      s.dirty = false;
      s.saveMsg = r ? (r.status === "done" ? "Saved" : "Draft saved") : "";
      const firstEmpty = QUESTIONS.findIndex(q => !s.draft[q.key].trim());
      s.step = r && r.status === "done" ? 5 : Math.max(0, firstEmpty);
    }
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveNow(), 800); }
    function saveNow(finish = false) {
      clearTimeout(saveTimer);
      const existing = s.reviews[s.week];
      if (!finish && !s.dirty) return;
      const hasText = QUESTIONS.some(q => s.draft[q.key].trim());
      if (!hasText && !existing) { s.dirty = false; return; }
      const now = new Date().toISOString();
      const status = finish || existing?.status === "done" ? "done" : "draft";
      s.reviews[s.week] = { week: s.week, answers: { ...s.draft }, status, createdAt: existing?.createdAt || now, updatedAt: now };
      s.dirty = false;
      if (s.demo) { s.saveMsg = "Example only, not saved"; return; }
      s.saveMsg = store.save(ID, { reviews: s.reviews })
        ? (status === "done" ? "Saved" : "Draft saved")
        : "Couldn't save. Your phone may be out of storage.";
      const n = $("#wr-savestate", root); if (n) n.textContent = s.saveMsg;
    }

    // ----- shared bits -----
    const prevReview = week => allReviews(s.reviews).find(r => r.week < week);
    function answersBlock(answers, query = "") {
      const box = el("div", { class: "wr-summary" });
      QUESTIONS.forEach(q => {
        const v = (answers[q.key] || "").trim();
        const vn = el("div", { class: "v" + (v ? "" : " empty") });
        if (!v) vn.textContent = "No answer"; else highlight(vn, v, query);
        box.append(el("div", { class: "wr-ans", style: `--qc:${q.color}` }, el("div", {}, el("div", { class: "k", text: q.short }), vn)));
      });
      return box;
    }
    function highlight(node, text, query) {
      if (!query) { node.textContent = text; return; }
      const lower = text.toLowerCase(), ql = query.toLowerCase();
      let i = 0, j;
      while ((j = lower.indexOf(ql, i)) !== -1) { node.append(text.slice(i, j), el("mark", { text: text.slice(j, j + ql.length) })); i = j + ql.length; }
      node.append(text.slice(i));
    }
    function demoBanner() {
      return el("div", { class: "demo-banner" }, el("span", { text: "Showing example weeks. Nothing here is saved." }), el("button", { class: "btn", onclick: endDemo }, "Back to my reviews"));
    }

    // ----- This week -----
    function renderReview() {
      root.replaceChildren();
      if (s.demo) root.append(demoBanner());
      const sun = thisSunday();
      const r = s.reviews[s.week];
      root.append(el("div", { class: "wr-weekbar" },
        el("button", { class: "iconbtn", "aria-label": "Previous week", onclick: () => switchWeek(addDays(s.week, -7)) }, "‹"),
        el("div", { class: "label" },
          el("strong", { text: `Week of ${weekLabel(s.week)}` }),
          el("span", { class: "mono muted", text: s.week === sun ? "This Sunday" + (new Date().getDay() === 0 ? " · today" : "") : (r ? (r.status === "done" ? "Reviewed" : "Draft") : "Not reviewed") })),
        el("button", { class: "iconbtn", "aria-label": "Next week", disabled: s.week >= sun, onclick: () => switchWeek(addDays(s.week, 7)) }, "›")));

      const steps = el("div", { class: "wr-steps" });
      QUESTIONS.forEach((q, i) => steps.append(el("button", {
        style: `--qc:${q.color}`,
        class: [s.draft[q.key].trim() ? "filled" : "", s.step === i ? "current" : ""].join(" "),
        "aria-label": `${i + 1}. ${q.title}`, onclick: () => goStep(i),
      }, el("span", { class: "bar" }), el("span", { class: "name", text: q.short }))));
      root.append(steps);
      root.append(s.step < 5 ? questionCard(s.step) : summaryCard());
    }

    function questionCard(i) {
      const q = QUESTIONS[i];
      const prev = prevReview(s.week);
      const card = el("section", { class: "card wr-q", style: `--qc:${q.color}` },
        el("div", { class: "wr-qnum", text: `Question ${i + 1} of 5` }),
        el("h2", { class: "wr-qtitle", text: q.title }),
        el("p", { class: "wr-qhint", text: q.hint }));

      // Bring last week's intentions back where they help.
      const ctxFor = { well: ["Last week you said this mattered", "matters"], avoided: ["Last week you avoided", "avoided"], drop: ["Last week you chose to drop", "drop"] }[q.key];
      if (prev && ctxFor && prev.answers?.[ctxFor[1]]?.trim()) {
        card.append(el("div", { class: "wr-context" }, el("span", { class: "mono", text: ctxFor[0] }), el("span", { class: "prewrap", text: prev.answers[ctxFor[1]] })));
      }

      const ta = el("textarea", { id: "wr-answer-" + q.key, "aria-label": q.title, rows: q.key === "drop" ? 3 : 6, placeholder: "Write freely. Bullet points are fine." });
      if (q.key === "drop") ta.style.minHeight = "96px";
      ta.value = s.draft[q.key];
      ta.addEventListener("input", () => {
        s.draft[q.key] = ta.value; s.dirty = true;
        root.querySelectorAll(".wr-steps button").forEach((b, k) => b.classList.toggle("filled", !!s.draft[QUESTIONS[k].key].trim()));
        scheduleSave();
      });
      ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); goStep(i + 1); } });
      card.append(ta);
      card.append(el("div", { class: "actions" },
        el("button", { class: "btn", disabled: i === 0, onclick: () => goStep(i - 1) }, "Back"),
        el("span", { class: "savestate", id: "wr-savestate", text: s.saveMsg }),
        el("button", { class: "btn primary", onclick: () => i === 4 ? finish() : goStep(i + 1) }, i === 4 ? "Finish review" : "Next")));
      return card;
    }

    function summaryCard() {
      const r = s.reviews[s.week];
      return el("section", { class: "card" },
        el("div", { class: "rowhead" },
          el("h2", { style: "font-size:24px", text: r?.status === "done" ? "Review saved" : "Your answers" }),
          el("span", { class: "savestate", id: "wr-savestate", text: s.saveMsg })),
        answersBlock(s.draft),
        habitsBlock(),
        goalsBlock(),
        el("div", { class: "actions" },
          el("button", { class: "btn", onclick: () => goStep(0) }, "Edit answers"),
          el("button", { class: "btn primary", onclick: () => navigate(ID + "/lookback") }, "Look back over past weeks")));
    }

    // How the week's habits went, and a way into planning the next week.
    function habitsBlock() {
      if (s.demo) return null;
      const lines = weekLines(addDays(s.week, -6));
      const canPlan = s.week === thisSunday() && planWeek() > s.week && needsPlan().length > 0;
      if (!lines.length) return null;
      return el("div", { class: "wr-ans", style: "--qc:var(--m-habits)" },
        el("div", {},
          el("div", { class: "k", text: "Habits this week" }),
          lines.map(l => el("div", { class: "v small" }, `${l.name}: `, el("span", { class: "muted", text: l.text }))),
          canPlan ? el("a", { class: "btn small", href: "#/home/plan", style: "margin-top:10px;display:inline-flex" }, "Plan next week's habits") : null));
    }

    // Where each active goal stands, with its next step.
    function goalsBlock() {
      if (s.demo || s.week !== thisSunday()) return null;
      const list = goals.activeGoals();
      if (!list.length) return null;
      return el("div", { class: "wr-ans", style: "--qc:var(--m-goals)" },
        el("div", {},
          el("div", { class: "k", text: "Goals" }),
          list.map(g => {
            const next = goals.nextStep(g);
            return el("div", { class: "v small" }, el("a", { href: `#/goals/${g.id}`, text: g.title }), " ",
              el("span", { class: "muted", text: `${goals.stepsText(g)}${next ? `. Next: ${next.text}` : ""}` }));
          }),
          el("a", { class: "btn small", href: "#/goals", style: "margin-top:10px;display:inline-flex" }, "Update goals")));
    }

    function goStep(i) { saveNow(); s.step = Math.max(0, Math.min(5, i)); renderReview(); }
    function finish() { saveNow(true); s.step = 5; renderReview(); }
    function switchWeek(w) { saveNow(); s.week = w; loadWeekIntoDraft(); renderReview(); }

    // ----- Look back -----
    const RANGES = [["3m", "3 months", 13], ["6m", "6 months", 26], ["1y", "1 year", 52], ["all", "All", null]];

    function renderLookback() {
      root.replaceChildren();
      if (s.demo) root.append(demoBanner());
      const everything = allReviews(s.reviews);
      const sun = thisSunday();

      if (!everything.length) {
        root.append(el("section", { class: "card empty-state" },
          el("h2", { style: "font-size:22px", text: "Your past weeks will collect here" }),
          el("p", { class: "muted", text: "After a few Sundays you'll see which weeks you reviewed, the words that keep coming back in each answer, and every past review in one searchable list." }),
          el("div", { class: "tools center" },
            el("button", { class: "btn primary", onclick: () => navigate(ID) }, "Start this week's review"),
            el("button", { class: "btn", onclick: startDemo }, "Preview with example weeks"))));
        return;
      }

      const range = RANGES.find(r => r[0] === s.range);
      const cutoff = range[2] ? addDays(sun, -7 * (range[2] - 1)) : everything[everything.length - 1].week;
      const inRange = everything.filter(r => r.week >= cutoff);

      root.append(el("div", { class: "chips", role: "group", "aria-label": "Time range" },
        RANGES.map(([id, label]) => el("button", { class: "chip", "aria-pressed": String(s.range === id), onclick: () => { s.range = id; renderLookback(); } }, label))));

      // Rhythm: one square per Sunday in range.
      const weeks = [];
      for (let w = sun; w >= cutoff; w = addDays(w, -7)) weeks.push(w);
      weeks.reverse();
      const done = inRange.filter(r => r.status === "done").length;
      const rhythm = el("div", { class: "wr-rhythm" });
      weeks.forEach(w => {
        const r = s.reviews[w];
        rhythm.append(el("button", {
          class: r ? r.status : "",
          title: `${weekLabel(w)}${r ? "" : " · not reviewed"}`,
          "aria-label": `Week of ${weekLabel(w)}, ${r ? (r.status === "done" ? "reviewed" : "draft") : "not reviewed"}`,
          onclick: () => r ? jumpTo(w) : openWeek(w),
        }));
      });
      root.append(el("section", { class: "section" },
        el("div", { class: "rowhead" }, el("h2", { text: "Rhythm" }), el("span", { class: "mono muted", text: `${done} of ${weeks.length} Sundays reviewed` })),
        rhythm,
        el("div", { class: "wr-legend mono muted" },
          el("span", {}, el("i", { class: "done" }), "Reviewed"), el("span", {}, el("i", { class: "draft" }), "Started"), el("span", {}, el("i"), "Missed"))));

      // Patterns: words that recur across weeks, per question.
      const pats = el("div", { class: "wr-patterns" });
      QUESTIONS.forEach(q => {
        const top = patternsFor(inRange, q.key);
        pats.append(el("div", { class: "wr-pat", style: `--qc:${q.color}` },
          el("h3", { text: q.title }),
          top.length
            ? el("div", { class: "words" }, top.map(([w, n]) => el("button", {
                class: "wr-word", title: `Appears in ${n} weeks. Show them.`,
                onclick: () => { s.query = w; renderLookback(); $("#wr-search", root)?.scrollIntoView({ block: "start" }); },
              }, w, el("b", { text: `×${n}` }))))
            : el("div", { class: "none", text: inRange.length < 2 ? "Needs a couple of weeks first." : "Nothing repeats yet." })));
      });
      root.append(el("section", { class: "section" },
        el("div", { class: "rowhead" }, el("h2", { text: "What keeps coming up" }), el("span", { class: "mono muted", text: "words in 2+ weeks" })),
        pats));

      // Past weeks, searchable.
      const search = el("input", { id: "wr-search", class: "search", type: "search", placeholder: "Search your answers", "aria-label": "Search your answers", value: s.query });
      const listBox = el("div", { class: "section" });
      const drawList = () => {
        listBox.replaceChildren();
        const ql = s.query.trim().toLowerCase();
        const shown = (ql ? everything : inRange).filter(r => !ql || QUESTIONS.some(q => (r.answers?.[q.key] || "").toLowerCase().includes(ql)));
        if (ql) listBox.append(el("div", { class: "mono muted", text: `${shown.length} ${shown.length === 1 ? "week mentions" : "weeks mention"} “${s.query.trim()}” (all time)` }));
        let month = "";
        shown.forEach(r => {
          const d = parseDate(r.week), m = `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
          if (m !== month) { month = m; listBox.append(el("div", { class: "month", text: m })); }
          listBox.append(el("article", { class: "card wr-entry", id: "wr-wk-" + r.week },
            el("div", { class: "rowhead" },
              el("h3", { text: `Week of ${weekLabel(r.week)}` }),
              el("span", { class: "tools" },
                r.status !== "done" ? el("span", { class: "mono muted", text: "draft" }) : null,
                el("button", { class: "linkbtn", onclick: () => openWeek(r.week) }, "Edit"))),
            answersBlock(r.answers || {}, s.query.trim())));
        });
        if (!shown.length) listBox.append(el("p", { class: "muted", text: "No weeks match." }));
      };
      search.addEventListener("input", () => { s.query = search.value; drawList(); });
      root.append(el("section", { class: "section" }, el("h2", { text: "Past weeks" }), search, listBox));
      drawList();
    }

    function openWeek(w) { saveNow(); s.week = w; loadWeekIntoDraft(); if (!s.reviews[w]) s.step = 0; navigate(ID); }
    function jumpTo(w) {
      s.query = "";
      if (!document.getElementById("wr-wk-" + w) || $("#wr-search", root)?.value) { s.range = "all"; renderLookback(); }
      const t = document.getElementById("wr-wk-" + w);
      if (!t) return;
      t.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      t.classList.add("flash"); setTimeout(() => t.classList.remove("flash"), 1600);
    }

    // ----- example data (in memory only) -----
    function startDemo() {
      saveNow();
      s.realReviews = s.reviews;
      const samples = [
        ["Finished the quarterly plan early. Long walk on Saturday.", "Back-to-back meetings Tuesday. Inbox triage at night.", "Calling the dentist. Budget spreadsheet.", "Ship the onboarding draft. Two early nights.", "Checking email after 9pm."],
        ["Good one-on-one with Priya. Cooked twice.", "Late nights on the onboarding draft. Meetings ran over.", "The budget spreadsheet again.", "Budget spreadsheet, 30 minutes Monday. Gym twice.", "Saying yes to every meeting invite."],
        ["Budget spreadsheet done. Gym twice.", "Inbox at night crept back.", "Hard conversation with landlord.", "Landlord email. Protect Thursday morning for deep work.", "Doomscrolling before bed."],
        ["Deep work Thursday morning felt great.", "Meetings Monday and Tuesday, back-to-back.", "Landlord email.", "Landlord email first thing. Long walk.", "Optional meetings."],
        ["Sent the landlord email. Weekend hike.", "Travel day. Poor sleep.", "Gym.", "Rest. Plan the offsite.", "Checking email after 9pm."],
        ["Offsite plan approved. Walk with a friend.", "Meetings ran long again.", "Gym, dentist.", "Dentist call. Two gym sessions.", "Late-night inbox."],
      ];
      const demo = {};
      const sun = thisSunday();
      samples.forEach((a, i) => {
        const w = addDays(sun, -7 * (samples.length - i + (i > 3 ? 0 : 1))); // leaves one missed week
        demo[w] = { week: w, answers: Object.fromEntries(QUESTIONS.map((q, k) => [q.key, a[k]])), status: "done", createdAt: "", updatedAt: "" };
      });
      s.reviews = demo; s.demo = true; loadWeekIntoDraft(); render();
    }
    function endDemo() { s.reviews = s.realReviews || loadReviews(); s.realReviews = null; s.demo = false; s.query = ""; loadWeekIntoDraft(); render(); }

    function render() { view === "lookback" ? renderLookback() : renderReview(); }

    loadWeekIntoDraft();
    render();

    const offChange = store.onChange(ID, () => {
      if (s.demo) return;
      s.reviews = loadReviews();
      if (view === "lookback") renderLookback(); // don't disturb an answer being typed
    });
    const onHide = () => { if (document.visibilityState === "hidden") saveNow(); };
    document.addEventListener("visibilitychange", onHide);

    return {
      // Called when the person moves to another view of this module.
      setView(v) { saveNow(); view = v; render(); },
      unmount() { saveNow(); offChange(); document.removeEventListener("visibilitychange", onHide); },
    };
  },
};

const STOP = new Set(("a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing done dont down during each even few for from get got had has have having he her here hers him his how i id if im in into is it its itself ive just keep kept less let like lot lots made make many me more most much my myself need next no nor not now of off on once one only or other our out over own really same she should so some still such than that the their them then there these they thing things this those through time to too try under until up us very was way we week weeks well went were what when where which while who why will with would yet you your bit felt feel getting going maybe sure twice two three ran").split(" "));
function words(text) {
  return (text || "").toLowerCase().replace(/[’']/g, "").match(/[a-z][a-z-]{2,}/g)?.filter(w => !STOP.has(w)) || [];
}
function patternsFor(list, key) {
  const counts = new Map();
  list.forEach(r => new Set(words(r.answers?.[key])).forEach(w => counts.set(w, (counts.get(w) || 0) + 1)));
  return [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
}
