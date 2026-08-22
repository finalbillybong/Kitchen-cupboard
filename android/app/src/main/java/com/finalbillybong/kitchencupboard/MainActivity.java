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

public class MainActivity extends Activity {
    private static final String APP_URL = "https://shopping.finalbillybong.com/";
    private static final String APP_HOST = "shopping.finalbillybong.com";
    private WebView webView;

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
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                        && APP_HOST.equalsIgnoreCase(uri.getHost())) {
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
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
