// Phone notifications, available only inside the Android app. The app keeps
// one list of repeating reminders; this rebuilds it from what's saved
// (habit reminders, the weekly review reminder, decision check-ins).

import * as store from "./store.js";
import { isoDate } from "./ui.js";

const bridge = () => window.LifeOSAndroid;
export const canNotify = () => typeof bridge()?.setReminders === "function";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function syncReminders() {
  if (!canNotify()) return;
  const list = [];
  const at = hhmm => { const [hour, minute] = hhmm.split(":").map(Number); return { hour, minute }; };

  for (const h of store.load("habits", { habits: [] }).habits || []) {
    for (const r of h.reminders || []) {
      list.push({ id: `habit-${h.id}-${r.id}`, title: h.name, text: "A reminder for your habit.", ...at(r.time),
        days: h.days?.length ? h.days : ALL_DAYS, route: "#/home" });
    }
  }

  const rr = store.getMeta().reviewReminder;
  if (rr?.on) list.push({ id: "weekly-review", title: "Your weekly review", text: "Five questions, about ten minutes.", ...at(rr.time || "18:00"), days: [0], route: "#/weekly-review" });

  const today = isoDate(new Date());
  const decisions = store.load("decisions", { decisions: {} }).decisions || {};
  for (const d of Object.values(decisions)) {
    if (d?.status !== "deciding" && !d?.outcome && d?.reviewOn && d.reviewOn >= today) {
      list.push({ id: `decision-${d.id}`, title: "How did it turn out?", text: d.title, hour: 9, minute: 0, date: d.reviewOn, route: `#/decisions/${d.id}` });
    }
  }

  try { bridge().setReminders(JSON.stringify(list)); } catch {}
}

// Ask once for permission to show notifications (Android 13 and later).
export function askPermission() { try { bridge()?.requestNotifications?.(); } catch {} }

export function startTimer(id, seconds, title, text) {
  if (!canNotify()) return;
  askPermission();
  try { bridge().startTimer(id, seconds, title, text); } catch {}
}
export function cancelTimer(id) { try { bridge()?.cancelTimer?.(id); } catch {} }
