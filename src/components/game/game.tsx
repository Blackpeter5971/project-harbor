import { ACTION_COST } from '@/lib/game/energy-costs';
import { useHydrated } from '@tanstack/react-router';
import { useStoredLocale } from '@/lib/game/i18n';
import { installAudioLifecycle, playSound, useAudioSettings } from '@/lib/game/audio';
import { moodFor, refreshMusicVolume, setMusicMood, stopMusic } from '@/lib/game/music-player';
import { activityCue, careerCues, dramaCues } from '@/lib/game/audio-cues';
import { LanguageSelectModal } from './language-select-modal';
import { StudioIntro } from './studio-intro';
import { AdHost, AdBanner } from './ads';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CloudSavePanel } from './cloud-save-panel';
import { readVerified, writeSigned } from '@/lib/game/save-integrity';
import { createCareer, createStoryCareer, defaultDraft, parseCareer, SAVE_KEY, type Career, type CharacterDraft } from '@/lib/game/career';
import { STORY_SAVE_KEY, readStoryProgress, recordScenarioComplete, type GameMode } from '@/lib/game/story-mode';
import { advanceStory, applyStoryChoice, narrativeFor, pendingStoryEvent, storyEnding, storyFinished } from '@/lib/game/story-engine';
import { applyStoryCareerEffects } from '@/lib/game/story-effects';
import { StoryCard } from './story-card';
import { StoryEndingCard } from './story-ending';
import { MainMenu } from './main-menu';
import { ModeSelect } from './mode-select';
import { StoryMenu } from './story-menu';
import { StoryStage, usesStoryStage, ensureSession } from './story-stage';
import { Creation } from './creation';
import { StoryCreation } from './story-creation';
import { SCENARIOS } from '@/lib/game/story-mode';
import { StartingBriefing } from './starting-briefing';
import { AnnualReportModal } from './treasury-panel';
import { pendingAnnualReport, dismissAnnualReport } from '@/lib/game/government-finance';
import { advanceTurn, doActivity, getEvent, resolveEvent, continueAfterNewspaper, continueTurnReport, pendingOffer, acceptOffer, declineOffer, type Result } from '@/lib/game/gameplay';
import { CareerView, type Section } from './career-view';
import { ElectionResults } from './election-results';
import { Balloons } from './balloons';
import { chooseTransition } from '@/lib/game/transition';
import { TurnLoading, periodLabel, randomTip, turnWarnings } from './turn-loading';
import { TurnNewspaper } from './turn-newspaper';
import { EventModal } from './event-modal';
import { TurnEventHighlights } from './turn-event-highlights';
import { NetworkReportCards } from './network-report';
import { QuarterlyReport } from './quarterly-report';
import { AppointmentReportCards } from './appointments-panel';
import { requestTreasuryTab } from './treasury-tab';
import { ScandalPanel } from './scandal-panel';
import { CareerOver } from './prison-dashboard';
import { continueAsHeir, isExecuted } from '@/lib/game/prison';
import { dismissDebate, respondDebate } from '@/lib/game/debates';
import { DebateModal } from './debate-modal';
import { EndgameSequence } from './legacy-panel';
import { captureLegacy, carryArchive, legacyOf } from '@/lib/game/legacy';
import { preserveArchive } from '@/lib/game/legacy-storage';
import { concludeDeath, securityAction, type LegacyRequest } from '@/lib/game/mortality';
import { dynastyOf } from '@/lib/game/dynasty';
import { attentionBlocker } from '@/lib/game/attention-blocker';
import type { AttentionDestination } from './dashboard-attention';
import { bankAction, type BankRequest } from '@/lib/game/banking';
import { employmentPay } from '@/lib/game/employment';
import { crimeAction, type CrimeRequest } from '@/lib/game/crime';
import { petitionPardon, type PardonRequest } from '@/lib/game/pardons';
import { ArrestIntake } from './civilian-justice';
import { businessAction, type BusinessRequest } from '@/lib/game/business';
import { purchaseCampaignAd, campaignStaffAction, type StaffRequest, type AdRequest } from '@/lib/game/campaign';
import { docketBlocker, ensureExecutiveDocket, resolveDocket, type DocketRequest } from '@/lib/game/executive-docket';
import { heartBeatAction, type HeartBeatRequest } from '@/lib/game/heartbeat';
export type TurnPhase = 'idle' | 'loading' | 'report' | 'newspaper' | 'story' | 'debate' | 'event';
export function Game() {
  const [intro,setIntro] = useState(true);
  const hydrated = useHydrated();
  const storedLocale = useStoredLocale();
  const endIntro = useCallback(() => setIntro(false), []);
  const [screen,setScreen] = useState<'menu'|'mode'|'story'|'creation'|'career'>('menu');
  const [savedCareer,setSavedCareer] = useState<Career|null>(null);
  const [savedStory,setSavedStory] = useState<Career|null>(null);
  const [mode,setMode] = useState<GameMode>('sandbox');
  const [scenarioId,setScenarioId] = useState<string|null>(null);
  const [pendingStart,setPendingStart] = useState<{ mode: GameMode; scenarioId?: string } | null>(null);
  const [storyCompleted,setStoryCompleted] = useState<string[]>([]);
  const [career,setCareer] = useState<Career|null>(null);
  const [briefing,setBriefing] = useState(false);
  const [draft,setDraft] = useState<CharacterDraft>({...defaultDraft});
  const [step,setStep] = useState(1);
  const [section,setSection] = useState<Section>('Home');
  const [modal,setModal] = useState<'settings'|'replace'|'continue'|null>(null);
  const [reducedMotion,setReducedMotion] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [focus,setFocus] = useState<{ to: AttentionDestination; n: number } | null>(null);
  const [phase,setPhaseState] = useState<TurnPhase>('idle');
  const phaseRef = useRef<TurnPhase>('idle');
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const eventBusy = useRef(false);
  const careerRef = useRef<Career | null>(null);
  const setPhase = (p: TurnPhase) => { phaseRef.current = p; setPhaseState(p); };
  const [loading,setLoading] = useState<{ period: string; tip: string; warnings: string[] } | null>(null);
  useEffect(() => {
    try { const main = readVerified(localStorage, SAVE_KEY); const story = readVerified(localStorage, STORY_SAVE_KEY); if (main.tampered || story.tampered) setNotice('A modified save was detected and rejected.'); const loaded = parseCareer(main.data); setSavedCareer(loaded ? preserveArchive(loaded, localStorage) : null); setSavedStory(parseCareer(story.data)); setStoryCompleted(readStoryProgress(localStorage)); setReducedMotion(localStorage.getItem('president-reduced-motion') === 'true'); } catch { /* Storage is optional; keep Continue disabled. */ }
  },[]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''),3500); return () => clearTimeout(id); },[notice]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useEffect(() => installAudioLifecycle(), []);
  const audioSettings = useAudioSettings();
  useEffect(() => { refreshMusicVolume(); }, [audioSettings]);
  const musicMood = moodFor(screen, career);
  useEffect(() => { const start = () => setMusicMood(musicMood); start(); window.addEventListener('pointerdown', start, { once: true }); return () => window.removeEventListener('pointerdown', start); }, [musicMood]);
  useEffect(() => () => stopMusic(), []);
  useEffect(() => { if (!modal) return; const close = (e: KeyboardEvent) => { if(e.key === 'Escape') setModal(null); }; document.addEventListener('keydown',close); return () => document.removeEventListener('keydown',close); },[modal]);
  function startNew() { setPendingStart(null); setScreen('mode'); setModal(null); }
  function beginCreation(nextMode: GameMode, nextScenarioId?: string) {
    setMode(nextMode); setScenarioId(nextScenarioId ?? null);
    setDraft({...defaultDraft}); setStep(1); setError(''); setScreen('creation'); setModal(null); setPendingStart(null);
  }
  function pickMode(nextMode: GameMode) {
    if (nextMode === 'story') { setScreen('story'); return; }
    if (savedCareer) { setPendingStart({ mode: 'sandbox' }); setModal('replace'); return; }
    beginCreation('sandbox');
  }
  function pickScenario(id: string) {
    if (savedStory) { setPendingStart({ mode: 'story', scenarioId: id }); setModal('replace'); return; }
    beginCreation('story', id);
  }
  // Phase after the turn report / newspaper chain: story cards come after the newspaper, before contextual events.
  const afterTurnPhase = (next: Career): TurnPhase => next.newspaperPending ? 'newspaper' : pendingStoryEvent(next) ? 'story' : getEvent(next) ? 'event' : 'idle';
  function continueCareer(saved: Career) {
    if (usesStoryStage(saved) && saved.story && !saved.story.session) { update({ ...saved, story: ensureSession(saved.story) }); setMode('story'); setPhase('idle'); setScreen('career'); return; }
    careerRef.current = saved; setCareer(saved); setMode(saved.mode);
    setPhase(saved.report ? 'report' : afterTurnPhase(saved));
    setSection('Home'); setScreen('career');
  }
  function save(next: Career) {
    const key = next.mode === 'story' ? STORY_SAVE_KEY : SAVE_KEY;
    try { next = preserveArchive(next, localStorage); writeSigned(localStorage, key, JSON.stringify(next)); if (!parseCareer(readVerified(localStorage, key).data)) throw new Error('Save failed'); if (next.mode === 'story') setSavedStory(careerRef.current ?? next); else setSavedCareer(careerRef.current ?? next); return true; } catch { setNotice('Saving is unavailable in this browser. Your career is still open.'); return false; }
  }
  function update(next: Career) { if (isExecuted(next) && !legacyOf(next).death) next = concludeDeath(next, 'Execution following a recorded court sentence'); let prepared = captureLegacy(ensureExecutiveDocket(next)); try { prepared = preserveArchive(prepared, localStorage); } catch { setNotice('Permanent history could not be saved on this device. Export your career to keep a backup.'); } const prev = careerRef.current; if (prev && prev.date === prepared.date && prepared.actions < prev.actions * ACTION_COST) playSound('action'); try { [...careerCues(prev, prepared), ...dramaCues(prev, prepared)].forEach(playSound); } catch { /* sound is optional */ } careerRef.current = prepared; setCareer(prepared); save(prepared); }
  function legacyAction(request: LegacyRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = securityAction(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
  }
  function governing(request: DocketRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = resolveDocket(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
  }
  function politicalActivity(id: string, revision: number) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = doActivity(current, id, revision);
    if (result.ok) { const cue = activityCue(id); if (cue) playSound(cue); update(result.career); }
    setNotice(result.message);
  }
  function banking(request: BankRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = bankAction(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
  }
  function advertising(request: AdRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = purchaseCampaignAd(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
  }
  function staffing(request: StaffRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = campaignStaffAction(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
  }
  function heartbeat(request: HeartBeatRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = heartBeatAction(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
  }
  function advance() {
    if (!career || career.crime?.arrest?.stage === 'intake' || career.debate || busy.current || phaseRef.current !== 'idle' || career.report || career.newspaperPending || career.pendingEvent || career.eventEncounter) return;
    const current = careerRef.current;
    if (!current) return;
    const blocked = !current.legal?.prison && docketBlocker(current);
    if (blocked) { setNotice(blocked); setSection('Government'); return; }
    const attention = attentionBlocker(current);
    if (attention) { setNotice(attention.message); setFocus(f => ({ to: attention.to, n: (f?.n ?? 0) + 1 })); return; }
    busy.current = true; phaseRef.current = 'loading'; setNotice('');
    setLoading({ period: periodLabel(career.date), tip: randomTip(), warnings: turnWarnings(career) });
    setPhase('loading');
    // Yield a frame so loading is visible before synchronous turn processing.
    timers.current.push(setTimeout(() => { const turned = advanceTurn(current).career; update(current.mode === 'story' ? advanceStory(turned) : turned); }, 0));
    const delay = reducedMotion ? 600 : 1500;
    timers.current.push(setTimeout(() => { setPhase('report'); busy.current = false; }, delay));
  }
  function finish() { try { const fresh = mode === 'story' && scenarioId ? createStoryCareer(draft, scenarioId) : createCareer(draft); const previous = careerRef.current ?? (mode === 'story' ? savedStory : savedCareer); const carried = previous ? carryArchive(fresh, previous) : fresh; const next = usesStoryStage(carried) && carried.story ? { ...carried, story: ensureSession(carried.story) } : carried; update(next); if (!usesStoryStage(next)) { try { localStorage.setItem('president-tutorial', '0'); } catch { /* ignore */ } } setBriefing(!usesStoryStage(next)); setSection('Home'); setScreen('career'); } catch { setError('Please check your character choices before continuing.'); } }
  function civilian(request: CrimeRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = crimeAction(current, request);
    if (result.ok) { update(result.career); if (result.career.crime?.arrest || result.career.legal?.prison) setSection('Home'); }
    setNotice(result.message);
  }
  function pardon(request: PardonRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return;
    const result = petitionPardon(current, request);
    if (result.ok) { update(result.career); setSection('Home'); }
    setNotice(result.message);
  }
  function business(request: BusinessRequest) {
    const current = careerRef.current;
    if (!current || busy.current || phaseRef.current !== 'idle') return false;
    const result = businessAction(current, request);
    if (result.ok) update(result.career);
    setNotice(result.message);
    return result.ok;
  }
  return <div className={`game-stage ${reducedMotion ? 'reduced-motion' : ''}`}><div className="game-shell">{intro && <StudioIntro onDone={endIntro} />}<AdHost />
    {hydrated && !intro && storedLocale === null && <LanguageSelectModal />}
    {screen === 'menu' && <MainMenu hasSave={savedCareer !== null || savedStory !== null} onNew={startNew} onContinue={() => { if (savedCareer && savedStory) { setModal('continue'); return; } const only = savedCareer ?? savedStory; if (only) continueCareer(only); }} onSettings={() => setModal('settings')} />}
    {screen === 'mode' && <ModeSelect onPick={pickMode} onBack={() => setScreen('menu')} />}
    {screen === 'story' && <StoryMenu completed={storyCompleted} hasStorySave={savedStory !== null} onSelect={pickScenario} onContinue={() => { if(!savedStory) return; continueCareer(savedStory); }} onBack={() => setScreen('mode')} />}
    {screen === 'creation' && mode === 'story' && <StoryCreation draft={draft} setDraft={setDraft} onBack={() => setScreen('story')} onCreate={finish} error={error} />}
    {screen === 'creation' && mode !== 'story' && <Creation draft={draft} setDraft={setDraft} step={step} setStep={setStep} onBack={() => step > 1 ? setStep(step-1) : setScreen('mode')} onCreate={finish} error={error} />}
    {screen === 'career' && career && usesStoryStage(career) && <StoryStage career={career} onUpdate={update} reducedMotion={reducedMotion} onExit={() => { save(career); setScreen('story'); }} />}
    {screen === 'career' && career && !usesStoryStage(career) && <CareerView career={career} section={section} setSection={setSection} onMenu={() => setScreen('menu')} onSave={() => { if(save(career)) setNotice('Career saved on this device.'); }} onSettings={() => setModal('settings')} saved={savedCareer === career} onUpdate={update} onPoliticalActivity={politicalActivity} onBankRequest={banking} onCrimeRequest={civilian} onPardonRequest={pardon} onBusinessRequest={business} onAdRequest={advertising} onStaffRequest={staffing} onDocketRequest={governing} onHeartBeatRequest={heartbeat} onLegacyRequest={legacyAction} onNotice={setNotice} onAdvance={advance} focus={focus} />}
    {screen === 'career' && career && !usesStoryStage(career) && phase === 'loading' && loading && <TurnLoading {...loading} />}
    {screen === 'career' && career && !usesStoryStage(career) && phase !== 'loading' && (() => { const run = (r: Result) => { if (r.ok) update(r.career); setNotice(r.message); }; const ev = getEvent(career); const offer = pendingOffer(career);
      if (career.crime?.arrest?.stage === 'intake') return <ArrestIntake key={career.crime.arrest.id} career={career} onRequest={civilian} />;
      if (career.report) { const recent = career.elections.filter(e => e.date >= career.date || (new Date(career.date).getTime() - new Date(e.date).getTime()) / 86400000 <= 93); return <QuarterlyReport career={career} onContinue={() => { const next = continueTurnReport(career); update(next); setPhase(afterTurnPhase(next)); if (!next.newspaperPending && !getEvent(next)) setSection('Home'); }}><ScandalPanel career={career} compact />{recent.some(r => r.stage === 'general' && r.won) && <Balloons />}{recent.map((r, i) => <ElectionResults key={`${r.date}-${r.stage}-${i}`} result={r} me={career.character.name} career={career} onTransition={choice => run(chooseTransition(career, choice))} />)}<NetworkReportCards career={career} /><AppointmentReportCards career={career} /><TurnEventHighlights career={career} onOpen={() => { const next = continueTurnReport(career); update(next); setPhase(afterTurnPhase(next)); requestTreasuryTab('events'); setSection('Government'); }} /></QuarterlyReport>; }
      if ((career.newspaperPending || phase === 'newspaper') && career.news[0]) return <TurnNewspaper edition={career.news[0]} onContinue={() => { const next = continueAfterNewspaper(career); update(next); setPhase(afterTurnPhase(next)); if (!pendingStoryEvent(next) && !getEvent(next)) setSection('Home'); }} />;
      if (phase === 'story' && !career.report && !career.newspaperPending) { const sev = pendingStoryEvent(career); const narr = career.story ? narrativeFor(career.story.scenarioId) : undefined;
        if (sev && narr) return <StoryCard event={sev} narrative={narr} onChoose={(eventId, choiceId) => {
          if (eventBusy.current) return;
          eventBusy.current = true;
          const result = applyStoryChoice(career, eventId, choiceId);
          if (result.ok && result.effects.career) {
            // Election integration: apply the declared real-game effects through existing systems.
            const withFx = applyStoryCareerEffects(result.career, result.effects.career);
            run({ ok: true, career: withFx, message: result.message });
          } else run(result);
          if (result.ok) {
            const st = result.career.story;
            if (st && (st.ending || storyFinished(st))) { try { recordScenarioComplete(localStorage, st.scenarioId); setStoryCompleted(readStoryProgress(localStorage)); } catch { /* storage optional */ } }
            // Stay in the story phase when an ending card is waiting to be shown.
            setPhase(result.career.story?.ending ? 'story' : getEvent(result.career) ? 'event' : 'idle'); setSection('Home');
          }
          queueMicrotask(() => { eventBusy.current = false; });
        }} />;
        const ending = storyEnding(career);
        if (ending && narr) return <StoryEndingCard ending={ending} narrative={narr} onContinue={() => { setPhase('idle'); setSection('Home'); }} />;
        queueMicrotask(() => setPhase('idle'));
      }
      if (!career.newspaperPending && phase !== 'newspaper' && !career.pendingEvent && pendingAnnualReport(career)) return <AnnualReportModal report={pendingAnnualReport(career)!} onClose={() => update(dismissAnnualReport(career))} />;
      if (career.debate && !career.report && !career.newspaperPending) return <DebateModal career={career} onChoice={(id, round, choice) => {
        const current = careerRef.current;
        if (!current || eventBusy.current) return;
        eventBusy.current = true;
        run(respondDebate(current, id, round, choice));
        setPhase('debate');
        queueMicrotask(() => { eventBusy.current = false; });
      }} onClose={() => {
        const current = careerRef.current;
        if (!current?.debate) return;
        const next = continueAfterNewspaper(dismissDebate(current, current.debate.id));
        update(next); setPhase(getEvent(next) ? 'event' : 'idle'); setSection('Home');
      }} />;
      if (ev) return <EventModal key={ev.id} event={ev} career={career} onChoose={choice => {
        const current = careerRef.current;
        if (!current || eventBusy.current || getEvent(current)?.id !== ev.id) return;
        eventBusy.current = true;
        const result = resolveEvent(current, choice);
        run(result);
        if (result.ok) { setPhase('idle'); setSection('Home'); }
        queueMicrotask(() => { eventBusy.current = false; });
      }} />;
      if (offer) { const offeredPay = employmentPay({ ...career, job: { id: offer.id, since: career.date } }); return <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title"><div className="modal-head"><h2 id="offer-title">Job offer: {offeredPay.title}</h2></div><p>{offer.description}</p><ul className="mini-note"><li>• Salary: ${offeredPay.salary.toLocaleString('en-US')} per month · ${offeredPay.quarterly.toLocaleString('en-US')} per quarter</li><li>• Paid monthly, settled at the end of each 3-month turn</li><li>• {offer.skills} each month worked</li>{career.job && <li>• Accepting replaces your current job</li>}<li>• You can leave the job later from Career & Business</li></ul><div className="modal-actions"><Button variant="game" onClick={() => run(acceptOffer(career, offer.id))}>Accept Job</Button><Button variant="gameOutline" onClick={() => run(declineOffer(career, offer.id))}>Decline Offer</Button></div></section></div>; }
      if (legacyOf(career).death || dynastyOf(career).retired && !legacyOf(career).retirementSeen) return <EndgameSequence key={`${legacyOf(career).owner}|${legacyOf(career).death ? 'death' : 'retired'}`} career={career} onNew={startNew} onMenu={() => setScreen('menu')} onContinue={() => { update({ ...career, legacy: { ...legacyOf(career), retirementSeen: true } }); setPhase('idle'); setSection('Life'); }} onResult={r => { if (r.ok) { update(r.career); setPhase('idle'); setSection('Home'); } setNotice(r.message); }} />;
      if (isExecuted(career)) return <CareerOver career={career} onNew={startNew} onHeir={() => { const next = continueAsHeir(career); if (next) { update(next); setSection('Home'); setNotice(`You now play as ${next.character.name}.`); } }} />;
      if (briefing) return <StartingBriefing career={career} onClose={() => setBriefing(false)} />;
      return null; })()}
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className={`game-modal ${modal === 'settings' ? 'settings-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><div className="modal-head"><h2 id="modal-title">{modal === 'settings' ? 'Settings' : modal === 'continue' ? 'Which game do you want to continue?' : pendingStart?.mode === 'story' ? 'Start a new story?' : 'Start a new career?'}</h2><Button autoFocus variant="gameQuiet" size="icon" aria-label="Close" onClick={() => setModal(null)}><X /></Button></div>{modal === 'settings' ? <><label className="setting-row">Reduce motion<input type="checkbox" checked={reducedMotion} onChange={e => {setReducedMotion(e.target.checked); try {localStorage.setItem('president-reduced-motion',String(e.target.checked));} catch { /* In-memory preference still works. */ } }} /></label><CloudSavePanel /><p>President: Rise to Power<br />Crosian Games · Foundation v0.1</p><Button variant="gameOutline" className="w-full mt-3" onClick={() => setModal(null)}>Done</Button></> : modal === 'continue' ? <div className="modal-actions" style={{ flexDirection: 'column' }}>
      {savedCareer && <Button variant="game" className="w-full" onClick={() => { setModal(null); continueCareer(savedCareer); }}>Sandbox career · {savedCareer.character.name} · {savedCareer.date.slice(0, 4)}</Button>}
      {savedStory && <Button variant="gameOutline" className="w-full" onClick={() => { setModal(null); continueCareer(savedStory); }}>Story · {SCENARIOS.find(s => s.id === savedStory.story?.scenarioId)?.title ?? 'Story Mode'} · Act {savedStory.story?.act ?? 1}, Ch. {savedStory.story?.chapter ?? 1}</Button>}
    </div> : <><p>Your current {pendingStart?.mode === 'story' ? 'story' : 'sandbox'} save will be replaced only when you create the new character.{pendingStart?.mode === 'story' ? ' Your sandbox career is safe.' : ' Your story careers are safe.'}</p><div className="modal-actions"><Button variant="game" onClick={() => pendingStart && beginCreation(pendingStart.mode, pendingStart.scenarioId)}>New Career</Button><Button variant="gameOutline" onClick={() => { setModal(null); setPendingStart(null); }}>Keep current career</Button></div></>}</section></div>}
    {notice && <div role="status" className="toast">{notice}</div>}
    {screen === 'career' && career?.mode === 'story' && <AdBanner />}
  </div></div>;
}
