import { TutorialGuide } from './tutorial-guide';
import { ACTION_COST, LOW_ENERGY } from '@/lib/game/energy-costs';
import { useT, type MessageKey } from '@/lib/game/i18n';
import { LanguageSelectModal } from './language-select-modal';
import { LegacyPanel, RetirementDecision } from './legacy-panel';
import type { LegacyRequest } from '@/lib/game/mortality';
import { CoinChip, WatchAdOffer } from './ads';
import { useEffect, useRef, useState } from 'react';
import { ManagerCard } from './dynasty-panels';
import { PastRollCalls } from './legislative-docket-panel';
import { isLegislator, billsPassedThisTenure, ineffectiveRecord } from '@/lib/game/legislative-record';
import { HistoryList } from './history-list';
import { StoryLogPanel } from './story-log';
import { clearHistory } from '@/lib/game/history';
import { pushLoc, popLoc, type NavLoc } from '@/lib/game/nav-stack';
import { ArrowLeft, ArrowRight, House, Landmark, Building2, UsersRound, Ellipsis, CalendarDays, DollarSign, Award, Bell, BookOpen, Flag, Pause, Play, LockKeyhole, Save, Settings, LogOut, Shield, Briefcase, Wallet, Zap, Check, X, Clock, Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppointmentsView } from './appointments-panel';
import { canAccessGovernment, parties, ACTIONS_PER_MONTH, type Career, type Party } from '@/lib/game/career';
import { activities, activityGains, changeParty, opportunities, takePosition, partySwitchConsequences, activityLocks, positionNames, fmt, turnLabel, jobs, jobStatus, applyForJob, acceptOffer, leaveJob, qualifies, monthLabel, type Result } from '@/lib/game/gameplay';
import { Portrait } from './portrait';
import { PoliticsMenu, PoliticalRecords, SupportGroupsPanel, politicalCategories, type PoliticsPanel } from './politics-panels';
import { MediaHub, type MediaTab } from './media-hub';
import { MediaSpringboard } from './media-springboard';
import { Smartphone, Info, Trophy, Bug, Languages, Volume2 } from 'lucide-react';
import { AudioSettingsModal } from './audio-settings-modal';
import { playClick, playTurnAdvance } from '@/lib/game/audio';
import { AboutPanel, AchievementsPanel, MissionChip, applyRewardResult, BugReportPanel, LanguagePanel } from './more-panels';
import { QuitScreen, exitNativeApp } from './quit-screen';
import { hubInvitations } from '@/lib/game/media-hub';
import { socialOf } from '@/lib/game/social-media';
import { CampaignPanel } from './campaign-panel';
import { latestPoll, usd as campaignMoney, resignOffice } from '@/lib/game/campaign';
import { govStats, govActions, govAction, govPriorities, govDeadlines, termProgress } from '@/lib/game/government';
import { officeSalary } from '@/lib/game/office-pay';
import { budgetCategories, taxStances, currentBudget, baselineSpend, indicators, budgetAuthority, proposeBudget, tradeOffs, taxTradeOff, type TaxStance } from '@/lib/game/budget';
import { approvalView } from '@/lib/game/approval';
import { GoverningPanel, GovDrawer } from './governing-panel';
import { executiveOffice, docketQuarter } from '@/lib/game/docket-schema';
import { chamber } from '@/lib/game/support';
import { treasuryFunds, quarterlyTreasuryOutlook } from '@/lib/game/budget';
import { LifeView, type LifePanel } from './life-view';
import { DashboardAttention, type AttentionDestination } from './dashboard-attention';
import { BusinessPanel, BusinessPortfolio, BusinessCreation, BusinessDashboard } from './business-panel';
import { ScandalPanel } from './scandal-panel';
import { CorruptionPanel } from './corruption-panel';
import { LegalPanel, LegalBanner } from './legal-panel';
import { TermPanel } from './term-panel';
import { monthsRemaining } from '@/lib/game/terms';
import { careerBusinessView, businessAction, type BusinessRequest } from '@/lib/game/business';
import { isIncarcerated, PRISON_LOCK } from '@/lib/game/prison';
import { PrisonDashboard } from './prison-dashboard';
import { convictionStatus, ballotRestriction } from '@/lib/game/conviction';
import careerBusinessImg from '@/assets/career-business.jpg';
import { BankPanel } from './bank-panel';
import { netWorthBreakdown } from '@/lib/game/banking';
import type { BankRequest } from '@/lib/game/banking';
import { employmentPay } from '@/lib/game/employment';
import { EmploymentSummary } from './employment-summary';
import { JobListings } from './job-listings';
import { CustodyPanel, StreetPanel } from './civilian-justice';
import type { CrimeRequest } from '@/lib/game/crime';
import type { PardonRequest } from '@/lib/game/pardons';
import { isDetained } from '@/lib/game/prison';
import { jobPerformanceMet } from '@/lib/game/job-market';
import type { StaffRequest, AdRequest } from '@/lib/game/campaign';
import { TreasuryPanel, MoodHeader } from './treasury-panel';
import { ExecutiveDocketPanel, GovernmentImage } from './executive-docket-panel';
import { ImpeachmentPanel } from './impeachment-panel';
import { ChamberChart } from './chamber-chart';
import { LegislatorDirectory, LeadershipContest } from './legislator-directory';
import { ensureLegislature } from '@/lib/game/legislation';
import { resolveDocket, type DocketRequest } from '@/lib/game/executive-docket';
import type { HeartBeatRequest } from '@/lib/game/heartbeat';
export type Section = 'Home' | 'Politics' | 'Government' | 'Life' | 'Career & Business' | 'Media' | 'More';
/** Tabs closed while the player is incarcerated. */
export const PRISON_LOCKED: readonly Section[] = ['Politics', 'Government', 'Life', 'Career & Business', 'Media'];
const nav = [{ name: 'Home', icon: House }, { name: 'Politics', icon: Landmark }, { name: 'Government', icon: Building2 }, { name: 'Life', icon: Sofa }, { name: 'Career & Business', icon: Briefcase }, { name: 'Media', icon: Smartphone }, { name: 'More', icon: Ellipsis }] as const;
const partyLabel = { Democrat: 'Democratic', Republican: 'Republican', Independent: 'Independent' } as const;
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const statusText = { employed: 'Employed here', pending: 'Pending — decision at turn end', offered: 'Offer received', rejected: 'Declined', declined: 'Offer declined', open: 'Not applied' } as const;
type Props = { career: Career; section: Section; setSection: (section: Section) => void; onMenu: () => void; onSave: () => void; onSettings: () => void; saved: boolean; onUpdate: (c: Career) => void; onPoliticalActivity: (id: string, revision: number) => void; onBankRequest?: (request: BankRequest) => void; onCrimeRequest?: (request: CrimeRequest) => void; onPardonRequest?: (request: PardonRequest) => void; onBusinessRequest?: (request: BusinessRequest) => boolean; onAdRequest?: (request: AdRequest) => void; onStaffRequest?: (request: StaffRequest) => void; onDocketRequest?: (request: DocketRequest) => void; onHeartBeatRequest?: (request: HeartBeatRequest) => void; onLegacyRequest?: (request: LegacyRequest) => void; onNotice: (m: string) => void; onAdvance: () => void; focus?: { to: AttentionDestination; n: number } | null };

export function CareerView({ career, section: sectionProp, setSection: setSectionProp, onMenu, onSave, onSettings, saved, onUpdate, onPoliticalActivity, onBankRequest, onCrimeRequest, onPardonRequest, onBusinessRequest, onAdRequest, onStaffRequest, onDocketRequest, onHeartBeatRequest, onLegacyRequest, onNotice, onAdvance, focus }: Props) {
  type Sub = 'history' | 'story' | 'menu' | 'about' | 'achievements' | 'bugs' | 'language' | 'jobs' | 'finance' | 'bank' | 'street' | 'portfolio' | 'invest' | 'company';
  type SocialEntry = 'home' | 'messages' | 'notifications';
  const [sub, rawSub] = useState<Sub>('menu');
  const [lifeEntry, rawLife] = useState<LifePanel>('menu');
  const [socialEntry, rawSocial] = useState<SocialEntry>('home');
  const [politicsPanel, rawPolitics] = useState<PoliticsPanel>('menu');
  const [mediaTab, rawMedia] = useState<MediaTab>('tv');
  const [mediaDeep, setMediaDeep] = useState(false);
  const [jobId, rawJob] = useState<string | null>(null);
  const [businessId, rawBusiness] = useState<string | null>(null);
  const history = useRef<NavLoc[]>([]);
  const here: NavLoc = { section: sectionProp, sub, politicsPanel, jobId, businessId, lifePanel: lifeEntry, socialEntry, mediaTab };
  const remember = () => { history.current = pushLoc(history.current, here); };
  const setSub = (v: Sub) => { if (v !== sub) remember(); rawSub(v); };
  const setLifeEntry = (v: LifePanel) => { if (v !== lifeEntry) remember(); rawLife(v); };
  const setMediaTab = (v: MediaTab) => { if (v !== mediaTab) remember(); rawMedia(v); };
  const openMedia = (t: MediaTab, entry: SocialEntry = 'home') => { remember(); go('Media'); setMediaDeep(true); rawMedia(t); rawSocial(entry); };
  const setPoliticsPanel = (v: PoliticsPanel) => { if (v !== politicsPanel) remember(); rawPolitics(v); };
  const setJobId = (v: string | null) => { if (v !== jobId) remember(); rawJob(v); };
  const setSection = (s: Section) => { if (s !== sectionProp) remember(); setSectionProp(s); };
  const [switchTo, setSwitchTo] = useState<Party | null>(null);
  const [resignConfirm, setResignConfirm] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, number> | null>(null);
  const [taxDraft, setTaxDraft] = useState<TaxStance | null>(null);
  const jailed = isIncarcerated(career);
  const detained = isDetained(career);
  const prisonRevision = useRef(career.legal?.prison?.actionRevision);
  prisonRevision.current = career.legal?.prison?.actionRevision;
  const prisonRun = (r: Result) => {
    if (r.ok) {
      const revision = r.career.legal?.prison?.actionRevision;
      if (revision === undefined || revision !== (prisonRevision.current ?? -1) + 1) return;
      prisonRevision.current = revision;
      onUpdate(r.career);
    }
    onNotice(r.message);
  };
  const section = (detained && (PRISON_LOCKED.includes(sectionProp) || sectionProp === 'More' && sub !== 'menu') ? 'Locked' : sectionProp) as Section | 'Locked';
  const consequences = switchTo ? partySwitchConsequences(career, switchTo) : null;
  const character = career.character;
  const locked = !canAccessGovernment(career);
  const job = career.job ? jobs.find(j => j.id === career.job?.id) : undefined;
  const pay = employmentPay(career);
  const electedSalary = officeSalary(career);
  const run = (r: Result) => { if (r.ok) onUpdate(r.career); onNotice(r.message); };
  const businessRequest = (request: BusinessRequest) => {
    if (onBusinessRequest) return onBusinessRequest(request);
    const result = businessAction(career, request); run(result); return result.ok;
  };
  const openBusiness = (id: string) => { remember(); rawBusiness(id); rawSub('company'); };
  const atRoot = sub === 'menu' && politicsPanel === 'menu' && !jobId && lifeEntry === 'menu';
  const go = (s: Section) => { if (s === sectionProp && atRoot) return; remember(); rawSub('menu'); rawPolitics('menu'); rawJob(null); rawLife('menu'); rawSocial('home'); setMediaDeep(false); setSectionProp(s); };
  const openAttention = (destination: AttentionDestination) => {
    if (detained) return;
    const lifeTargets: Partial<Record<AttentionDestination, LifePanel>> = { rest: 'lifestyle', health: 'food', housing: 'housing', garage: 'garage' };
    const lifeTarget = lifeTargets[destination];
    if (lifeTarget) { go('Life'); setLifeEntry(lifeTarget); if (destination === 'rest') setTimeout(() => document.getElementById('balance-comfort')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); return; }
    if (destination === 'inbox' || destination === 'notifications') { openMedia('s', destination === 'inbox' ? 'messages' : 'notifications'); return; }
    if (destination === 'broadcast') { openMedia(socialOf(career).broadcast?.kind ?? hubInvitations(career)[0]?.channel ?? 'tv'); return; }
    if (destination === 'campaign' || destination === 'legal' || destination === 'scandals') {
      go('Politics'); setPoliticsPanel(destination === 'campaign' ? 'campaigns' : destination); return;
    }
    if (destination === 'jobs') { go('Career & Business'); setSub('jobs'); return; }
    if (destination === 'finance') { go('More'); setSub('finance'); return; }
    if (destination === 'mission') { go('More'); setSub('achievements'); return; }
    go('Government');
    requestAnimationFrame(() => document.getElementById('government-attention')?.scrollIntoView({ block: 'start' }));
  };
  useEffect(() => { if (focus) openAttention(focus.to); }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const inPoliticsPanel = section === 'Politics' && politicsPanel !== 'menu';
  const back = () => {
    const { stack, to } = popLoc(history.current);
    history.current = stack;
    if (to) { rawSub(to.sub as Sub); rawBusiness(to.businessId ?? null); rawPolitics(to.politicsPanel as PoliticsPanel); rawJob(to.jobId); rawLife(to.lifePanel as LifePanel); rawSocial(to.socialEntry as SocialEntry); rawMedia((to.mediaTab ?? 'tv') as MediaTab); setSectionProp(to.section as Section); return; }
    // No history (e.g. after reload or a turn report): step up to the section root, then Home, then menu.
    if (!atRoot) { rawSub('menu'); rawPolitics('menu'); rawJob(null); rawLife('menu'); return; }
    if (sectionProp !== 'Home') { setSectionProp('Home'); return; }
    onMenu();
  };
  const canGoBack = history.current.length > 0 || !atRoot || sectionProp !== 'Home';
  const [quit, setQuit] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const { t } = useT();
  const navLabel = (n: string) => t(`nav.${n}` as MessageKey);
  const title = inPoliticsPanel ? politicalCategories.find(p => p.id === politicsPanel)?.title : section === 'Home' ? (jailed ? 'Prison' : 'Your Life') : section === 'Career & Business' && sub === 'jobs' ? 'Job Listings' : section === 'Career & Business' && sub === 'portfolio' ? 'Portfolio' : section === 'Career & Business' && sub === 'invest' ? 'Invest in Business' : section === 'Career & Business' && sub === 'company' ? 'Company' : section === 'Career & Business' && sub === 'bank' ? 'Bank' : section === 'More' && sub !== 'menu' ? sub === 'history' ? 'History' : sub === 'story' ? 'Story' : sub === 'about' ? 'About' : sub === 'achievements' ? 'Achievements' : sub === 'bugs' ? 'Report Bugs' : sub === 'language' ? 'Language' : 'Finance' : section === 'Locked' ? section : navLabel(section);
  const status = career.office ? career.office.title : career.publicOffice ? 'Office holder' : character.party === 'Independent' ? 'Private citizen' : career.position !== 'none' ? positionNames[career.position] : `${character.party} member`;
  const actionsChip = <span className="actions-chip" aria-label={`${career.actions}% energy left`}><Zap /> {career.actions}%</span>;
  const selected = jobId ? jobs.find(j => j.id === jobId) : undefined;
  const openCampaigns = () => { setSection('Politics'); setPoliticsPanel('campaigns'); };
  if (quit) return <QuitScreen onResume={() => setQuit(false)} />;
  return <main className="career-view screen-enter">
    <header className="screen-header"><Button variant="gameQuiet" size="icon" aria-label={canGoBack ? 'Back' : 'Return to main menu'} title="Back" onClick={back}><ArrowLeft /></Button><div><span className="eyebrow">President · Rise to Power</span><h1>{title}</h1></div><CoinChip /></header>
    <div className={`dashboard-body${section === 'Politics' && politicsPanel === 'media' && mediaTab === 's' ? ' is-social' : section === 'Politics' && politicsPanel === 'media' ? ' is-media' : section === 'Media' ? ' is-media' : ''}`} key={section + sub + politicsPanel + (jobId ?? '')}>
      {section === 'Home' && jailed && <PrisonDashboard career={career} onResult={prisonRun} {...(onPardonRequest ? { onPardon: onPardonRequest } : {})} />}
      {section === 'Home' && career.crime?.arrest?.stage === 'arraigned' && onCrimeRequest && <CustodyPanel career={career} onRequest={onCrimeRequest} />}
      {section === 'Locked' && <div className="placeholder-panel"><div className="panel-emblem"><LockKeyhole /></div><span className="eyebrow">Locked</span><h2>{sectionProp}</h2><p>{PRISON_LOCK}</p><Button variant="gameOutline" onClick={() => go('Home')}><House /> Prison dashboard</Button></div>}
      {section === 'Home' && !detained && <><div className="profile"><Portrait index={character.portrait} /><div className="profile-copy"><span className="eyebrow">{pay.title ?? 'A new beginning'}</span><h2>{character.name}</h2><p>{character.state} · {character.party}</p></div></div><div className="life-date"><span><CalendarDays /> {monthLabel(career.date)}</span><span>Age <b>{career.age}</b></span></div>
        <DashboardAttention career={career} onOpen={openAttention} />
        <MissionChip career={career} apply={r => applyRewardResult(r, onUpdate, onNotice)} />
        <WatchAdOffer label="Watch an ad" />
        <section className="news-widget" aria-label="Latest news"><div className="news-masthead"><span>📰 {career.news[0]?.paper ?? 'The Daily Ledger'}</span><small>{career.news[0] ? monthLabel(career.news[0].date) : 'No edition yet'}</small></div>
          {career.news[0] ? <ul>{career.news[0].stories.slice(0, 3).map((st, i) => <li key={i}>{st.h}</li>)}</ul> : <p className="mini-note">The first edition prints after your next turn.</p>}
          <Button variant="gameQuiet" className="news-link" onClick={() => openMedia('newspaper')}>Read the full paper <ArrowRight /></Button></section>
      {career.office && <section className="dashboard-campaign" aria-label="Current office"><span className="eyebrow">{career.office.title} · {career.office.party}</span><div className="mini-stats"><span>Jurisdiction <b>{career.office.jurisdiction}</b></span><span>Term starts <b>{monthLabel(career.office.since)}</b></span><span>Elected <b>{monthLabel(career.office.elected || career.office.since)}</b></span><span>Term ends <b>{career.office.termEnd ? monthLabel(career.office.termEnd) : '—'}</b></span><span>Remaining <b>{monthsRemaining(career)} months</b></span><span>Won by <b>{fmt(career.office.margin)}%</b></span></div></section>}
      <TermPanel career={career} onResult={run} onCampaigns={openCampaigns} />
      {convictionStatus(career) && <div className="notification"><Shield /><div><b>Post-conviction record</b><p>{ballotRestriction(career) ?? 'Ballot access restored. Your conviction remains in your career history.'}</p></div></div>}
      {career.campaign && <section className="dashboard-campaign" aria-label="Campaign update"><span className="eyebrow">{career.campaign.title} · {career.campaign.phase}</span><div className="mini-stats"><span>Poll estimate <b>{latestPoll(career.campaign)?.shares[character.name] ?? 0}%</b></span><span>Campaign funds <b>{campaignMoney(career.campaign.funds)}</b></span><span>Momentum <b>{fmt(career.campaign.momentum)}</b></span><span>Volunteers <b>{career.campaign.volunteers}</b></span></div></section>}
      <div className="stats"><div className="stat"><div className="stat-label"><DollarSign /> {t('stat.money')}</div><div className="stat-value">{career.money.toLocaleString('en-US')}</div><small>{electedSalary ? `${usd(electedSalary)}/month office pay${job ? ` · ${usd(pay.salary)}/month job` : ''}` : job ? `${usd(pay.salary)}/month salary` : 'No income'}</small></div>{(() => { const w = netWorthBreakdown(career); return <div className="stat"><div className="stat-label"><Wallet /> {t('stat.netWorth')}</div><div className={`stat-value ${w.total < 0 ? 'amt-out' : ''}`}>{usd(Math.round(w.total))}</div><small title="Cash + Savings + Business equity + Real estate − Debts">{usd(Math.round(w.cash + w.savings))} cash & savings · {usd(Math.round(w.businessEquity))} business · {usd(w.realEstate)} property · −{usd(Math.round(w.debts))} debt</small>{onBankRequest && <Button variant="gameOutline" size="sm" className="mt-2" onClick={() => { go('Career & Business'); setSub('bank'); }}><Landmark /> Bank</Button>}</div>; })()}<div className="stat"><div className="stat-label"><Landmark /> {t('stat.status')}</div><div className="stat-value status">{status}</div><small>{fmt(career.experience)} political experience</small></div><div className="stat"><div className="stat-label"><Award /> {t('stat.reputation')}</div><div className="stat-value">{fmt(career.reputation)}<span className="text-muted-foreground text-xs"> / 100</span></div><small>{career.reputation < 10 ? 'Unknown to the public' : 'Known locally'}</small></div><div className="stat"><div className="stat-label"><UsersRound /> {t('stat.relationships')}</div><div className="stat-value">{fmt(career.relationships)}</div><small>{fmt(career.contacts)} political contacts</small></div></div>
      <section className="notifications"><h3 className="section-label">Notifications <Bell /></h3>{career.log.length ? career.log.slice(0, 3).map((m, i) => <div className="notification" key={i}><Flag /><div><p className="mt-0">{m}</p></div></div>) : <div className="notification"><Flag /><div><b>Your story starts here.</b><p>Open Politics to get involved, or Career & Business to find work.</p></div></div>}{career.log.length > 3 && <HistoryList title="All notifications" defaultOpen={false} items={career.log} render={m => <p className="mt-0">{m}</p>} onClear={ix => onUpdate(clearHistory(career, 'notifications', ix))} />}<div className="notification"><Save /><div><b>{saved ? 'Career saved on this device.' : 'Career not saved yet.'}</b><p>{saved ? 'Progress saves automatically.' : 'Open More to try saving again.'}</p></div></div></section></>}

      {section === 'Politics' && politicsPanel === 'menu' && <>
        <div className="panel-row"><span className="eyebrow">{character.party} · {status}</span>{actionsChip}</div>
        <ScandalPanel career={career} compact />
        <PoliticsMenu onOpen={setPoliticsPanel} />
        {!detained && <RetirementDecision career={career} onResult={run} />}
      </>}
      {section === 'Politics' && politicsPanel === 'party' && <>
        <div className="panel-row"><span className="eyebrow">Affiliation · {character.party}</span>{actionsChip}</div>
        <div className="party-switch">{parties.map(p => <Button key={p} variant="gameChoice" aria-pressed={character.party === p} onClick={() => { if (character.party !== p) setSwitchTo(p); }}><span className={`party-dot ${p.toLowerCase()}`} />{partyLabel[p]}</Button>)}</div>
        <p className="mini-note">Party membership is free. Leaving or switching has consequences that grow with your party role.</p>
        <h3 className="section-label mt-3">Political standing</h3>
        <div className="game-row static mt-2"><div><b>{status}</b><p>{character.education} · {character.state}</p></div></div>
        <div className="mini-stats"><span>Experience <b>{fmt(career.experience)}</b></span><span>{t('stat.reputation')} <b>{fmt(career.reputation)}</b></span><span>{t('stat.relationships')} <b>{fmt(career.relationships)}</b></span><span>Contacts <b>{fmt(career.contacts)}</b></span></div>
      </>}
      {section === 'Politics' && politicsPanel === 'activities' && <>
        <div className="panel-row"><span className="eyebrow">{status}</span>{actionsChip}</div>
        <div className="mini-stats"><span>Exp <b>{fmt(career.experience)}</b></span><span>Rep <b>{fmt(career.reputation)}</b></span><span>Comm <b>{fmt(career.skills.communication)}</b></span><span>Lead <b>{fmt(career.skills.leadership)}</b></span><span>Know <b>{fmt(career.skills.knowledge)}</b></span><span>Rel <b>{fmt(career.relationships)}</b></span><span>Contacts <b>{fmt(career.contacts)}</b></span></div>
        <h3 className="section-label mt-3">Activities · 15% energy each</h3>
        <div className="row-list">{activities.filter(a => a.id !== (character.party === 'Independent' ? 'volunteer' : 'campaign')).map(a => { const locks = activityLocks(career, a); return <Button key={a.id} variant="gameChoice" className="game-row h-auto whitespace-normal" disabled={career.actions < ACTION_COST || career.money < a.cost || locks.length > 0 || (a.cost === 0 && career.freePoliticalActivityUsed)} onClick={event => { if (event.detail > 1) return; onPoliticalActivity(a.id, career.politicalActivityRevision); }}><div><b>{locks.length > 0 && <LockKeyhole className="inline size-3" />} {a.name}</b><p>{a.summary} {Object.entries(activityGains(career, a)).map(([k, v]) => `+${fmt(v ?? 0)} ${k}`).join(' · ')}</p>{locks.length > 0 && <p className="reqs">{(a.reqs ?? []).map(r => { const m = r.check(career); return <span key={r.label} className={m ? 'met' : ''}>{m ? <Check /> : <X />}{r.label}</span>; })}</p>}</div><span className="row-cost">{a.cost ? <>{usd(a.cost)}<br /><small>Personal funds</small></> : career.freePoliticalActivityUsed ? 'Used this turn' : <>Free<br /><small>1 per turn</small></>}</span></Button>; })}</div>
        <ManagerCard career={career} onResult={run} />
        <h3 className="section-label mt-3">Opportunities</h3>
        <div className="row-list">{opportunities(career).map(o => { const all = o.reqs.every(r => r.met); return <div key={o.name} className="game-row static"><div><b>{o.name} {o.held ? <span className="tag-ok">Held</span> : all && <span className="tag-ok">Eligible</span>}</b><p>{o.detail}</p><p className="reqs">{o.reqs.map(r => <span key={r.label} className={r.met ? 'met' : ''}>{r.met ? <Check /> : <X />}{r.label}</span>)}</p>{o.id === 'council' && <Button variant="gameOutline" size="sm" className="mt-2" onClick={() => setPoliticsPanel('campaigns')}><Flag />Campaigns & Elections</Button>}{!o.held && !o.future && all && <Button variant="game" size="sm" className="mt-1" disabled={career.actions < ACTION_COST} onClick={() => run(takePosition(career, o.id as 'captain' | 'committee'))}>Take position · 15% energy</Button>}</div></div>; })}</div>
      </>}
      {section === 'Politics' && politicsPanel === 'loyalty' && <SupportGroupsPanel career={career} />}
      {section === 'Politics' && politicsPanel === 'scandals' && <ScandalPanel career={career} onResult={run} />}
      {section === 'Politics' && politicsPanel !== 'legal' && <LegalBanner career={career} onOpen={() => setPoliticsPanel('legal')} />}
      {section === 'Politics' && politicsPanel === 'legal' && <LegalPanel career={career} onResult={run} />}
      {section === 'Politics' && politicsPanel === 'backroom' && <CorruptionPanel career={career} onResult={run} />}
      {section === 'Politics' && politicsPanel === 'campaigns' && <CampaignPanel career={career} onUpdate={onUpdate} onNotice={onNotice} onAdRequest={onAdRequest} onStaffRequest={onStaffRequest} />}
      {section === 'Politics' && politicsPanel === 'groups' && <PoliticalRecords career={career} panel="groups" onUpdate={onUpdate} onNotice={onNotice} />}
      {section === 'Politics' && politicsPanel === 'media' && <MediaHub career={career} tab={mediaTab} onTab={setMediaTab} onUpdate={onUpdate} onNotice={onNotice} socialEntry={socialEntry} />}

      {section === 'Government' && !career.office && career.appointments?.current && <AppointmentsView career={career} onResult={run} onPolitics={() => go('Politics')} />}
      {section === 'Government' && !career.office && !career.appointments?.current && <section className="game-row static" aria-label="Government empty"><div><b>No government role yet</b><p>Win an election or receive an appointment to unlock government.</p></div></section>}
      {section === 'Government' && !locked && career.office && (() => { const gs = govStats(career)!; const exec = executiveOffice(career); const ch = chamber(career); const tp = termProgress(career); const deadlines = govDeadlines(career); const govNews = career.news.flatMap(e => e.stories).filter(s => s.tag === 'government').slice(0, 3); const av = approvalView(career); const bud = currentBudget(career); const base = baselineSpend(career); const ind = indicators(career); const auth = budgetAuthority(career); const draft = budgetDraft ?? bud.spending; const stance = taxDraft ?? bud.stance; const draftRevenue = Math.round(bud.revenue / (bud.stance === 'cut' ? 0.85 : bud.stance === 'raise' ? 1.15 : 1) * (stance === 'cut' ? 0.85 : stance === 'raise' ? 1.15 : 1)); const draftTotal = Math.round(Object.values(draft).reduce((s, v) => s + v, 0)); const draftBalance = draftRevenue - draftTotal; const overBudget = draftTotal > draftRevenue; return <>
        {isLegislator(career) ? (() => { const lc = ensureLegislature(career); return <>
          <section className="exec-bar" aria-label="Office status"><b>{career.office.title}</b><span>{docketQuarter(career.date)} · {tp ? `${tp.monthsLeft} mo left in term` : career.office.jurisdiction}</span><span>Bills passed <b>{billsPassedThisTenure(career)}</b></span></section>
          <section className="exec-bar" aria-label="Approval"><span>Overall approval <b>{gs.approval}%</b></span>{ineffectiveRecord(career) && <span className="amt-out">Flagged: ineffective legislative record</span>}</section>
          {lc.legislature && <ChamberChart career={lc} />}
          <GoverningPanel career={career} onResult={run} part="legislative" />
          <details className="gov-drawer"><summary>Past Roll Calls</summary><div className="gov-drawer-body"><PastRollCalls career={lc} /></div></details>
          {lc.legislature && <details className="gov-drawer"><summary>Lawmaker Directory</summary><div className="gov-drawer-body"><LeadershipContest career={lc} onResult={run} /><LegislatorDirectory career={lc} onResult={run} /></div></details>}
          <details className="gov-drawer"><summary>Bill Archive</summary><div className="gov-drawer-body"><GoverningPanel career={career} onResult={run} part="archive" /></div></details>
        </>; })() : exec ? <><MoodHeader career={career} approval={gs.approval} /><section className="exec-bar" aria-label="Office status"><b>{career.office.title}</b><span>{tp ? `${tp.monthsLeft} mo left` : career.office.jurisdiction} · {docketQuarter(career.date)}</span><span>Approval <b>{gs.approval}%</b></span><span>Coalition <b>{Math.round(ch.allies / Math.max(1, ch.seats) * 100)}%</b></span><span>Treasury <b>{usd(treasuryFunds(career))}</b></span><span>Upkeep <b>{usd(quarterlyTreasuryOutlook(career).maintenance)}/qtr</b></span></section></> : <>
        <div className="panel-row"><span className="eyebrow">{career.office.jurisdiction}</span><span className="tag-ok">In office</span></div>
        <section className="game-card p-4" aria-label="Office status">
          <GovernmentImage career={career} />
          <p className="step-subtitle">{career.office.jurisdiction} · {career.office.party}</p>
          <p className="mini-note">Office salary: {usd(electedSalary)}/month · paid to personal savings each turn</p>
          <div className="mini-stats"><span>Term starts <b>{monthLabel(career.office.since)}</b></span><span>Elected <b>{monthLabel(career.office.elected || career.office.since)}</b></span><span>Won by <b>{fmt(career.office.margin)}%</b></span><span>Term ends <b>{career.office.termEnd ? monthLabel(career.office.termEnd) : '—'}</b></span></div>
          {tp && <div className="mt-3" aria-label={`Term progress ${tp.pct}%`}><div className="panel-row"><small className="mini-note">Term progress</small><small className="mini-note">{tp.pct}% · {tp.monthsLeft} months left</small></div><div className="term-track"><div className="term-fill" style={{ width: `${tp.pct}%` }} /></div></div>}
        </section>
        </>}
        <ImpeachmentPanel career={career} onResult={run} />
        {exec && <TreasuryPanel career={career} onResult={run} />}
        {exec && <ExecutiveDocketPanel career={career} onRequest={onDocketRequest ?? (request => run(resolveDocket(career, request)))} />}
        {!isLegislator(career) && (() => { const lc = ensureLegislature(career); return lc.legislature ? <><ChamberChart career={lc} /><LeadershipContest career={lc} onResult={run} /><LegislatorDirectory career={lc} onResult={run} /></> : null; })()}
        <TermPanel career={career} onResult={run} onCampaigns={openCampaigns} />
        <GoverningPanel career={career} onResult={run} part="crisis" />
        {!isLegislator(career) && <GoverningPanel career={career} onResult={run} part="legislative" />}
        {!exec && <>
        <GoverningPanel career={career} onResult={run} part="departments" />
        <h3 className="section-label mt-3">Public budget · {career.office.jurisdiction}</h3>
        <div className="mini-stats"><span>Revenue <b>{usd(draftRevenue)}</b></span><span>Spending <b>{usd(draftTotal)}</b></span><span>{draftBalance >= 0 ? 'Surplus' : 'Deficit'} <b className={draftBalance >= 0 ? 'amt-in' : 'amt-out'}>{usd(Math.abs(draftBalance))}</b></span></div>
        <div className="mini-stats mt-2"><span>Services <b>{ind.services}</b></span><span>Infrastructure <b>{ind.infrastructure}</b></span><span>Employment <b>{ind.employment}</b></span></div>
        {auth.canPropose ? <>
          <h3 className="section-label mt-3">Taxes</h3>
          <div className="row-list">{taxStances.map(t => <button key={t.id} className="game-row" aria-pressed={stance === t.id} onClick={() => setTaxDraft(t.id)}><div><b>{t.name} {stance === t.id && <span className="tag-ok">Selected</span>}</b><p>{t.note}{t.id !== bud.stance ? ` ${taxTradeOff(t.id).text}` : ''}</p></div></button>)}</div>
          <h3 className="section-label mt-3">Spending · adjust then propose</h3>
          <div className="row-list">{budgetCategories.map(cat => { const step = Math.max(1000, Math.round(base[cat.id] * 0.05)); const val = Math.round(draft[cat.id] ?? base[cat.id]); const move = val > base[cat.id] * 1.05 ? 'more' : val < base[cat.id] * 0.95 ? 'less' : null; const t = move ? tradeOffs(cat.id, move) : null; return <div key={cat.id} className="game-row static"><div><b>{cat.name}</b><p>{cat.desc}{t ? ` ${t.text}` : ''}</p><div className="detail-actions mt-1"><Button variant="gameOutline" size="sm" aria-label={`Cut ${cat.name}`} onClick={() => setBudgetDraft({ ...draft, [cat.id]: Math.max(0, val - step) })}>−</Button><Button variant="gameOutline" size="sm" aria-label={`Increase ${cat.name}`} onClick={() => setBudgetDraft({ ...draft, [cat.id]: val + step })}>+</Button></div></div><span className="row-cost">{usd(val)}</span></div>; })}</div>
          {overBudget && <p className="mini-note mt-2">Over budget: spending exceeds revenue by {usd(draftTotal - draftRevenue)}. Cut spending or raise taxes before proposing.</p>}
          <div className="detail-actions mt-2"><Button variant="game" disabled={career.actions < ACTION_COST || overBudget} onClick={() => { const r = proposeBudget(career, draft as never, stance); if (r.ok) { setBudgetDraft(null); setTaxDraft(null); } run(r); }}><Landmark /> Propose budget · 15% energy</Button>{(budgetDraft || taxDraft) && <Button variant="gameOutline" onClick={() => { setBudgetDraft(null); setTaxDraft(null); }}>Reset draft</Button>}</div>
        </> : <p className="mini-note mt-2">{auth.reason} The current {bud.stance === 'hold' ? 'budget holds taxes steady' : `budget ${bud.stance === 'cut' ? 'cut' : 'raised'} taxes`} with {usd(bud.total)} in spending against {usd(bud.revenue)} revenue.</p>}
        {career.budget && career.budget.proposals.length > 0 && <><h3 className="section-label mt-3">Budget record</h3><div className="row-list">{career.budget.proposals.map((p, i) => <div key={i} className="game-row static"><div><b>{usd(p.total)}</b><p>{p.result}</p></div><span className="row-cost">{monthLabel(p.date)}</span></div>)}</div></>}
        <h3 className="section-label mt-3">Priorities</h3>
        <div className="row-list">{govPriorities(career.office.id as never).map((p, i) => <div key={i} className="game-row static"><div><b>{p}</b></div></div>)}</div>
        <h3 className="section-label mt-3">Decisions · 15% energy each</h3>
        <div className="row-list">{govActions(career).filter(a => !['ordinance', 'bill', 'citybudget', 'statebudget', 'coalition', 'statebudgetvote', 'whip', 'filibuster'].includes(a.id) && !(career.office?.id === 'stateLeg' && a.id === 'committee') && !(career.office?.id === 'president' && a.id === 'order')).map(a => <Button variant="gameChoice" key={a.id} className="game-row" disabled={career.actions < ACTION_COST} onClick={() => run(govAction(career, a.id))}><div><b>{a.name}</b><p>{a.summary} {Object.entries(a.gains).map(([k, v]) => `+${v} ${k}`).join(' · ')}</p></div><span className="row-cost">{a.major ? 'Major' : 'Routine'}</span></Button>)}</div>
        {deadlines.length > 0 && <><h3 className="section-label mt-3">Deadlines</h3><div className="row-list">{deadlines.map((d, i) => <div key={i} className="game-row static"><div><b>{d.label}</b><p>{d.note}</p></div><span className="row-cost">{monthLabel(d.date)}</span></div>)}</div></>}
        {govNews.length > 0 && <><h3 className="section-label mt-3">Government news</h3><div className="row-list">{govNews.map((s, i) => <div key={i} className="game-row static"><div><b>{s.h}</b><p>{s.sub}</p></div></div>)}</div></>}
        </>}
        <GovDrawer on={exec} title="Oversight & Approval">
        <div className="stats mt-3">
          <div className="stat"><div className="stat-label"><Award /> Approval</div><div className="stat-value">{gs.approval}<span className="text-muted-foreground text-xs">%</span></div><small>{gs.approval >= 55 ? 'Strong standing' : gs.approval >= 40 ? 'Mixed reviews' : 'Voters are restless'}</small></div>
          <div className="stat"><div className="stat-label"><Zap /> Influence</div><div className="stat-value">{gs.influence}<span className="text-muted-foreground text-xs">%</span></div><small>Weight inside government</small></div>
          <div className="stat"><div className="stat-label"><Flag /> Party support</div><div className="stat-value">{gs.partySupport === null ? '—' : gs.partySupport}{gs.partySupport !== null && <span className="text-muted-foreground text-xs">%</span>}</div><small>{gs.partySupport === null ? 'No party to lean on' : 'Your party behind you'}</small></div>
          <div className="stat"><div className="stat-label"><Shield /> Opposition</div><div className="stat-value">{gs.opposition}<span className="text-muted-foreground text-xs">%</span></div><small>Working against your agenda</small></div>
        </div>
        {av && <>
          <h3 className="section-label mt-3">Public opinion</h3>
          <div className="mini-stats"><span>Overall <b>{av.overall}%</b></span><span>Party <b>{av.party === null ? '—' : `${av.party}%`}</b></span><span>Independents <b>{av.independent}%</b></span></div>
          <div className="row-list mt-2">{av.groups.map(g => <div key={g.id} className="game-row static"><div><b>{g.name}</b><div className="term-track mt-1" aria-label={`${g.name} support ${Math.round(g.value)}%`}><div className="term-fill" style={{ width: `${Math.round(g.value)}%` }} /></div></div><span className="row-cost">{Math.round(g.value)}%</span></div>)}</div>
          {av.history.length > 0 && <><h3 className="section-label mt-3">Why approval moved</h3><div className="row-list">{av.history.map((h, i) => <div key={i} className="game-row static"><div><b>{h.change === 0 ? 'Starting point' : `${h.change > 0 ? '+' : ''}${h.change}% approval`}</b><p>{h.reason}</p></div><span className="row-cost">{monthLabel(h.date)}</span></div>)}</div></>}
        </>}
        <GoverningPanel career={career} onResult={run} part="records" />
        <h3 className="section-label mt-3">Election record</h3>
        <div className="row-list">{career.elections.filter(e => e.won).map((e, i) => <div key={i} className="game-row static"><div><b>{e.title}</b><p>{e.jurisdiction} · {monthLabel(e.date)} · raised {campaignMoney(e.raised)}</p></div><span className="tag-ok">Won</span></div>)}</div>
        </GovDrawer>
        <div className="detail-actions mt-3">
          {resignConfirm ? <>
            <p className="mini-note">Resign as {career.office.title}? You lose the office, Government access locks, and reputation falls by 2. This cannot be undone.</p>
            <Button variant="game" onClick={() => { run(resignOffice(career)); setResignConfirm(false); }}>Confirm resignation</Button>
            <Button variant="gameOutline" onClick={() => setResignConfirm(false)}>Keep office</Button>
          </> : <Button variant="gameOutline" onClick={() => setResignConfirm(true)}><LogOut /> Resign from office</Button>}
        </div>
      </>; })()}
      {section === 'Media' && <MediaSpringboard career={career} tab={mediaTab} onTab={setMediaTab} onUpdate={onUpdate} onNotice={onNotice} socialEntry={socialEntry} initialApp={mediaDeep ? mediaTab : null} onHeartBeatRequest={onHeartBeatRequest} />}
      {section === 'Life' && <LifeView career={career} onResult={run} panel={lifeEntry} onPanel={p => p === 'menu' ? back() : setLifeEntry(p)} />}
      {section === 'Career & Business' && sub === 'menu' && (() => { const v = careerBusinessView(career); return <div className="cb-overview">
        <figure className="cb-hero"><img src={careerBusinessImg} alt="Office desk with a briefcase at dusk" width={1280} height={640} /><figcaption><span className="eyebrow">Employment</span><b>{v.employed ? v.title : 'Unemployed'}</b></figcaption></figure>
        <div className="stats"><div className="stat"><div className="stat-label"><DollarSign /> Salary / month</div><div className="stat-value">{usd(v.salaryPerMonth)}</div><small>{v.employed ? 'Paid at each month end' : 'No job income'}</small></div><div className="stat"><div className="stat-label"><CalendarDays /> Salary / turn</div><div className="stat-value">{usd(v.salaryPerTurn)}</div><small>3 months per turn</small></div><div className="stat"><div className="stat-label"><Award /> Career level</div><div className="stat-value status">Lv {v.progression.level} · {v.progression.name}</div><small>{v.progression.monthsToNext !== null ? `${v.progression.monthsToNext} months to next level` : 'Top level reached'}</small></div><div className="stat"><div className="stat-label"><Clock /> Months worked</div><div className="stat-value">{fmt(v.workMonths)}</div><small>{v.since ? `In this job since ${monthLabel(v.since)}` : 'Total work history'}</small></div></div>
        {job && career.job && <div className="game-row static current-job mt-3"><div><b>{pay.title}</b><p>{job.skills} each month worked</p></div><Button variant="gameOutline" size="sm" onClick={() => run(leaveJob(career))}>Leave</Button></div>}
        <EmploymentSummary career={career} />
        <Button variant="gameChoice" className="mt-3" onClick={() => setSub('bank')}><Landmark /> Bank <ArrowRight /></Button>
        <Button variant="gameChoice" className="mt-3" onClick={() => setSub('jobs')}><Briefcase /> {v.employed ? 'Browse job listings' : 'Find a job'} <ArrowRight /></Button>
        {onCrimeRequest && <Button variant="gameChoice" className="mt-3" onClick={() => setSub('street')}><Shield /> Illicit opportunities <ArrowRight /></Button>}
        <RetirementDecision career={career} onResult={run} /><BusinessPanel career={career} onPortfolio={() => setSub('portfolio')} onCreate={() => setSub('invest')} />
      </div>; })()}
      {section === 'Career & Business' && sub === 'street' && onCrimeRequest && <StreetPanel career={career} onRequest={onCrimeRequest} />}
      {section === 'Career & Business' && sub === 'portfolio' && <BusinessPortfolio career={career} onSelect={openBusiness} onCreate={() => setSub('invest')} />}
      {section === 'Career & Business' && sub === 'invest' && <BusinessCreation career={career} onRequest={businessRequest} onCreated={() => { rawBusiness(null); rawSub('portfolio'); }} />}
      {section === 'Career & Business' && sub === 'company' && (() => { const b = career.businesses.find(b => b.id === businessId); return b ? <BusinessDashboard career={career} business={b} onRequest={businessRequest} /> : <p className="mini-note">Company not found.</p>; })()}

      {section === 'More' && sub === 'menu' && <><h2 className="step-title">{t('more.title')}</h2><p className="step-subtitle">{character.name} · {character.state}</p><div className="more-list">{career.mode === 'story' && <Button variant="gameChoice" onClick={() => setSub('story')}><BookOpen /> Story <ArrowRight /></Button>}<Button variant="gameChoice" onClick={() => setSub('history')}><Award /> {t('more.history')} <ArrowRight /></Button><Button variant="gameChoice" onClick={() => setSub('finance')}><Wallet /> {t('more.finance')} <ArrowRight /></Button><Button variant="gameChoice" onClick={() => setSub('achievements')}><Trophy /> {t('more.achievements')} <ArrowRight /></Button><Button variant="gameChoice" onClick={() => setSub('about')}><Info /> {t('more.about')} <ArrowRight /></Button><Button variant="gameChoice" onClick={() => setSub('bugs')}><Bug /> {t('more.bugs')} <ArrowRight /></Button><Button variant="gameChoice" onClick={() => setLangOpen(true)}><Languages /> {t('more.language')} <ArrowRight /></Button><Button variant="gameChoice" onClick={() => setAudioOpen(true)}><Volume2 /> Audio &amp; Sound <ArrowRight /></Button><Button variant="gameChoice" onClick={onSettings}><Settings /> {t('menu.settings')} <ArrowRight /></Button><Button variant="gameChoice" onClick={onSave}><Save /> {t('more.saveCareer')} <ArrowRight /></Button><Button variant="gameChoice" onClick={onMenu}><LogOut /> {t('more.mainMenu')} <ArrowRight /></Button><Button variant="gameChoice" onClick={async () => { onSave(); if (!(await exitNativeApp())) setQuit(true); }}><LogOut /> {t('more.quitGame')} <ArrowRight /></Button></div><p className="save-state">{saved ? t('more.saved') : t('more.noSave')}</p></>}

      {section === 'Career & Business' && sub === 'jobs' && !selected && <>
        <div className="panel-row"><span className="eyebrow">{job ? `Employed · ${job.title}` : 'Unemployed'}</span>{actionsChip}</div>
        {job && career.job && <div className="game-row static current-job"><div><b>{pay.title}</b><p>{usd(pay.salary)} paid monthly at month end · since {monthLabel(career.job.since)} · {career.workMonths} months worked</p></div><Button variant="gameOutline" size="sm" onClick={() => run(leaveJob(career))}>Leave</Button></div>}
        <JobListings career={career} onSelect={setJobId} />
      </>}
      {section === 'Career & Business' && sub === 'jobs' && selected && (() => { const s = jobStatus(career, selected.id); const q = qualifies(career, selected); const app = career.applications.find(a => a.jobId === selected.id); return <>
        <h2 className="step-title">{selected.title}</h2><p className="step-subtitle">{selected.description}</p>
        <p className="mini-note">{selected.sector} · {selected.tier === 1 ? 'Entry' : selected.tier === 2 ? 'Professional' : 'Senior / executive'} career</p>
        <div className="mini-stats"><span>Salary <b>{usd(s === 'employed' ? pay.salary : employmentPay({ ...career, job: { id: selected.id, since: career.date } }).salary)}</b></span><span>Paid <b>Monthly</b></span><span>Status <b className={`st-${s}`}>{statusText[s]}</b></span></div>
        <h3 className="section-label mt-3">Requirements</h3>
        <p className="reqs">{selected.requirements.length ? selected.requirements.map(r => { const m = r.check(career); return <span key={r.label} className={m ? 'met' : ''}>{m ? <Check /> : <X />}{r.label}</span>; }) : <span className="met"><Check />None — entry level</span>}</p>
        <p className="mini-note">{selected.skills} each month worked.{app?.reason ? ` Last decision: ${app.reason}.` : ''}</p>
        <p className="mini-note">Quarterly wage: {usd(s === 'employed' ? pay.quarterly : employmentPay({ ...career, job: { id: selected.id, since: career.date } }).quarterly)}. {selected.quarterlyReputation > 0 ? `+${selected.quarterlyReputation} reputation per full quarter when skill standards are met (${jobPerformanceMet(career, selected) ? 'met' : 'not met'}).` : 'No quarterly reputation bonus.'}</p>
        <p className="mini-note">Seniority pay reviews at 12, 36 and 72 total months worked. Higher industry roles require a separate application.</p>
        <div className="detail-actions">
          {s === 'offered' && <Button variant="game" onClick={() => run(acceptOffer(career, selected.id))}><Check /> Accept offer</Button>}
          {(s === 'open' || s === 'rejected' || s === 'declined') && <Button variant="game" disabled={career.actions < ACTION_COST} onClick={() => run(applyForJob(career, selected.id))}><Briefcase /> {s !== 'open' ? 'Reapply' : 'Apply'} · 15% energy</Button>}
          {s === 'pending' && <p className="mini-note"><Clock className="inline size-3" /> Decision arrives when the turn ends. Keep playing meanwhile.</p>}
          {s === 'employed' && <Button variant="gameOutline" onClick={() => run(leaveJob(career))}>Leave job</Button>}
          {(s === 'open' || s === 'rejected' || s === 'declined') && !q && <p className="mini-note">Missing requirements are shown above. Unqualified applications are declined immediately.</p>}
          <Button variant="gameOutline" onClick={back}><ArrowLeft /> All jobs</Button>
        </div></>; })()}

      {section === 'More' && sub === 'finance' && <>
        <div className="mini-stats"><span>Personal balance <b>{usd(career.money)}</b></span><span>Job income <b>{usd(pay.salary)}/mo</b></span><span>Office income <b>{usd(electedSalary)}/mo</b></span><span>Campaign funds <b>{usd(career.campaign?.funds ?? career.warChest)}</b></span></div>
        <EmploymentSummary career={career} />
        <h3 className="section-label mt-3">Office pay history</h3>
        <div className="row-list">{career.officePayHistory.length ? [...career.officePayHistory].reverse().map((p, i) => <div key={`${p.month}-${i}`} className="game-row static"><div><b>{p.title}</b><p>{monthLabel(p.month)} · {p.jurisdiction}</p></div><span className="amt-in">+{usd(p.amount)}</span></div>) : <p className="mini-note">No office salary received.</p>}</div>
        
        <HistoryList title="Transaction ledger" items={career.ledger} empty="No transactions yet. Salaries are paid for each month when a turn ends." render={e => <div className="flex justify-between gap-2"><div><b>{e.label}</b><p className="mini-note mt-0">{monthLabel(e.month)}</p></div><span className={e.amount >= 0 ? 'amt-in' : 'amt-out'}>{e.amount >= 0 ? '+' : '−'}{usd(Math.abs(e.amount))}</span></div>} />
      </>}
      {section === 'More' && sub === 'history' && <LegacyPanel career={career} onUpdate={onUpdate} onNotice={onNotice} onRequest={onLegacyRequest} />}
      {section === 'More' && sub === 'about' && <AboutPanel />}
      {section === 'More' && sub === 'achievements' && <AchievementsPanel career={career} onUpdate={onUpdate} onNotice={onNotice} />}
      {section === 'More' && sub === 'bugs' && <BugReportPanel career={career} onNotice={onNotice} />}
      {section === 'More' && sub === 'language' && <LanguagePanel onNotice={onNotice} />}
      {section === 'More' && sub === 'story' && career.mode === 'story' && <StoryLogPanel career={career} />}
      {section === 'Career & Business' && sub === 'bank' && onBankRequest && <BankPanel career={career} onRequest={onBankRequest} onResult={run} />}
    </div>
    {(section === 'Home' || section === 'Locked' || (section === 'Politics' && !(politicsPanel === 'media' && mediaTab === 's')) || section === 'Government' || section === 'Life' || section === 'Career & Business') && <div className="time-bar"><div><span className="eyebrow">{turnLabel(career.date)}</span><br /><small>{t('turn.actionsLeft', { n: career.actions, max: ACTIONS_PER_MONTH })}{job ? ` · paid monthly` : ''}</small></div><div className="time-controls"><span className={`energy-chip${career.actions <= LOW_ENERGY ? ' low' : ''}`} aria-label={`Energy ${career.actions}%`}><Zap /> {career.actions}%</span><Button variant="gameOutline" size="icon" aria-label="Paused" title="Paused" disabled><Pause /></Button><Button variant="game" size="sm" aria-label={t('turn.next')} title="Advance 3 months" onClick={() => { playTurnAdvance(); onAdvance(); }}><Play /> {t('turn.next')}</Button></div></div>}
    {switchTo && consequences && <div className="modal-backdrop" onClick={() => setSwitchTo(null)}><section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="switch-title" onClick={e => e.stopPropagation()}><div className="modal-head"><h2 id="switch-title">{character.party === 'Independent' ? `Join the ${partyLabel[switchTo]} Party?` : switchTo === 'Independent' ? `Leave the ${partyLabel[character.party]} Party?` : `Switch to the ${partyLabel[switchTo]} Party?`}</h2></div><p>Consequences:</p><ul className="mini-note">{consequences.lines.map(l => <li key={l}>• {l}</li>)}</ul><div className="modal-actions"><Button variant="game" onClick={() => { run(changeParty(career, switchTo)); setSwitchTo(null); }}>{t('btn.confirm')}</Button><Button variant="gameOutline" onClick={() => setSwitchTo(null)}>{t('btn.cancel')}</Button></div></section></div>}
    <nav className="bottom-nav" aria-label="Career navigation">{nav.map(({name,icon:Icon}) => <Button key={name} variant="gameNav" aria-label={navLabel(name)} title={navLabel(name)} aria-current={sectionProp === name ? 'page' : undefined} onClick={() => { playClick(); go(name); }}>{jailed && PRISON_LOCKED.includes(name) ? <LockKeyhole /> : <Icon />}{sectionProp === name && <span>{navLabel(name)}</span>}</Button>)}</nav>
    <TutorialGuide career={career} onJobs={() => { go('Career & Business'); rawSub('jobs'); }} onActivities={() => { go('Politics'); rawPolitics('activities'); }} />
    {audioOpen && <AudioSettingsModal onClose={() => setAudioOpen(false)} />}
    {langOpen && <LanguageSelectModal onClose={() => setLangOpen(false)} onDone={(_, label) => { onNotice(t('lang.set', { label })); setLangOpen(false); }} />}
  </main>;
}
