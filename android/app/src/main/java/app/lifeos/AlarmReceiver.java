package app.lifeos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** A reminder or timer is due: show it, then book the next reminder times. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            JSONObject o = new JSONObject(intent.getStringExtra("payload"));
            Reminders.show(context, o);
            if (!o.optBoolean("timer")) Reminders.bookAll(context);
        } catch (Exception ignored) {
        }
    }
}
