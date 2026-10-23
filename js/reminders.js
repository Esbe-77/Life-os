// Phone notifications, available only inside the Android app. The app keeps
// one list of reminders; this rebuilds it from what's saved (habit reminders
// on planned days, the weekly review reminder, decision check-ins).

import * as store from "./store.js";
import { isoDate, addDays } from "./ui.js";
import { loadHabits, planWeek, plannedDates } from "./habits.js";

const bridge = () => window.LifeOSAndroid;
export const canNotify = () => typeof bridge()?.setReminders === "function";

export function syncReminders() {
  if (!canNotify()) return;
  const list = [];
  const at = hhmm => { const [hour, minute] = hhmm.split(":").map(Number); return { hour, minute }; };

  // Habit reminders are one-offs on each planned day, up to the end of the
  // week being planned. Any save books them again, so new weeks are picked up.
  const today = isoDate(new Date());
  const planEnd = addDays(planWeek(), 6);
  for (const h of loadHabits()) {
    if (h.kind !== "do" || !h.reminders.length) continue;
    for (const date of plannedDates(h, today, h.fixed ? addDays(today, 27) : planEnd)) {
      if (h.done.includes(date)) continue; // already done that day
      for (const r of h.reminders) {
        list.push({ id: `habit-${h.id}-${r.id}-${date}`, title: h.name, text: "A reminder for your habit.", ...at(r.time), date, route: "#/home" });
      }
    }
  }

  const rr = store.getMeta().reviewReminder;
  if (rr?.on) list.push({ id: "weekly-review", title: "Your weekly review", text: "Five questions, then plan next week's habits.", ...at(rr.time || "19:00"), days: [0], route: "#/weekly-review" });

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
