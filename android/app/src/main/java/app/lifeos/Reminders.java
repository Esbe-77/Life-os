package app.lifeos;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/**
 * Repeating reminders and one-off timers, set by the page through the bridge.
 *
 * The page sends the whole list each time (see js/reminders.js). Each entry is
 * { id, title, text, hour, minute, route } plus either days: [0–6, 0 = Sunday]
 * for a repeating reminder or date: "YYYY-MM-DD" for a one-off. Only the next
 * time of each is booked with Android; when it fires the next one is booked.
 *
 * A habit reminder also carries { habit, date, target, count }. Habit reminders
 * share one notification: one habit shows on its own with a Done button, and
 * when a reminder fires while an earlier one is still undone they merge into
 * "N habits to do" with a Done button for each (up to three). Taps are queued
 * here until the page collects them (takeDone), and a reminder is skipped once
 * the queued taps finish the day. A Done that leaves the habit unfinished
 * updates the notification with a sound; the tap that completes it posts a
 * short "complete" notification instead.
 */
final class Reminders {
    private static final String PREFS = "lifeos_reminders";
    private static final String KEY_LIST = "list";
    private static final String KEY_BOOKED = "booked";
    private static final String KEY_DONE = "done_queue";
    private static final String KEY_SHOWN = "habits_shown"; // habits in the shared notification
    private static final int HABITS_NOTIF = "habits".hashCode();
    private static final String CHANNEL = "reminders";
    private static final String CHANNEL_DONE = "done";

    private Reminders() {}

    static void setAll(Context c, String json) {
        prefs(c).edit().putString(KEY_LIST, json).apply();
        bookAll(c);
        // Habits ticked off in the app drop out of the habit notification.
        showHabits(c, false);
    }

    /** Books the next time of every reminder, replacing whatever was booked before. */
    static void bookAll(Context c) {
        SharedPreferences p = prefs(c);
        for (String id : p.getStringSet(KEY_BOOKED, new HashSet<>())) cancel(c, id);
        Set<String> booked = new HashSet<>();
        try {
            JSONArray list = new JSONArray(p.getString(KEY_LIST, "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.getJSONObject(i);
                long when = nextTime(o);
                if (when > 0) {
                    book(c, o.getString("id"), when, o.toString());
                    booked.add(o.getString("id"));
                }
            }
        } catch (Exception ignored) {
        }
        p.edit().putStringSet(KEY_BOOKED, booked).apply();
    }

    static void startTimer(Context c, String id, int seconds, String title, String text) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", "timer-" + id);
            o.put("title", title);
            o.put("text", text);
            o.put("route", "#/home");
            o.put("timer", true);
            book(c, "timer-" + id, System.currentTimeMillis() + seconds * 1000L, o.toString());
        } catch (Exception ignored) {
        }
    }

    static void cancelTimer(Context c, String id) {
        cancel(c, "timer-" + id);
    }

    static long nextTime(JSONObject o) throws Exception {
        long now = System.currentTimeMillis();
        int hour = o.getInt("hour"), minute = o.getInt("minute");
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        if (o.has("date")) {
            String[] ymd = o.getString("date").split("-");
            cal.set(Integer.parseInt(ymd[0]), Integer.parseInt(ymd[1]) - 1, Integer.parseInt(ymd[2]));
            return cal.getTimeInMillis() > now ? cal.getTimeInMillis() : -1;
        }
        JSONArray days = o.optJSONArray("days");
        Set<Integer> on = new HashSet<>();
        if (days != null) for (int i = 0; i < days.length(); i++) on.add(days.getInt(i));
        for (int i = 0; i < 8; i++) {
            int dow = cal.get(Calendar.DAY_OF_WEEK) - 1; // Calendar's Sunday is 1
            if (cal.getTimeInMillis() > now && (on.isEmpty() || on.contains(dow))) return cal.getTimeInMillis();
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }

    private static PendingIntent alarmIntent(Context c, String id, String payload) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction("app.lifeos.ALARM." + id);
        if (payload != null) i.putExtra("payload", payload);
        return PendingIntent.getBroadcast(c, id.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void book(Context c, String id, long when, String payload) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = alarmIntent(c, id, payload);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
        }
    }

    private static void cancel(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(alarmIntent(c, id, null));
    }

    static void show(Context c, JSONObject o) {
        String habit = o.optString("habit", "");
        if (!habit.isEmpty()) {
            if (o.optInt("count") + queued(c, habit, o.optString("date")) >= o.optInt("target", 1)) return;
            addShown(c, habit, o.optString("date"), o.optString("title", ""));
            showHabits(c, true);
            return;
        }
        NotificationManager nm = notifications(c);
        Intent open = new Intent(c, MainActivity.class)
                .putExtra("route", o.optString("route", "#/home"))
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, o.optString("id").hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2C5A4C)
                .setContentTitle(o.optString("title", "Life OS"))
                .setContentText(o.optString("text", ""))
                .setContentIntent(tap)
                .setAutoCancel(true);
        if ("review".equals(o.optString("complete"))) {
            // The Sunday review: Complete marks the week's review done. The date is
            // taken now, when the reminder shows, so a late tap still counts for Sunday.
            int notifId = o.optString("id").hashCode();
            Intent done = new Intent(c, DoneReceiver.class)
                    .setAction("app.lifeos.REVIEW." + o.optString("id"))
                    .putExtra("review", true)
                    .putExtra("date", new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date()))
                    .putExtra("notif", notifId);
            PendingIntent donePi = PendingIntent.getBroadcast(c, notifId, done,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(new Notification.Action.Builder(null, "Complete", donePi).build());
        }
        try {
            nm.notify(o.optString("id").hashCode(), b.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed; nothing to show.
        }
    }

    /** Records Complete on the Sunday review reminder, for the page to pick up. */
    static synchronized void queueReview(Context c, String date) {
        try {
            JSONArray q = new JSONArray(prefs(c).getString(KEY_DONE, "[]"));
            q.put(new JSONObject().put("review", true).put("date", date).put("at", System.currentTimeMillis()));
            prefs(c).edit().putString(KEY_DONE, q.toString()).apply();
        } catch (Exception ignored) {
        }
        chime(c, "Weekly review: complete", "Enjoy your week.");
    }

    /** Records a Done tap from a notification, for the page to pick up. */
    static synchronized void queueDone(Context c, String habit, String date) {
        try {
            JSONArray q = new JSONArray(prefs(c).getString(KEY_DONE, "[]"));
            q.put(new JSONObject().put("habit", habit).put("date", date).put("at", System.currentTimeMillis()));
            prefs(c).edit().putString(KEY_DONE, q.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Hands the queued Done taps to the page and empties the queue. */
    static synchronized String takeDone(Context c) {
        String q = prefs(c).getString(KEY_DONE, "[]");
        prefs(c).edit().remove(KEY_DONE).apply();
        return q;
    }

    /**
     * After a Done tap: when it finishes the habit for the day, chime with a short
     * "complete" note. Otherwise the habit notification is updated with a sound.
     */
    static void chimeDone(Context c, String habit, String date) {
        JSONObject o = latest(c, habit, date);
        if (o == null) { showHabits(c, false); return; }
        int target = o.optInt("target", 1);
        boolean finished = o.optInt("count") + queued(c, habit, date) >= target;
        if (finished) {
            String name = o.optString("title", "");
            chime(c, name.isEmpty() ? "Complete" : name + ": complete",
                    target > 1 ? "That's " + target + " of " + target + " today. Nice." : "Done for today. Nice.");
        }
        showHabits(c, !finished);
    }

    // ---------- the shared habit notification ----------

    /** The latest list entry the page sent for a habit on a date (it holds the day's count so far). */
    private static JSONObject latest(Context c, String habit, String date) {
        try {
            JSONArray list = new JSONArray(prefs(c).getString(KEY_LIST, "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.getJSONObject(i);
                if (habit.equals(o.optString("habit")) && date.equals(o.optString("date"))) return o;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static synchronized void addShown(Context c, String habit, String date, String name) {
        try {
            JSONArray shown = activeHabitNotification(c) ? new JSONArray(prefs(c).getString(KEY_SHOWN, "[]")) : new JSONArray();
            JSONArray out = new JSONArray();
            for (int i = 0; i < shown.length(); i++) {
                JSONObject e = shown.getJSONObject(i);
                if (!habit.equals(e.optString("habit"))) out.put(e);
            }
            out.put(new JSONObject().put("habit", habit).put("date", date).put("name", name));
            prefs(c).edit().putString(KEY_SHOWN, out.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Whether the habit notification is still on screen (it's gone once swiped away). */
    private static boolean activeHabitNotification(Context c) {
        if (Build.VERSION.SDK_INT < 23) return true;
        try {
            for (android.service.notification.StatusBarNotification n : notifications(c).getActiveNotifications()) {
                if (n.getId() == HABITS_NOTIF) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /**
     * Shows the habits still to do today in one notification, dropping any that
     * are done or from another day. alert: make a sound (a new reminder, or a Done
     * that leaves the habit unfinished); otherwise it updates quietly.
     */
    static synchronized void showHabits(Context c, boolean alert) {
        NotificationManager nm = notifications(c);
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        java.util.List<JSONObject> left = new java.util.ArrayList<>();
        try {
            JSONArray shown = new JSONArray(prefs(c).getString(KEY_SHOWN, "[]"));
            JSONArray keep = new JSONArray();
            for (int i = 0; i < shown.length(); i++) {
                JSONObject e = shown.getJSONObject(i);
                String habit = e.optString("habit"), date = e.optString("date");
                JSONObject o = today.equals(date) ? latest(c, habit, date) : null;
                if (o == null) continue; // done in the app, removed, or another day
                int target = o.optInt("target", 1), count = o.optInt("count") + queued(c, habit, date);
                if (count >= target) continue;
                e.put("name", o.optString("title", e.optString("name"))).put("target", target).put("count", count);
                keep.put(e);
                left.add(e);
            }
            prefs(c).edit().putString(KEY_SHOWN, keep.toString()).apply();
        } catch (Exception ignored) {
        }
        if (left.isEmpty()) {
            nm.cancel(HABITS_NOTIF);
            return;
        }
        if (!alert && !activeHabitNotification(c)) return; // swiped away: don't bring it back quietly

        Intent open = new Intent(c, MainActivity.class)
                .putExtra("route", "#/home")
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, HABITS_NOTIF, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2C5A4C)
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setOnlyAlertOnce(!alert);
        if (left.size() == 1) {
            JSONObject e = left.get(0);
            int target = e.optInt("target", 1), count = e.optInt("count");
            b.setContentTitle(e.optString("name"))
                    .setContentText(target > 1 ? count + " of " + target + " done today. Tap Done one when you have." : "Tap Done when you have.");
            b.addAction(doneAction(c, e, target > 1 ? "Done one" : "Done"));
        } else {
            StringBuilder names = new StringBuilder();
            Notification.InboxStyle style = new Notification.InboxStyle();
            for (JSONObject e : left) {
                int target = e.optInt("target", 1);
                if (names.length() > 0) names.append(", ");
                names.append(e.optString("name"));
                style.addLine(e.optString("name") + (target > 1 ? "  ·  " + e.optInt("count") + " of " + target : ""));
            }
            b.setContentTitle(left.size() + " habits to do").setContentText(names).setStyle(style.setBigContentTitle(left.size() + " habits to do"));
            // Android shows up to three buttons; the newest reminders get them.
            for (int i = left.size() - 1; i >= Math.max(0, left.size() - 3); i--) b.addAction(doneAction(c, left.get(i), "✓ " + left.get(i).optString("name")));
        }
        try {
            nm.notify(HABITS_NOTIF, b.build());
        } catch (SecurityException ignored) {
        }
    }

    private static Notification.Action doneAction(Context c, JSONObject e, String label) {
        String habit = e.optString("habit"), date = e.optString("date");
        Intent done = new Intent(c, DoneReceiver.class)
                .setAction("app.lifeos.DONE." + habit + "." + date)
                .putExtra("habit", habit)
                .putExtra("date", date);
        PendingIntent pi = PendingIntent.getBroadcast(c, ("done-" + habit + date).hashCode(), done,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(null, label, pi).build();
    }

    private static NotificationManager notifications(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT));
        }
        return nm;
    }

    /** A short note that clears itself; posting it makes the phone's notification sound. */
    private static void chime(Context c, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            // Creating it again only updates the name shown in the phone's settings.
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_DONE, "Completed", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL_DONE) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF2C5A4C)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true);
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(15000);
        if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        try {
            nm.notify(("done-" + title).hashCode(), b.build());
        } catch (SecurityException ignored) {
        }
    }

    private static synchronized int queued(Context c, String habit, String date) {
        int n = 0;
        try {
            JSONArray q = new JSONArray(prefs(c).getString(KEY_DONE, "[]"));
            for (int i = 0; i < q.length(); i++) {
                JSONObject e = q.getJSONObject(i);
                if (habit.equals(e.optString("habit")) && date.equals(e.optString("date"))) n++;
            }
        } catch (Exception ignored) {
        }
        return n;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
