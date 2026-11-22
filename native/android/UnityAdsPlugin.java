package com.crosiangames.president;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsShowOptions;
import com.unity3d.services.banners.BannerErrorInfo;
import com.unity3d.services.banners.BannerView;
import com.unity3d.services.banners.UnityBannerSize;

import java.util.ArrayList;
import java.util.List;

/** Native bridge for src/lib/game/ads-service.ts (plugin name "UnityAds"). */
@CapacitorPlugin(name = "UnityAds")
public class UnityAdsPlugin extends Plugin {
    private static final long LOAD_TIMEOUT_MS = 15000;
    private static final long RELOAD_DELAY_MS = 2000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private BannerView banner;
    private boolean bannerLoaded = false;

    private boolean initStarted = false;
    private final List<PluginCall> initWaiters = new ArrayList<>();

    private String placement = null;
    private String loadedRewarded = null;
    private boolean rewardedLoading = false;
    private int loadToken = 0;
    private boolean showing = false;
    private final List<PluginCall> rewardedWaiters = new ArrayList<>();

    @PluginMethod
    public void initialize(final PluginCall call) {
        synchronized (this) {
            if (UnityAds.isInitialized()) { call.resolve(); return; }
            initWaiters.add(call);
            if (initStarted) return;
            initStarted = true;
        }
        String gameId = call.getString("gameId");
        boolean testMode = Boolean.TRUE.equals(call.getBoolean("testMode", false));
        UnityAds.initialize(getContext().getApplicationContext(), gameId, testMode, new IUnityAdsInitializationListener() {
            @Override public void onInitializationComplete() { finishInit(null); }
            @Override public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
                finishInit("Unity Ads could not start (" + error + "): " + message);
            }
        });
    }

    private void finishInit(String error) {
        List<PluginCall> waiters;
        synchronized (this) {
            if (error != null) initStarted = false;
            waiters = new ArrayList<>(initWaiters);
            initWaiters.clear();
        }
        for (PluginCall c : waiters) { if (error == null) c.resolve(); else c.reject(error); }
    }

    @PluginMethod
    public void preloadRewarded(final PluginCall call) {
        startRewardedLoad(call.getString("placementId"));
        call.resolve();
    }

    private void startRewardedLoad(final String placementId) {
        final int token;
        synchronized (this) {
            if (placementId != null) placement = placementId;
            if (placement == null || loadedRewarded != null || rewardedLoading || showing) return;
            rewardedLoading = true;
            token = ++loadToken;
        }
        // Watchdog: a load that never answers must not freeze the button forever.
        main.postDelayed(() -> failLoad(token, "Ad took too long to load. Please try again."), LOAD_TIMEOUT_MS);
        UnityAds.load(placement, new IUnityAdsLoadListener() {
            @Override public void onUnityAdsAdLoaded(String id) {
                List<PluginCall> w;
                synchronized (UnityAdsPlugin.this) {
                    if (token != loadToken || !rewardedLoading) return;
                    loadedRewarded = id; rewardedLoading = false;
                    w = new ArrayList<>(rewardedWaiters); rewardedWaiters.clear();
                }
                if (!w.isEmpty()) {
                    showLoaded(w.get(0));
                    for (int i = 1; i < w.size(); i++) w.get(i).reject("Another ad is already playing.");
                }
            }
            @Override public void onUnityAdsFailedToLoad(String id, UnityAds.UnityAdsLoadError e, String m) {
                failLoad(token, "Ad could not load (" + e + "): " + m);
            }
        });
    }

    private void failLoad(int token, String msg) {
        List<PluginCall> w;
        synchronized (this) {
            if (token != loadToken || !rewardedLoading) return;
            rewardedLoading = false;
            loadToken++;
            w = new ArrayList<>(rewardedWaiters); rewardedWaiters.clear();
        }
        for (PluginCall c : w) c.reject(msg);
    }

    @PluginMethod
    public void showRewarded(final PluginCall call) {
        boolean ready;
        synchronized (this) {
            if (showing) { call.reject("An ad is already playing."); return; }
            ready = loadedRewarded != null;
            if (!ready) rewardedWaiters.add(call);
        }
        if (ready) showLoaded(call); else startRewardedLoad(call.getString("placementId"));
    }

    private void scheduleReload() {
        main.postDelayed(() -> startRewardedLoad(null), RELOAD_DELAY_MS);
    }

    private void showLoaded(final PluginCall call) {
        final String id;
        synchronized (this) { id = loadedRewarded; loadedRewarded = null; showing = true; }
        final Activity activity = getActivity();
        final boolean[] started = { false };
        final boolean[] done = { false };
        activity.runOnUiThread(() -> UnityAds.show(activity, id, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
            @Override public void onUnityAdsShowFailure(String p, UnityAds.UnityAdsShowError e, String m) {
                synchronized (UnityAdsPlugin.this) { showing = false; }
                if (!done[0]) {
                    done[0] = true;
                    if (started[0]) { JSObject r = new JSObject(); r.put("completed", true); call.resolve(r); }
                    else call.reject("Ad could not play (" + e + "): " + m);
                }
                scheduleReload();
            }
            @Override public void onUnityAdsShowStart(String p) { started[0] = true; }
            @Override public void onUnityAdsShowClick(String p) {}
            @Override public void onUnityAdsShowComplete(String p, UnityAds.UnityAdsShowCompletionState state) {
                synchronized (UnityAdsPlugin.this) { showing = false; }
                if (!done[0]) {
                    done[0] = true;
                    JSObject r = new JSObject();
                    // Watching the video earns the reward, even if the end card reports "skipped".
                    r.put("completed", state == UnityAds.UnityAdsShowCompletionState.COMPLETED || started[0]);
                    call.resolve(r);
                }
                scheduleReload();
            }
        }));
    }

    @PluginMethod
    public void showBanner(final PluginCall call) {
        final String placementId = call.getString("placementId");
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (banner != null && bannerLoaded) { banner.bringToFront(); call.resolve(); return; }
            removeBanner();
            final BannerView view = new BannerView(activity, placementId, new UnityBannerSize(320, 50));
            banner = view;
            view.setListener(new BannerView.Listener() {
                @Override public void onBannerLoaded(BannerView v) {
                    bannerLoaded = true;
                    v.bringToFront();
                    call.resolve();
                }
                @Override public void onBannerFailedToLoad(BannerView v, BannerErrorInfo info) {
                    if (banner == view) removeBanner();
                    call.reject("Banner could not load (" + info.errorCode + "): " + info.errorMessage);
                }
            });
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
            ((ViewGroup) activity.findViewById(android.R.id.content)).addView(view, lp);
            view.setElevation(1000f);
            view.setTranslationZ(1000f);
            view.bringToFront();
            view.load();
        });
    }

    private void removeBanner() {
        if (banner != null) {
            ViewGroup parent = (ViewGroup) banner.getParent();
            if (parent != null) parent.removeView(banner);
            banner.destroy();
            banner = null;
        }
        bannerLoaded = false;
    }

    @PluginMethod
    public void hideBanner(final PluginCall call) {
        getActivity().runOnUiThread(() -> { removeBanner(); call.resolve(); });
    }
}
