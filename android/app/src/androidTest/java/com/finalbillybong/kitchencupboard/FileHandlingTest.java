package com.finalbillybong.kitchencupboard;

import static org.junit.Assert.*;
import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import android.app.Activity;
import android.app.Instrumentation.ActivityResult;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.util.Base64;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.espresso.intent.Intents;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class FileHandlingTest {
    private WebView webView(MainActivity activity) {
        try {
            Field field = MainActivity.class.getDeclaredField("webView");
            field.setAccessible(true);
            return (WebView) field.get(activity);
        } catch (Exception ex) { throw new AssertionError(ex); }
    }
    private WebChromeClient.FileChooserParams chooser() {
        return new WebChromeClient.FileChooserParams() {
            public int getMode() { return MODE_OPEN_MULTIPLE; }
            public String[] getAcceptTypes() { return new String[]{"image/*"}; }
            public boolean isCaptureEnabled() { return false; }
            public CharSequence getTitle() { return "Recipe photos"; }
            public String getFilenameHint() { return null; }
            public Intent createIntent() { return new Intent(Intent.ACTION_OPEN_DOCUMENT); }
        };
    }
    @Test public void orderedGallerySelectionAndCameraFallback() throws Exception {
        Intents.init();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Uri one = Uri.parse("content://test/first.png"), two = Uri.parse("content://test/second.png");
            ClipData clip = ClipData.newRawUri("First", one);
            clip.addItem(new ClipData.Item(two));
            Intent selected = new Intent(); selected.setClipData(clip);
            intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new ActivityResult(Activity.RESULT_OK, selected));
            AtomicReference<Uri[]> result = new AtomicReference<>();
            CountDownLatch done = new CountDownLatch(1);
            scenario.onActivity(activity -> {
                WebView view = webView(activity);
                assertTrue(view.getWebChromeClient().onShowFileChooser(view, uris -> { result.set(uris); done.countDown(); }, chooser()));
            });
            assertTrue(done.await(10, TimeUnit.SECONDS));
            assertArrayEquals(new Uri[]{one,two}, result.get());
            Intent launched = Intents.getIntents().stream().filter(i -> Intent.ACTION_CHOOSER.equals(i.getAction())).findFirst().get();
            Intent gallery = launched.getParcelableExtra(Intent.EXTRA_INTENT);
            assertTrue(gallery.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
            assertEquals("image/*", gallery.getType());
            Intent camera = (Intent) launched.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS)[0];
            assertEquals(android.provider.MediaStore.ACTION_IMAGE_CAPTURE, camera.getAction());
            assertNotNull(camera.getParcelableExtra(android.provider.MediaStore.EXTRA_OUTPUT));
            assertTrue((camera.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0);
        } finally { Intents.release(); }
        Intents.init();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new ActivityResult(Activity.RESULT_OK, null));
            AtomicReference<Uri[]> result = new AtomicReference<>();CountDownLatch done = new CountDownLatch(1);
            scenario.onActivity(activity -> {WebView view=webView(activity);view.getWebChromeClient().onShowFileChooser(view,uris->{result.set(uris);done.countDown();},chooser());});
            assertTrue(done.await(10,TimeUnit.SECONDS));
            assertEquals(1,result.get().length);assertEquals("content",result.get()[0].getScheme());
            assertEquals("com.finalbillybong.kitchencupboard.files",result.get()[0].getAuthority());
        } finally {Intents.release();}
    }
    @Test public void authenticatedBlobExportWritesSelectedDocument() throws Exception {
        Intents.init();
        File file = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "export-test.pdf");
        Uri destination=FileProvider.getUriForFile(InstrumentationRegistry.getInstrumentation().getTargetContext(),"com.finalbillybong.kitchencupboard.files",file);
        byte[] expected="%PDF-1.4\nAuthenticated recipe export".getBytes();
        intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_OK,new Intent().setData(destination)));
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            String encoded=Base64.encodeToString(expected,Base64.NO_WRAP);
            scenario.onActivity(activity -> webView(activity).loadDataWithBaseURL("https://shopping.finalbillybong.com/","<html><body><script>KitchenDownloads.save('recipe.pdf','application/pdf','"+encoded+"');</script></body></html>","text/html","UTF-8",null));
            long deadline=System.currentTimeMillis()+10000;
            while(System.currentTimeMillis()<deadline && (!file.exists() || file.length()!=expected.length))Thread.sleep(100);
            assertArrayEquals(expected,Files.readAllBytes(file.toPath()));
        } finally {Intents.release();file.delete();}
    }
}
