import { useT } from '@/lib/game/i18n';
import { ArrowLeft, ArrowRight, Check, UserRound, Footprints, Hammer, Coins, Landmark, BriefcaseBusiness, GraduationCap, Scale, Shield, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { backgroundConfig, backgrounds, education, parties, states, type CharacterDraft } from '@/lib/game/career';
import { Portrait } from './portrait';
import { useWallet, watchRewardedAd } from './ads';
import { LockKeyhole, PlayCircle } from 'lucide-react';
const backgroundIcons = [Footprints, Hammer, Coins, Landmark, BriefcaseBusiness];
const educationIcons = [GraduationCap, BookOpen, Scale, BriefcaseBusiness, Shield];
const money = (n: number) => n === 0 ? '$0' : `$${n / 1000}k`;
export function Creation({ draft, setDraft, step, setStep, onBack, onCreate, error }: {
  draft: CharacterDraft; setDraft: (draft: CharacterDraft) => void; step: number; setStep: (step: number) => void; onBack: () => void; onCreate: () => void; error: string;
}) {
  const wallet = useWallet();
  const dynastyLocked = draft.background === 'Political Dynasty' && !wallet.dynastyUnlocked;
  const update = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => setDraft({ ...draft, [key]: value });
  const { t } = useT();
  return <main className="creation screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft /></Button><div><span className="eyebrow">{t('new.eyebrow')}</span><h1>{t('menu.new')}</h1></div><UserRound className="text-primary mx-auto size-4" /></header>
    <div className="stepper" aria-label={`Step ${step} of 3`}>{[t('new.step1'),t('new.step2'),t('new.step3')].map((label,i) => <div key={label} className={`step ${step >= i+1 ? 'active' : ''}`}>{step > i+1 ? <Check /> : <span>0{i+1}</span>} {label}</div>)}</div>
    <div className="screen-body" key={step}>
      {step === 1 && <><h2 className="step-title">{t('new.who')}</h2><p className="step-subtitle">{t('new.whoSub')}</p>
        <label className="field"><span className="field-label">{t('new.name')}</span><input className="game-input" value={draft.name} onChange={e => update('name', e.target.value)} placeholder={t('new.namePh')} maxLength={32} autoComplete="off" /></label>
        <label className="field"><span className="field-label">{t('new.state')}</span><select className="game-input" value={draft.state} onChange={e => { const state = states.find(s => s === e.target.value); if (state) update('state',state); }}>{states.map(s => <option key={s}>{s}</option>)}</select></label>
        <div className="field"><span className="field-label">{t('new.sex')}</span><div className="segmented">{(['Male','Female'] as const).map(sex => <Button key={sex} variant="gameChoice" aria-pressed={draft.sex === sex} onClick={() => update('sex', sex)}>{sex}{draft.sex === sex && <Check />}</Button>)}</div></div>
        <div className="field"><span className="field-label">{t('new.portrait')}</span><div className="portrait-grid">{Array.from({ length: 6 },(_,i) => <Button key={i} variant="gameChoice" className="portrait-choice" aria-label={`Choose portrait ${i+1}`} aria-pressed={draft.portrait === i} onClick={() => update('portrait',i)}><Portrait index={i} />{draft.portrait === i && <span className="portrait-tick"><Check /></span>}</Button>)}</div></div>
      </>}
      {step === 2 && <><h2 className="step-title">{t('new.roots')}</h2><p className="step-subtitle">{t('new.rootsSub')}</p><div className="background-list">{backgrounds.map((b,i) => { const Icon = backgroundIcons[i] ?? Footprints; return <Button key={b.id} variant="gameChoice" className="background-choice" aria-pressed={draft.background === b.id} onClick={() => update('background',b.id)}><span className="choice-icon"><Icon /></span><span className="choice-details"><span className="choice-heading"><strong>{b.id}</strong><span className="difficulty">{backgroundConfig(b.id).difficulty}</span></span><p>{b.description}</p><span className="bg-stats"><span>Cash <b>{money(backgroundConfig(b.id).cash)}</b></span><span>Rep <b>{backgroundConfig(b.id).reputation}</b></span><span>Exp <b>{backgroundConfig(b.id).experience}</b></span></span>{b.id === 'Political Dynasty' && !wallet.dynastyUnlocked && <span className="scenario-flag">🔒 Watch an ad to unlock</span>}{b.id === 'Political Dynasty' && <span className="scenario-flag">Includes 1 Randomized Starting Scenario</span>}</span></Button>; })}</div>{dynastyLocked && <div className="dynasty-lock"><p><LockKeyhole className="inline size-4" /> Political Dynasty is locked. Watch one ad to unlock it on this device.</p><Button variant="game" className="w-full" onClick={() => void watchRewardedAd('dynasty')}><PlayCircle /> Watch ad to unlock</Button></div>}{draft.background === 'Political Dynasty' && <p className="dynasty-note">A fictional family inspired by legacies like the Bushes and Clintons. No affiliation with any real family.</p>}</>}
      {step === 3 && <><h2 className="step-title">{t('new.stand')}</h2><p className="step-subtitle">{t('new.standSub')}</p><div className="field"><span className="field-label">{t('new.identity')}</span><div className="party-grid">{parties.map(p => <Button key={p} variant="gameChoice" aria-pressed={draft.party === p} onClick={() => update('party',p)}><span className={`party-dot ${p.toLowerCase()}`} />{p}</Button>)}</div></div><div className="field"><span className="field-label">{t('new.education')}</span><div className="education-grid">{education.map((e,i) => { const Icon = educationIcons[i] ?? GraduationCap; return <Button key={e} variant="gameChoice" aria-pressed={draft.education === e} onClick={() => update('education',e)}><Icon />{e}{draft.education === e && <Check className="ml-auto" />}</Button>; })}</div></div><div className="review"><span className="eyebrow">Your character</span><div className="review-top"><Portrait index={draft.portrait} /><div className="min-w-0"><strong>{draft.name}</strong><p>{draft.sex} · {draft.state}</p></div></div><div className="review-detail"><span>Roots<br /><b>{draft.background}</b></span><span>Party<br /><b>{draft.party}</b></span><span>Education<br /><b>{draft.education}</b></span><span>Starting age<br /><b>22 years</b></span></div></div></>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    <footer className="screen-actions"><Button variant="gameQuiet" onClick={onBack}><ArrowLeft /> {t('btn.back')}</Button><Button variant="game" disabled={!draft.name.trim() || (step >= 2 && dynastyLocked)} onClick={() => step === 3 ? onCreate() : setStep(step+1)}>{step === 3 ? t('new.create') : t('btn.continue')}{step === 3 ? <Check /> : <ArrowRight />}</Button></footer>
  </main>;
}
