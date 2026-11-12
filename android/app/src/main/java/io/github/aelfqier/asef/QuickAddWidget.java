package io.github.aelfqier.asef;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** Home-screen widget with two buttons that open ASEF straight on a new expense or a new income. */
public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent openPi = PendingIntent.getActivity(ctx, 0, open(ctx, null), flags);
        PendingIntent expensePi = PendingIntent.getActivity(ctx, 1, open(ctx, "asef://add?type=expense"), flags);
        PendingIntent incomePi = PendingIntent.getActivity(ctx, 2, open(ctx, "asef://add?type=income"), flags);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick_add);
            v.setOnClickPendingIntent(R.id.widget_logo, openPi);
            v.setOnClickPendingIntent(R.id.widget_expense, expensePi);
            v.setOnClickPendingIntent(R.id.widget_income, incomePi);
            mgr.updateAppWidget(id, v);
        }
    }

    private static Intent open(Context ctx, String link) {
        Intent i = link == null ? new Intent(ctx, MainActivity.class) : new Intent(Intent.ACTION_VIEW, Uri.parse(link), ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return i;
    }
}
