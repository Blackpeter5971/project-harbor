import Foundation
import Capacitor
import UnityAds

/// Native bridge for src/lib/game/ads-service.ts (plugin name "UnityAds"), iOS side.
@objc(UnityAdsPlugin)
public class UnityAdsPlugin: CAPPlugin, CAPBridgedPlugin, UnityAdsInitializationDelegate, UnityAdsLoadDelegate, UnityAdsShowDelegate, UADSBannerViewDelegate {
    public let identifier = "UnityAdsPlugin"
    public let jsName = "UnityAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preloadRewarded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBanner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideBanner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showRewarded", returnType: CAPPluginReturnPromise),
    ]

    private var initCalls: [CAPPluginCall] = []
    private var loadCalls: [String: [CAPPluginCall]] = [:]
    private var loaded = Set<String>()
    private var showCall: CAPPluginCall?
    private var showStarted = false
    private var banner: UADSBannerView?
    private var bannerCall: CAPPluginCall?

    @objc func initialize(_ call: CAPPluginCall) {
        guard let gameId = call.getString("gameId") else { call.reject("Missing gameId"); return }
        if UnityAds.isInitialized() { call.resolve(); return }
        initCalls.append(call)
        if initCalls.count > 1 { return }
        UnityAds.initialize(gameId, testMode: call.getBool("testMode") ?? false, initializationDelegate: self)
    }
    public func initializationComplete() { let c = initCalls; initCalls = []; c.forEach { $0.resolve() } }
    public func initializationFailed(_ error: UnityAdsInitializationError, withMessage message: String) {
        let c = initCalls; initCalls = []; c.forEach { $0.reject("Unity Ads could not start: \(message)") }
    }

    private func load(_ id: String, _ call: CAPPluginCall?) {
        if loaded.contains(id) { call?.resolve(); return }
        var list = loadCalls[id] ?? []
        if let call = call { list.append(call) }
        let first = loadCalls[id] == nil
        loadCalls[id] = list
        if first { UnityAds.load(id, loadDelegate: self) }
    }
    @objc func preloadRewarded(_ call: CAPPluginCall) {
        guard let id = call.getString("placementId") else { call.reject("Missing placementId"); return }
        DispatchQueue.main.async { self.load(id, call) }
    }
    public func unityAdsAdLoaded(_ placementId: String) {
        loaded.insert(placementId); let c = loadCalls.removeValue(forKey: placementId) ?? []; c.forEach { $0.resolve() }
    }
    public func unityAdsAdFailed(toLoad placementId: String, withError error: UnityAdsLoadError, withMessage message: String) {
        let c = loadCalls.removeValue(forKey: placementId) ?? []; c.forEach { $0.reject("Ad unit \(placementId) failed to load: \(message)") }
    }

    @objc func showRewarded(_ call: CAPPluginCall) {
        guard let id = call.getString("placementId") else { call.reject("Missing placementId"); return }
        DispatchQueue.main.async {
            if self.showCall != nil { call.reject("An ad is already showing"); return }
            self.showCall = call; self.showStarted = false
            let present = {
                guard let vc = self.bridge?.viewController else { self.finishShow(nil, "No screen to show the ad on"); return }
                self.loaded.remove(id)
                UnityAds.show(vc, placementId: id, showDelegate: self)
            }
            if self.loaded.contains(id) { present() } else {
                self.loadCalls[id, default: []].append(CAPPluginCall(callbackId: "internal", options: [:], success: { _, _ in present() }, error: { _ in self.finishShow(nil, "Ad unit \(id) is not ready") })!)
                if self.loadCalls[id]!.count == 1 { UnityAds.load(id, loadDelegate: self) }
            }
        }
    }
    private func finishShow(_ completed: Bool?, _ err: String? = nil) {
        guard let c = showCall else { return }
        showCall = nil
        if let err = err { c.reject(err) } else { c.resolve(["completed": completed ?? false]) }
    }
    public func unityAdsShowStart(_ placementId: String) { showStarted = true }
    public func unityAdsShowClick(_ placementId: String) {}
    public func unityAdsShowComplete(_ placementId: String, withFinish state: UnityAdsShowCompletionState) {
        finishShow(state == .showCompletionStateCompleted || showStarted)
        UnityAds.load(placementId, loadDelegate: self)
    }
    public func unityAdsShowFailed(_ placementId: String, withError error: UnityAdsShowError, withMessage message: String) {
        finishShow(nil, "Ad could not play: \(message)")
    }

    @objc func showBanner(_ call: CAPPluginCall) {
        guard let id = call.getString("placementId") else { call.reject("Missing placementId"); return }
        DispatchQueue.main.async {
            guard let root = self.bridge?.viewController?.view else { call.reject("No screen for banner"); return }
            self.banner?.removeFromSuperview()
            let b = UADSBannerView(placementId: id, size: CGSize(width: 320, height: 50))
            b.delegate = self
            b.translatesAutoresizingMaskIntoConstraints = false
            root.addSubview(b)
            NSLayoutConstraint.activate([
                b.centerXAnchor.constraint(equalTo: root.centerXAnchor),
                b.bottomAnchor.constraint(equalTo: root.safeAreaLayoutGuide.bottomAnchor),
                b.widthAnchor.constraint(equalToConstant: 320), b.heightAnchor.constraint(equalToConstant: 50),
            ])
            self.banner = b; self.bannerCall = call
            b.load()
        }
    }
    public func bannerViewDidLoad(_ bannerView: UADSBannerView!) { bannerCall?.resolve(); bannerCall = nil }
    public func bannerViewDidError(_ bannerView: UADSBannerView!, error: UADSBannerError!) {
        bannerCall?.reject("Banner failed: \(error?.localizedDescription ?? "unknown")"); bannerCall = nil
        bannerView?.removeFromSuperview(); if banner === bannerView { banner = nil }
    }
    @objc func hideBanner(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.banner?.removeFromSuperview(); self.banner = nil; call.resolve() }
    }
}
