package app.lifeos;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The Done button on a habit reminder: note it for the page and clear the notification. */
public class DoneReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String habit = intent.getStringExtra("habit"), date = intent.getStringExtra("date");
        if (habit != null && date != null) Reminders.queueDone(context, habit, date);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(intent.getIntExtra("notif", 0));
    }
}
