import { Play, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Exits the native app on Android; returns false on the web, where the caller shows the Session Closed screen. */
export async function exitNativeApp(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return false;
    const { App } = await import('@capacitor/app');
    await App.exitApp();
    return true;
  } catch { return false; }
}

export function QuitScreen({ onResume }: { onResume: () => void }) {
  return <main className="menu screen-enter quit-screen">
    <div className="studio"><Shield strokeWidth={1.4} /> Crosian Games</div>
    <div className="menu-title"><h1>PRESIDENT</h1><div className="title-sub">RISE TO POWER</div></div>
    <div className="menu-space" />
    <h2 className="step-title">Session Closed</h2>
    <p className="menu-tagline">Your progress is saved on this device.<br />You can close this tab safely.</p>
    <div className="menu-actions"><Button variant="game" onClick={onResume}><Play /> Return to menu</Button></div>
  </main>;
}
