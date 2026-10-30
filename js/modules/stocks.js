// Stocks: a calm look at the markets. For the ASX 200, S&P 500 and Nasdaq 100
// it shows how the index is moving, its ten biggest companies and the latest
// headlines; tap any of them for a chart over a day, a week, months or years.
//
// Prices come from Yahoo Finance's public chart data and headlines from Google
// News, fetched on demand through js/net.js. Nothing is stored except the
// chart range you last picked, and nothing goes in backups.

import * as store from "../store.js";
import { el } from "../ui.js";
import { getJSON, getText } from "../net.js";

const ID = "stocks";

// The ten biggest companies in each index by size. Set by hand: update the
// list now and then as the order shifts.
const MARKETS = {
  "": {
    name: "ASX 200", index: "^AXJO", news: "ASX 200 shares", region: ["en-AU", "AU"], tz: "Sydney",
    stocks: [["CBA.AX", "Commonwealth Bank"], ["BHP.AX", "BHP"], ["NAB.AX", "NAB"], ["WBC.AX", "Westpac"], ["ANZ.AX", "ANZ"],
      ["CSL.AX", "CSL"], ["WES.AX", "Wesfarmers"], ["MQG.AX", "Macquarie Group"], ["GMG.AX", "Goodman Group"], ["RIO.AX", "Rio Tinto"]],
  },
  sp: {
    name: "S&P 500", index: "^GSPC", news: "S&P 500 stock market", region: ["en-US", "US"], tz: "New York",
    stocks: [["NVDA", "Nvidia"], ["MSFT", "Microsoft"], ["AAPL", "Apple"], ["AMZN", "Amazon"], ["GOOGL", "Alphabet"],
      ["META", "Meta"], ["AVGO", "Broadcom"], ["TSLA", "Tesla"], ["BRK-B", "Berkshire Hathaway"], ["JPM", "JPMorgan Chase"]],
  },
  ndx: {
    name: "Nasdaq 100", index: "^NDX", news: "Nasdaq stocks", region: ["en-US", "US"], tz: "New York",
    stocks: [["NVDA", "Nvidia"], ["MSFT", "Microsoft"], ["AAPL", "Apple"], ["AMZN", "Amazon"], ["GOOGL", "Alphabet"],
      ["META", "Meta"], ["AVGO", "Broadcom"], ["TSLA", "Tesla"], ["NFLX", "Netflix"], ["COST", "Costco"]],
  },
};
const RANGES = [["1d", "1D", "5m"], ["5d", "1W", "30m"], ["1mo", "1M", "1d"], ["6mo", "6M", "1d"], ["1y", "1Y", "1d"], ["5y", "5Y", "1wk"]];

// ---------- data ----------
const cache = new Map(); // url -> { at, promise }
function cached(url, ttl, load) {
  const c = cache.get(url);
  if (c && Date.now() - c.at < ttl) return c.promise;
  const promise = load(url);
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  return promise;
}

function chart(symbol, range = "1d") {
  const [, , interval] = RANGES.find(r => r[0] === range) || RANGES[0];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  return cached(url, range === "1d" || range === "5d" ? 60e3 : 30 * 60e3, u => getJSON(u).then(j => {
    const r = j?.chart?.result?.[0];
    if (!r?.meta) throw new Error("no data");
    const closes = r.indicators?.quote?.[0]?.close || [];
    const points = (r.timestamp || []).map((t, i) => [t * 1000, closes[i]]).filter(([, c]) => c != null);
    const m = r.meta;
    const price = m.regularMarketPrice ?? points.at(-1)?.[1];
    // For a day, compare with yesterday's close; for longer, with where the range began.
    const base = range === "1d" ? (m.chartPreviousClose ?? m.previousClose) : (points[0]?.[1] ?? m.chartPreviousClose);
    const p = m.currentTradingPeriod?.regular;
    return {
      price, base, points, currency: m.currency, tz: m.exchangeTimezoneName,
      at: (m.regularMarketTime || 0) * 1000,
      session: p ? [p.start * 1000, p.end * 1000] : null,
      dayLow: m.regularMarketDayLow, dayHigh: m.regularMarketDayHigh,
      yearLow: m.fiftyTwoWeekLow, yearHigh: m.fiftyTwoWeekHigh,
    };
  }));
}

function news(query, [hl, gl]) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:3d")}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;
  return cached(url, 10 * 60e3, u => getText(u).then(xml => {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    return [...doc.querySelectorAll("item")].slice(0, 6).map(it => {
      const source = it.querySelector("source")?.textContent?.trim() || "";
      let title = it.querySelector("title")?.textContent?.trim() || "";
      if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
      return { title, source, link: it.querySelector("link")?.textContent?.trim() || "", at: Date.parse(it.querySelector("pubDate")?.textContent || "") };
    }).filter(n => n.title && /^https:\/\//.test(n.link));
  }));
}

// ---------- formatting ----------
const num = (n, d = 2) => n == null || !isFinite(n) ? "–" : n.toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n, cur) => (cur === "AUD" ? "A$" : cur === "USD" ? "$" : "") + num(n);
const signed = (n, d = 2) => (n > 0 ? "+" : n < 0 ? "−" : "") + num(Math.abs(n), d);
function change(q) {
  const diff = q.price - q.base, pct = q.base ? diff / q.base * 100 : 0;
  return { diff, pct, dir: diff > 0 ? "up" : diff < 0 ? "down" : "flat" };
}
const pill = (c, withDiff) => el("span", { class: `pill st-${c.dir}`, text: (withDiff ? signed(c.diff) + "  " : "") + signed(c.pct) + "%" });
function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (!isFinite(m)) return "";
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
function timeIn(t, tz, withDay) {
  try {
    return new Date(t).toLocaleString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", ...(withDay ? { weekday: "short" } : {}) }).replace(/\s?([ap])m/i, (_, x) => x.toLowerCase() + "m");
  } catch { return ""; }
}
function dateIn(t, tz, range) {
  const opts = range === "1d" ? { hour: "numeric", minute: "2-digit" }
    : range === "5d" ? { weekday: "short", hour: "numeric", minute: "2-digit" }
    : range === "5y" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", ...(range === "1y" ? { year: "2-digit" } : {}) };
  try { return new Date(t).toLocaleString("en-AU", { timeZone: tz, ...opts }).replace(/\s?([ap])m/i, (_, x) => x.toLowerCase() + "m"); } catch { return ""; }
}
function status(q, place) {
  const open = q.session && Date.now() >= q.session[0] && Date.now() < q.session[1];
  return open ? `Open · updated ${timeIn(q.at, q.tz)} ${place} time` : `Closed · last trade ${timeIn(q.at, q.tz, true)} ${place} time`;
}

// ---------- charts ----------
const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

// A line with a soft fill under it, green when up over the range and red when down.
function lineChart(q, { width, height, range = "1d", dir, baseline = true }) {
  const pts = q.points;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", class: `st-chart st-${dir}`, "aria-hidden": "true" });
  if (pts.length < 2) return svg;
  const ys = pts.map(p => p[1]).concat(baseline && q.base ? [q.base] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  // A day's chart spans the whole session, so the line grows across it as the day goes.
  const [t0, t1] = range === "1d" && q.session && pts.at(-1)[0] <= q.session[1] ? q.session : [pts[0][0], pts.at(-1)[0]];
  const x = t => (t - t0) / (t1 - t0 || 1) * width, y = v => height - (v - lo) / (hi - lo) * height;
  const line = pts.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const id = "g" + Math.random().toString(36).slice(2, 8);
  const grad = svgEl("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svgEl("stop", { offset: "0", "stop-color": "currentColor", "stop-opacity": ".28" }), svgEl("stop", { offset: "1", "stop-color": "currentColor", "stop-opacity": "0" }));
  const defs = svgEl("defs", {}); defs.append(grad);
  svg.append(defs,
    svgEl("path", { d: `${line}L${x(pts.at(-1)[0]).toFixed(1)},${height}L${x(pts[0][0]).toFixed(1)},${height}Z`, fill: `url(#${id})`, stroke: "none" }),
    svgEl("path", { d: line, fill: "none", stroke: "currentColor", "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
  if (baseline && q.base) svg.append(svgEl("line", { x1: 0, x2: width, y1: y(q.base), y2: y(q.base), class: "st-base", "vector-effect": "non-scaling-stroke" }));
  svg.__scale = { x, y, t0, t1 };
  return svg;
}

// The big chart on a stock's page: touch or drag along it to read a price.
function bigChart(q, range, dir, readout, fallback) {
  const W = 340, H = 190;
  const svg = lineChart(q, { width: W, height: H, range, dir, baseline: range === "1d" });
  const wrap = el("div", { class: "st-big" }, svg);
  if (q.points.length < 2) { wrap.append(el("p", { class: "small muted st-empty", text: "No trades to chart yet." })); return wrap; }
  const cursor = el("div", { class: "st-cursor", hidden: true }), dot = el("div", { class: `st-dot st-${dir}`, hidden: true });
  wrap.append(cursor, dot);
  const { x, y } = svg.__scale;
  const show = e => {
    const r = wrap.getBoundingClientRect();
    const fx = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * W;
    let best = q.points[0];
    for (const p of q.points) if (Math.abs(x(p[0]) - fx) < Math.abs(x(best[0]) - fx)) best = p;
    const px = x(best[0]) / W * r.width, py = y(best[1]) / H * r.height;
    cursor.hidden = dot.hidden = false;
    cursor.style.left = `${px}px`; dot.style.left = `${px}px`; dot.style.top = `${py}px`;
    readout.textContent = `${money(best[1], q.currency)} · ${dateIn(best[0], q.tz, range)}`;
  };
  const hide = () => { cursor.hidden = dot.hidden = true; readout.textContent = fallback; };
  wrap.addEventListener("pointerdown", e => { wrap.setPointerCapture?.(e.pointerId); show(e); });
  wrap.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || e.buttons) show(e); });
  wrap.addEventListener("pointerup", hide);
  wrap.addEventListener("pointercancel", hide);
  wrap.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hide(); });
  return wrap;
}

// ---------- the module ----------
const parseView = view => {
  const m = /^q\/(\w*)\/(.+)$/.exec(view || "");
  return m ? { market: m[1] in MARKETS ? m[1] : "", symbol: decodeURIComponent(m[2]) } : null;
};
const nameOf = (market, symbol) => {
  const mk = MARKETS[market];
  return symbol === mk.index ? mk.name : (mk.stocks.find(s => s[0] === symbol)?.[1] || symbol);
};
const showSymbol = s => s.replace(/\.AX$/, "").replace(/^\^/, "");

export default {
  id: ID,
  name: "Stocks",
  tab: "Stocks",
  icon: "stocks",
  color: "var(--m-stocks)",
  views: Object.entries(MARKETS).map(([v, m]) => [v, m.name]),

  title(view) { const d = parseView(view); return d ? nameOf(d.market, d.symbol) : "Markets"; },
  subtitle(view) {
    const d = parseView(view);
    if (!d) return "";
    return d.symbol === MARKETS[d.market].index ? "Index" : `${showSymbol(d.symbol)} · ${MARKETS[d.market].name}`;
  },
  backTo(view) { const d = parseView(view); return d ? ID + (d.market ? "/" + d.market : "") : null; },
  hasData() { return false; },

  mount(root, { view }) {
    let token = 0, timer = null;

    function render() {
      const my = ++token, y = window.scrollY;
      root.replaceChildren();
      const d = parseView(view);
      d ? renderStock(d, my) : renderMarket(view in MARKETS ? view : "", my);
      window.scrollTo(0, y);
    }
    const live = my => my === token && root.isConnected;

    function failCard(text) {
      return el("div", { class: "card st-fail" },
        el("p", { class: "small", text }),
        window.LifeOSAndroid ? null : el("p", { class: "small muted", text: "Prices and news load in the Android app; a web browser may block them." }),
        el("div", { class: "tools" }, el("button", { class: "btn small", onclick: () => { cache.clear(); render(); } }, "Try again")));
    }

    function newsSection(query, region, my) {
      const sec = el("section", { class: "section" }, el("h2", { text: "In the news" }), el("p", { class: "small muted", text: "Loading headlines…" }));
      news(query, region).then(items => {
        if (!live(my)) return;
        sec.lastChild.replaceWith(items.length
          ? el("div", { class: "rows" }, items.map(n => el("a", { class: "row", href: n.link, rel: "noopener" },
              el("div", { class: "main" },
                el("span", { class: "title st-headline", text: n.title }),
                el("span", { class: "meta", text: [n.source, ago(n.at)].filter(Boolean).join(" · ") })))))
          : el("p", { class: "small muted", text: "No headlines in the last few days." }));
      }).catch(() => { if (live(my)) sec.lastChild.replaceWith(el("p", { class: "small muted", text: "Couldn't load the news just now." })); });
      return sec;
    }

    // ----- an index: how it's moving, its biggest ten, and the news -----
    function renderMarket(key, my) {
      const mk = MARKETS[key];
      const head = el("a", { class: "card st-index", href: `#/${ID}/q/${key}/${encodeURIComponent(mk.index)}` },
        el("span", { class: "mono muted", text: mk.name.toUpperCase() }), el("p", { class: "small muted", text: "Loading…" }));
      const list = el("div", { class: "rows" }, mk.stocks.map(([sym, name]) => {
        const right = el("span", { class: "st-right" }, el("span", { class: "mono muted", text: "…" }));
        const spark = el("span", { class: "st-spark" });
        const row = el("a", { class: "row st-row", href: `#/${ID}/q/${key}/${encodeURIComponent(sym)}` },
          el("div", { class: "main" }, el("span", { class: "title", text: name }), el("span", { class: "meta mono", text: showSymbol(sym) })),
          spark, right);
        chart(sym).then(q => {
          if (!live(my)) return;
          const c = change(q);
          spark.replaceChildren(lineChart(q, { width: 60, height: 24, dir: c.dir }));
          right.replaceChildren(el("span", { class: "mono st-price", text: money(q.price, q.currency) }), pill(c));
        }).catch(() => { if (live(my)) right.replaceChildren(el("span", { class: "mono muted", text: "–" })); });
        return row;
      }));
      root.append(head,
        el("section", { class: "section" }, el("h2", { text: "Biggest 10" }), list),
        newsSection(mk.news, mk.region, my));

      chart(mk.index).then(q => {
        if (!live(my)) return;
        const c = change(q);
        head.replaceChildren(
          el("div", { class: "rowhead" }, el("span", { class: "mono muted", text: mk.name.toUpperCase() }), pill(c, true)),
          el("span", { class: "st-big-price", text: num(q.price) }),
          el("div", { class: "st-index-chart" }, lineChart(q, { width: 320, height: 70, dir: c.dir })),
          el("span", { class: "small muted", text: status(q, mk.tz) }));
      }).catch(() => { if (live(my)) head.replaceWith(failCard("Couldn't reach the markets just now. Check your connection and try again.")); });
    }

    // ----- one stock (or index): price, chart over a chosen range, news -----
    function renderStock({ market, symbol }, my) {
      const mk = MARKETS[market], name = nameOf(market, symbol), isIndex = symbol === mk.index;
      let range = RANGES.some(r => r[0] === store.getMeta().stocksRange) ? store.getMeta().stocksRange : "1d";
      const top = el("div", { class: "card st-detail" }, el("p", { class: "small muted", text: "Loading…" }));
      const chips = el("div", { class: "st-ranges", role: "group", "aria-label": "Chart range" });
      const drawChips = () => chips.replaceChildren(...RANGES.map(([r, label]) => el("button", {
        type: "button", class: "chip", "aria-pressed": String(r === range),
        onclick: () => { range = r; store.setMeta({ stocksRange: r }); drawChips(); load(); },
      }, label)));
      drawChips();
      root.append(top, newsSection(isIndex ? mk.news : `${name} ${mk.region[1] === "AU" ? "shares" : "stock"}`, mk.region, my));

      let seen = 0;
      function load() {
        const mine = ++seen;
        Promise.all([chart(symbol, range), range === "1d" ? null : chart(symbol, "1d")]).then(([q, day]) => {
          if (!live(my) || mine !== seen) return;
          day = day || q;
          const c = change(q), label = RANGES.find(r => r[0] === range)[1];
          const fallback = range === "1d" ? "Today" : `Over ${{ "1W": "the week", "1M": "the month", "6M": "6 months", "1Y": "the year", "5Y": "5 years" }[label]}`;
          const readout = el("span", { class: "small muted st-readout", text: fallback });
          const stats = [
            day.dayLow != null && ["Day", `${num(day.dayLow)} – ${num(day.dayHigh)}`],
            day.yearLow != null && ["52 weeks", `${num(day.yearLow)} – ${num(day.yearHigh)}`],
          ].filter(Boolean);
          top.replaceChildren(
            el("div", { class: "rowhead" }, el("span", { class: "st-big-price", text: isIndex ? num(day.price) : money(day.price, day.currency) }), pill(c, true)),
            readout,
            bigChart(q, range, c.dir, readout, fallback),
            chips,
            stats.length ? el("div", { class: "st-stats" }, stats.map(([k, v]) => el("div", {}, el("span", { class: "mono muted", text: k.toUpperCase() }), el("span", { class: "mono", text: v })))) : null,
            el("span", { class: "small muted", text: status(day, mk.tz) }));
        }).catch(() => { if (live(my) && mine === seen) top.replaceChildren(el("p", { class: "small", text: "Couldn't load this chart just now." }), chips); });
      }
      load();
    }

    // Keep prices fresh while the page is open.
    timer = setInterval(() => { if (document.visibilityState === "visible") render(); }, 3 * 60e3);
    render();
    return {
      setView(v) { view = v; render(); window.scrollTo(0, 0); },
      unmount() { clearInterval(timer); token++; },
    };
  },
};
