import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALE_OPTIONS, setLocale, useT, type Locale } from '@/lib/game/i18n';

/** Language picker: shown on first launch and from More → Change language. */
export function LanguageSelectModal({ onDone, onClose }: { onDone?: (locale: Locale, label: string) => void; onClose?: () => void }) {
  const { locale, t } = useT();
  const pick = (id: Locale, label: string) => { setLocale(id); onDone?.(id, label); };
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="lang-title" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2 id="lang-title">Choose Your Language<br /><small>Elige tu idioma · Choisissez votre langue</small></h2></div>
      <div className="more-list">
        {LOCALE_OPTIONS.map(l => <Button key={l.id} variant="gameChoice" onClick={() => pick(l.id, l.label)} aria-pressed={onClose ? locale === l.id : undefined}>
          <span aria-hidden>{l.flag}</span> {l.label} {onClose && locale === l.id ? <Check /> : <span />}
        </Button>)}
      </div>
      {onClose && <div className="modal-actions"><Button variant="gameOutline" onClick={onClose}>{t('btn.close')}</Button></div>}
    </section>
  </div>;
}
