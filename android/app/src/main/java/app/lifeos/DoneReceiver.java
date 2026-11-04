package app.lifeos;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The Done button on a habit reminder, or Complete on the Sunday review reminder:
 * note it for the page and update the notifications (see Reminders.chimeDone).
 */
public class DoneReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String habit = intent.getStringExtra("habit"), date = intent.getStringExtra("date");
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        // The review reminder (and habit reminders from older versions) name their own notification.
        int notif = intent.getIntExtra("notif", 0);
        if (notif != 0) nm.cancel(notif);
        if (date == null) return;
        if (intent.getBooleanExtra("review", false)) {
            Reminders.queueReview(context, date);
        } else if (habit != null) {
            Reminders.queueDone(context, habit, date);
            Reminders.chimeDone(context, habit, date);
        }
    }
}
