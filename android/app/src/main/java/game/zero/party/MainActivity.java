package game.zero.party;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import java.io.*;
import java.util.*;

public class MainActivity extends Activity {
 private WebView web;
 private static final String ORIGIN="https://zero.local/";
 @Override public void onCreate(Bundle savedInstanceState) {
  super.onCreate(savedInstanceState);
  getWindow().setStatusBarColor(Color.rgb(17,19,16));
  getWindow().setNavigationBarColor(Color.rgb(17,19,16));
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  web=new WebView(this);web.setBackgroundColor(Color.rgb(17,19,16));
  web.setOverScrollMode(View.OVER_SCROLL_NEVER);
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setMediaPlaybackRequiresUserGesture(false);settings.setTextZoom(100);
  CookieManager.getInstance().setAcceptCookie(false);
  web.setWebChromeClient(new WebChromeClient());
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !r.getUrl().toString().startsWith(ORIGIN);}
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
    Uri u=r.getUrl();
    if("zero.local".equals(u.getHost())){
     String path=u.getPath();if(path==null||path.equals("/"))path="/index.html";
     if(path.contains(".."))return empty();
     try{
      String mime=path.endsWith(".js")?"text/javascript":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":"text/html";
      Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-cache");headers.put("Access-Control-Allow-Origin",ORIGIN);
      return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open("web"+path));
     }catch(Exception e){return empty();}
    }
    if("https".equals(u.getScheme())&&"your-project-ref.supabase.co".equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith("/functions/v1/zero-game"))return null;
    return empty();
   }
   private WebResourceResponse empty(){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
  });
  web.addJavascriptInterface(new NativeBridge(),"ZeroNative");
  setContentView(web);
  if(Build.VERSION.SDK_INT>=30){web.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});}
  else web.setFitsSystemWindows(true);
  web.loadUrl(ORIGIN+"index.html");
 }
 public class NativeBridge {
  @JavascriptInterface public void copy(String text){runOnUiThread(()->{ClipboardManager c=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);c.setPrimaryClip(ClipData.newPlainText("Zero room",text));});}
  @JavascriptInterface public void share(String text){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_SEND);i.setType("text/plain");i.putExtra(Intent.EXTRA_TEXT,text);startActivity(Intent.createChooser(i,"Invite friends to ZERO"));});}
  @JavascriptInterface public void haptic(){runOnUiThread(()->{Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null&&v.hasVibrator())v.vibrate(VibrationEffect.createOneShot(16,VibrationEffect.DEFAULT_AMPLITUDE));});}
  @JavascriptInterface public void exit(){runOnUiThread(()->finish());}
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.zeroBack&&window.zeroBack()",null);}
 @Override protected void onPause(){super.onPause();web.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("ZeroNative");web.destroy();}super.onDestroy();}
}
