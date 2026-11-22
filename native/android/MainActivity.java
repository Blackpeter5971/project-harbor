package com.crosiangames.president;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
    /** SHA-256 of the official signing certificate (uppercase hex, no colons). Injected by CI. */
    private static final String EXPECTED_SIGNATURE = "__EXPECTED_SIGNATURE__";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WebView.setWebContentsDebuggingEnabled(false);
        if (!isGenuine()) {
            finishAffinity();
            System.exit(0);
            return;
        }
        registerPlugin(UnityAdsPlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(false);
    }

    private boolean isGenuine() {
        try {
            if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) return false;
            if (!getPackageName().equals("com.crosiangames.president")) return false;
            PackageManager pm = getPackageManager();
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                if (info.signingInfo == null || info.signingInfo.hasMultipleSigners()) return false;
                sigs = info.signingInfo.getSigningCertificateHistory();
            } else {
                PackageInfo info = pm.getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
                sigs = info.signatures;
            }
            if (sigs == null || sigs.length == 0) return false;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Signature s : sigs) {
                byte[] d = md.digest(s.toByteArray());
                StringBuilder hex = new StringBuilder();
                for (byte b : d) hex.append(String.format("%02X", b));
                if (hex.toString().equals(EXPECTED_SIGNATURE)) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }
}
