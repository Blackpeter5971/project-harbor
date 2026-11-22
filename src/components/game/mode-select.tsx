import { useT } from '@/lib/game/i18n';
import { ArrowLeft, Globe2, BookOpenText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GameMode } from '@/lib/game/story-mode';

/** New Career step 0: pick Sandbox or Story Mode. Reuses creation card styling. */
export function ModeSelect({ onPick, onBack }: { onPick: (mode: GameMode) => void; onBack: () => void }) {
  const { t } = useT();
  return <main className="creation screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft /></Button><div><span className="eyebrow">{t('menu.new')}</span><h1>{t('mode.title')}</h1></div><Globe2 className="text-primary mx-auto size-4" /></header>
    <div className="screen-body">
      <h2 className="step-title">{t('mode.heading')}</h2>
      <p className="step-subtitle">{t('mode.subtitle')}</p>
      <div className="background-list">
        <Button variant="gameChoice" className="background-choice" onClick={() => onPick('sandbox')}>
          <span className="choice-icon"><Globe2 /></span>
          <span className="choice-details">
            <span className="choice-heading"><strong>{t('mode.sandbox')}</strong><span className="difficulty">{t('mode.sandboxTag')}</span></span>
            <p>{t('mode.sandboxDesc')}</p>
            <span className="scenario-flag">{t('mode.sandboxFlag')}</span>
          </span>
        </Button>
        <Button variant="gameChoice" className="background-choice" onClick={() => onPick('story')}>
          <span className="choice-icon"><BookOpenText /></span>
          <span className="choice-details">
            <span className="choice-heading"><strong>{t('mode.story')}</strong><span className="difficulty">{t('mode.storyTag')}</span></span>
            <p>{t('mode.storyDesc')}</p>
            <span className="scenario-flag">{t('mode.storyFlag')}</span>
          </span>
        </Button>
      </div>
    </div>
    <footer className="screen-actions"><Button variant="gameQuiet" onClick={onBack}><ArrowLeft /> {t('btn.back')}</Button><span /></footer>
  </main>;
}

/** Small labelled badge used on scenario cards. */
export function StatusBadge({ label, tone }: { label: string; tone: 'active' | 'locked' | 'completed' }) {
  return <span className={`scenario-flag scenario-status-${tone}`}>{tone === 'completed' && <Check className="inline size-2.5" />} {label}</span>;
}
