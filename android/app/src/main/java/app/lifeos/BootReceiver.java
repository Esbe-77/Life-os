package app.lifeos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android forgets booked alarms on restart and on app update; book them again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Reminders.bookAll(context);
    }
}
