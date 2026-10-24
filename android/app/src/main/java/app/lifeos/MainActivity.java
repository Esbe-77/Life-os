package app.lifeos;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Life OS runs as a web app inside this one WebView. The files ship inside
 * the APK (assets/www) and are served from a fixed https address, so saved
 * data stays put across updates. The page's data lives in the WebView's
 * storage, which Android keeps until the app is uninstalled.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int REQ_OPEN_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    private WebView web;
    private WebViewAssetLoader assets;
    private ValueCallback<Uri[]> pendingOpen;
    private String pendingSaveText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        assets = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new Bridge(), "LifeOSAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (HOST.equals(url.getHost())) return false;
                // Anything else (a link out) opens in the phone's browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // "Restore from a backup" uses a file picker.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingOpen != null) pendingOpen.onReceiveValue(null);
                pendingOpen = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_OPEN_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingOpen = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL + routeFrom(getIntent()));
    }

    // A tapped notification says where to open, e.g. "#/weekly-review".
    private static String routeFrom(Intent intent) {
        String r = intent == null ? null : intent.getStringExtra("route");
        return r != null && r.matches("#/[A-Za-z0-9/_-]*") ? r : "";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String r = routeFrom(intent);
        if (!r.isEmpty()) web.evaluateJavascript("location.hash = '" + r + "'", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Lets the page pick up anything done from a notification while it was away.
        if (web != null) web.evaluateJavascript("window.__lifeosResume && window.__lifeosResume()", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;

        if (requestCode == REQ_OPEN_FILE && pendingOpen != null) {
            pendingOpen.onReceiveValue(uri == null ? null : new Uri[]{uri});
            pendingOpen = null;
        } else if (requestCode == REQ_SAVE_FILE) {
            String result = "cancelled";
            if (uri != null && pendingSaveText != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    out.write(pendingSaveText.getBytes(StandardCharsets.UTF_8));
                    result = "saved";
                } catch (Exception e) {
                    result = "failed";
                }
            }
            pendingSaveText = null;
            web.evaluateJavascript("window.__lifeosSaveResult && window.__lifeosSaveResult('" + result + "')", null);
        }
    }

    /** Called from the page (js/backup.js) to save a backup file where the person chooses. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String filename, String text, String mimeType) {
            runOnUiThread(() -> {
                pendingSaveText = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mimeType);
                i.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(i, REQ_SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveText = null;
                    web.evaluateJavascript("window.__lifeosSaveResult && window.__lifeosSaveResult('failed')", null);
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        /** The whole list of reminders, as JSON (see Reminders). */
        @JavascriptInterface
        public void setReminders(String json) {
            Reminders.setAll(getApplicationContext(), json);
        }

        @JavascriptInterface
        public void startTimer(String id, int seconds, String title, String text) {
            Reminders.startTimer(getApplicationContext(), id, seconds, title, text);
        }

        /** Done taps from habit notifications since the page last asked, as JSON. */
        @JavascriptInterface
        public String takeDone() {
            return Reminders.takeDone(getApplicationContext());
        }

        @JavascriptInterface
        public void cancelTimer(String id) {
            Reminders.cancelTimer(getApplicationContext(), id);
        }

        /** Asks for permission to show notifications (Android 13+), once. */
        @JavascriptInterface
        public void requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7));
            }
        }
    }
}
