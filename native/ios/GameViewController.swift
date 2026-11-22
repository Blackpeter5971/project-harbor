import Capacitor

/// Registers the local Unity Ads plugin with the Capacitor bridge.
class GameViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(UnityAdsPlugin())
    }
}
