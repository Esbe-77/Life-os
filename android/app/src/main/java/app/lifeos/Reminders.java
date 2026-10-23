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
 */
final class Reminders {
    private static final String PREFS = "lifeos_reminders";
    private static final String KEY_LIST = "list";
    private static final String KEY_BOOKED = "booked";
    private static final String CHANNEL = "reminders";

    private Reminders() {}

    static void setAll(Context c, String json) {
        prefs(c).edit().putString(KEY_LIST, json).apply();
        bookAll(c);
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
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT));
        }
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
        try {
            nm.notify(o.optString("id").hashCode(), b.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed; nothing to show.
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
