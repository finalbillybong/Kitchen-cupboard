package com.finalbillybong.kitchencupboard;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://shopping.finalbillybong.com/";
    private static final String APP_HOST = "shopping.finalbillybong.com";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private byte[] pendingDownload;
    private static final int PICK_RECIPE = 40;
    private static final int SAVE_EXPORT = 41;

    @Override
    @SuppressLint("SetJavaScriptEnabled") // Required by the first-party React application.
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(79, 70, 229));
        getWindow().setNavigationBarColor(Color.rgb(15, 23, 42));

        LinearLayout appLayout = new LinearLayout(this);
        appLayout.setOrientation(LinearLayout.VERTICAL);
        appLayout.setBackgroundColor(Color.rgb(249, 250, 251));

        View statusBarHeader = new View(this);
        statusBarHeader.setBackgroundColor(Color.rgb(79, 70, 229));
        appLayout.addView(statusBarHeader, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(249, 250, 251));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        appLayout.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        View navigationBarFooter = new View(this);
        navigationBarFooter.setBackgroundColor(Color.rgb(15, 23, 42));
        appLayout.addView(navigationBarFooter, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 15+ enforces edge-to-edge layouts for modern apps. Keep the
            // system bars transparent, then reserve their exact safe-area insets.
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
            appLayout.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets statusInsets = insets.getInsets(
                        WindowInsets.Type.statusBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets navigationInsets = insets.getInsets(
                        WindowInsets.Type.navigationBars());
                android.graphics.Insets keyboardInsets = insets.getInsets(
                        WindowInsets.Type.ime());
                setViewHeight(statusBarHeader, statusInsets.top);
                setViewHeight(navigationBarFooter,
                        Math.max(navigationInsets.bottom, keyboardInsets.bottom));
                return insets;
            });
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // User-selected camera/gallery content URIs.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void save(String filename, String mime, String encoded) {
                runOnUiThread(() -> {
                    Uri page = Uri.parse(webView.getUrl() == null ? "" : webView.getUrl());
                    if (!"https".equals(page.getScheme()) || !APP_HOST.equals(page.getHost())
                            || (page.getPort() != -1 && page.getPort() != 443)
                            || pendingDownload != null || encoded.length() > 50 * 1024 * 1024) return;
                    String safeMime = mime.split(";", 2)[0];
                    if (!safeMime.equals("application/pdf") && !safeMime.equals("text/csv") && !safeMime.equals("text/plain")) return;
                    try {
                        pendingDownload = Base64.decode(encoded, Base64.DEFAULT);
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(safeMime);
                        intent.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[^a-zA-Z0-9._-]", "_"));
                        startActivityForResult(intent, SAVE_EXPORT);
                    } catch (Exception ex) {
                        pendingDownload = null;
                        Toast.makeText(MainActivity.this, "Unable to save export", Toast.LENGTH_LONG).show();
                    }
                });
            }
        }, "KitchenDownloads");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent gallery = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                gallery.addCategory(Intent.CATEGORY_OPENABLE);
                gallery.setType("image/*");
                gallery.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                Intent chooser = Intent.createChooser(gallery, "Choose recipe photos");
                try {
                    File photo = File.createTempFile("recipe-", ".jpg", getCacheDir());
                    cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", photo);
                    Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                    camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    camera.setClipData(android.content.ClipData.newRawUri("Recipe photo", cameraUri));
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                    startActivityForResult(chooser, PICK_RECIPE);
                } catch (Exception ex) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                }
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme())
                        && APP_HOST.equalsIgnoreCase(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No application is available for this external link.
                }
                return true;
            }
        });

        setContentView(appLayout);
        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_RECIPE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    if (count <= 5) {
                        result = new Uri[count];
                        for (int i = 0; i < count; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                    } else Toast.makeText(this, "Choose at most five photos", Toast.LENGTH_LONG).show();
                } else if (data != null && data.getData() != null) result = new Uri[]{data.getData()};
                else if (cameraUri != null) result = new Uri[]{cameraUri};
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            cameraUri = null;
        } else if (requestCode == SAVE_EXPORT && pendingDownload != null) {
            byte[] bytes = pendingDownload;
            pendingDownload = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri destination = data.getData();
                new Thread(() -> {
                    try (OutputStream stream = getContentResolver().openOutputStream(destination)) {
                        if (stream != null) stream.write(bytes);
                    } catch (Exception ex) {
                        runOnUiThread(() -> Toast.makeText(this, "Unable to save export", Toast.LENGTH_LONG).show());
                    }
                }).start();
            }
        }
    }

    private static void setViewHeight(View view, int height) {
        ViewGroup.LayoutParams params = view.getLayoutParams();
        if (params.height != height) {
            params.height = height;
            view.setLayoutParams(params);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        pendingDownload = null;
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
