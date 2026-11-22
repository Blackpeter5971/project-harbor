import { useT } from '@/lib/game/i18n';
import { ArrowRight, LogOut, Play, Settings, Shield, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import capitol from '@/assets/capitol.jpg';
import { QuitScreen, exitNativeApp } from './quit-screen';
export function MainMenu({ hasSave, onNew, onContinue, onSettings }: { hasSave: boolean; onNew: () => void; onContinue: () => void; onSettings: () => void }) {
  const [closed, setClosed] = useState(false);
  const { t } = useT();
  const quit = async () => { if (!(await exitNativeApp())) setClosed(true); };
  if (closed) return <QuitScreen onResume={() => setClosed(false)} />;
  return <main className="menu screen-enter">
    <img className="menu-art" src={capitol} alt="The illuminated United States Capitol at dusk" width={1024} height={1536} />
    <div className="studio"><Shield strokeWidth={1.4} /> Crosian Games</div>
    <div className="menu-title"><h1>PRESIDENT</h1><div className="title-sub">RISE TO POWER</div><div className="menu-stars">★ ★ ★</div></div>
    <div className="menu-space" />
    <p className="menu-tagline">{t('menu.tagline1')}<br />{t('menu.tagline2')}</p>
    <div className="menu-actions">
      <Button variant="game" onClick={onNew}><Star /> {t('menu.new')} <ArrowRight className="ml-auto" /></Button>
      <Button variant="gameOutline" onClick={onContinue} disabled={!hasSave}><Play /> {t('menu.continue')}</Button>
      <Button variant="gameQuiet" className="menu-settings" onClick={onSettings}><Settings /> {t('menu.settings')}</Button>
      <Button variant="gameQuiet" className="menu-settings" onClick={quit}><LogOut /> {t('menu.quit')}</Button>
    </div>
    <footer className="menu-footer"><span>{t('menu.country')}</span><span className="small-stars">★ ★ ★</span><span>v0.1 · Foundation</span></footer>
  </main>;
}
