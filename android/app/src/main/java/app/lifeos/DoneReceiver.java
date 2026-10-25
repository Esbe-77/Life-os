package app.lifeos;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The Done button on a habit reminder: note it for the page, clear the notification, and chime if that finished the day. */
public class DoneReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String habit = intent.getStringExtra("habit"), date = intent.getStringExtra("date");
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(intent.getIntExtra("notif", 0));
        if (habit != null && date != null) {
            Reminders.queueDone(context, habit, date);
            Reminders.chimeIfFinished(context, habit, date);
        }
    }
}
