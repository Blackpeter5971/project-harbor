import { useEffect, useMemo, useRef, useState } from 'react';
import { IntermissionVideo } from './intermission-video';
import { ArrowRight, BookOpen, LogOut, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CoinChip } from './ads';
import type { Career } from '@/lib/game/career';
import { formatStoryText, type StorySex } from '@/lib/game/story-text';
import { scenePrelude } from '@/lib/game/story-engine';
import { chooseScene, continueScene, ensureSession, evaluateStageEnding, narrativeFor, replayStory, sceneById, sceneScriptFor, stageEndingById } from '@/lib/game/story-engine';
import { STORY_PORTRAITS } from '@/lib/game/story-portraits';
import { BACKDROPS } from './story-backdrops';
import act1 from '@/assets/scenes/act-1-spark.jpg';
import { StoryEndingScreen } from './story-ending';
import { recordEndingDiscovered } from '@/lib/game/story-mode';
import { portraitImages } from './portrait';
import { NationalLedgerSheet } from './national-ledger-sheet';
import { WarMapSheet } from './war-map-sheet';
import { WarRoomSheet } from './war-room-sheet';
import { CIVIL_WAR_ID } from '@/lib/game/civil-war/civil-war-script';
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

function useTypewriter(text: string, instant: boolean) {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (instant) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN(v => { if (v >= text.length) { clearInterval(id); return v; } return v + 2; }), 22);
    return () => clearInterval(id);
  }, [text, instant]);
  return { shown: text.slice(0, n), done: n >= text.length, skip: () => setN(text.length) };
}

/** Full-screen cinematic story stage; replaces the sandbox career screen in Story Mode. */
export function StoryStage({ career, onUpdate, onExit, reducedMotion }: { career: Career; onUpdate: (c: Career) => void; onExit: () => void; reducedMotion: boolean }) {
  const story = career.story!;
  const script = sceneScriptFor(story.scenarioId)!;
  const narrative = narrativeFor(story.scenarioId);
  const session = story.session!;
  const scene = sceneById(script, session.sceneId)!;
  const choice = scene.choices?.find(c => c.id === session.pendingChoice);
  const [playerSpeaking, setPlayerSpeaking] = useState(false);
  const [intermission, setIntermission] = useState<{ next: NonNullable<Career['story']>; act: number; chapter: number; actEnded: boolean; picks: string[]; meterDelta: Record<string, number> } | null>(null);
  const meName = career.character.name;
  const mePortrait = portraitImages[career.character.portrait] ?? portraitImages[0];
  const fmt = (t: string) => formatStoryText(t, { name: meName, sex: career.character.sex as StorySex });
  const prelude = useMemo(() => scenePrelude(scene), [scene]);
  const [stepState, setStepState] = useState<{ sceneId: string; step: number }>({ sceneId: '', step: 0 });
  const stepIdx = choice ? prelude.length : stepState.sceneId === scene.id ? stepState.step : 0;
  const step = stepIdx < prelude.length ? prelude[stepIdx] : null;
  const text = fmt(step ? (step.kind === 'establishing' ? step.narration : step.beat.text) : choice ? (playerSpeaking ? `“${choice.label}”` : choice.reactionText) : scene.dialogue);
  const direction = step ? (step.kind === 'beat' ? step.beat.stageDirection : undefined) : !choice ? scene.stageDirection : undefined;
  const expression = choice?.reactionExpression ?? scene.speaker.expression ?? 'neutral';
  const tw = useTypewriter(text, reducedMotion);
  const [pills, setPills] = useState<{ key: number; text: string }[]>([]);
  const pillKey = useRef(0);
  const busy = useRef(false);

  const commit = (next: Career['story']) => onUpdate({ ...career, story: next });
  const pick = (choiceId: string) => {
    if (busy.current) return;
    busy.current = true;
    const r = chooseScene(story, scene.id, choiceId);
    if (r.ok) {
      setPlayerSpeaking(true);
      commit(r.story);
      const icons = Object.fromEntries(script.meters.map(m => [m.id, m.icon]));
      setPills(Object.entries(r.deltas).filter(([, d]) => d !== 0).map(([k, d]) => ({ key: ++pillKey.current, text: `${d > 0 ? '+' : ''}${d} ${icons[k] ?? ''}` })));
    }
    queueMicrotask(() => { busy.current = false; });
  };
  const next = () => {
    setPills([]);
    if (step) { setStepState({ sceneId: scene.id, step: stepIdx + 1 }); return; }
    if (playerSpeaking) { setPlayerSpeaking(false); return; }
    const advanced = continueScene(story);
    const ns = advanced.session && sceneById(script, advanced.session.sceneId);
    if (ns && !advanced.session!.complete && (ns.act !== scene.act || ns.chapter !== scene.chapter)) {
      const inChapter = new Set(script.scenes.filter(x => x.act === scene.act && x.chapter === scene.chapter).map(x => x.id));
      const hist = session.history.filter(h => inChapter.has(h.sceneId));
      const meterDelta: Record<string, number> = {};
      hist.forEach(h => Object.entries(h.deltas ?? {}).forEach(([k, d]) => { meterDelta[k] = (meterDelta[k] ?? 0) + (d as number); }));
      setIntermission({ next: advanced, act: scene.act, chapter: scene.chapter, actEnded: ns.act !== scene.act, picks: hist.map(h => fmt(h.label)), meterDelta });
      return;
    }
    commit(advanced);
  };
  useEffect(() => { if (!pills.length) return; const t = setTimeout(() => setPills([]), 1800); return () => clearTimeout(t); }, [pills]);

  const headlines = useMemo(() => session.history.map(h => { const c = sceneById(script, h.sceneId)?.choices?.find(x => x.id === h.choiceId); return { ...h, headline: c?.headline }; }).reverse(), [session.history, script]);
  const chapterTitle = script.chapterTitles[`${scene.act}-${scene.chapter}`] ?? narrative?.chapters[scene.chapter - 1]?.title ?? '';
  const cast = useMemo(() => { const m: Record<string, { role: string; img?: string | undefined }> = {}; for (const sc of script.scenes) { const sp = sc.speaker; const img = sp.portraitKey ? STORY_PORTRAITS[sp.portraitKey] : undefined; for (const k of [sp.name, sp.name.split(' ').pop()!]) m[k] ??= { role: sp.role, img: img as string | undefined }; } return m; }, [script]);
  const beatWho = step?.kind === 'beat' ? cast[step.beat.speaker] : undefined;
  const portrait = step?.kind === 'establishing' ? undefined : step ? beatWho?.img : scene.speaker.portraitKey ? STORY_PORTRAITS[scene.speaker.portraitKey] : undefined;
  const ending = session.complete && script.endings?.length ? (stageEndingById(script, story.ending) ?? evaluateStageEnding(script, { meters: session.meters, flags: session.flags })) : null;
  useEffect(() => {
    if (!ending) return;
    try { recordEndingDiscovered(localStorage, story.scenarioId, ending.id, new Date().toISOString()); } catch { /* storage optional */ }
  }, [ending?.id, story.scenarioId]);
  if (ending) return <StoryEndingScreen script={script} story={story} ending={ending} onReplay={() => onUpdate({ ...career, story: replayStory(story) })} onExit={onExit} />;
  if (intermission) {
    const ns = sceneById(script, intermission.next.session!.sceneId)!;
    const title = (a: number, c: number) => script.chapterTitles[`${a}-${c}`] ?? narrative?.chapters[c - 1]?.title ?? '';
    return <div className={`story-stage story-intermission stage-theme-${script.theme ?? 'default'}`}>
      <img className="stage-backdrop intermission-backdrop" src={BACKDROPS[ns.backdrop] ?? act1} alt="" />
      <IntermissionVideo act={intermission.act} />
      <div className="intermission-card">
        <span className="eyebrow">{intermission.actEnded ? `Act ${ROMAN[intermission.act] ?? intermission.act} concluded` : `Chapter ${intermission.chapter} complete`}</span>
        <h1 className="intermission-title">{title(intermission.act, intermission.chapter) || `Chapter ${intermission.chapter}`}</h1>
        {intermission.picks.length > 0 && <><h3 className="section-label mt-3">Your choices</h3><ul className="mini-note">{intermission.picks.map((p, i) => <li key={i}>• {p}</li>)}</ul></>}
        <div className="intermission-meters">{script.meters.map(m => { const d = intermission.meterDelta[m.id] ?? 0; return <span key={m.id}>{m.icon} {m.label} <b className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d > 0 ? '+' : ''}{d}</b></span>; })}</div>
        <div className="intermission-next"><span className="eyebrow">Up next</span><b>{ns.act !== intermission.act ? `Act ${ROMAN[ns.act] ?? ns.act} · ` : ''}Chapter {ns.chapter}{title(ns.act, ns.chapter) ? `: ${title(ns.act, ns.chapter)}` : ''}</b></div>
        <Button variant="game" className="w-full mt-3" onClick={() => { const n = intermission.next; setIntermission(null); commit(n); }}>Begin Chapter {ns.chapter} <ArrowRight /></Button>
      </div>
    </div>;
  }
  const showMe = !!choice && playerSpeaking;

  return <div className={`story-stage stage-theme-${script.theme ?? 'default'}`}>
    <header className="stage-top">
      <Button variant="gameQuiet" size="sm" onClick={onExit} aria-label="Exit to story menu"><LogOut /> Exit</Button>
      <span className="stage-crumb">Act {ROMAN[scene.act] ?? scene.act} · Ch. {scene.chapter}{chapterTitle ? `: ${chapterTitle}` : ''}</span>
      <CoinChip />
    </header>

    <div className="stage-meters">{script.meters.map(m => { const v = session.meters[m.id] ?? m.value; return <div className="stage-meter" key={m.id} title={`${m.label} ${v}`}>
      <span><i aria-hidden>{m.icon}</i> {m.label}<b>{v}</b></span>
      <div className="stage-meter-bar"><span style={{ width: `${((v - m.min) / (m.max - m.min)) * 100}%` }} /></div>
    </div>; })}
      <div className="stage-pills" aria-live="polite">{pills.map(p => <span key={p.key} className="stage-pill">{p.text}</span>)}</div>
    </div>

    <div className="stage-scene" onClick={() => !tw.done && tw.skip()}>
      <img key={scene.backdrop} className={`stage-backdrop${step?.kind === 'establishing' ? ' is-establishing' : ''}`} src={BACKDROPS[scene.backdrop] ?? act1} alt="" />
      {showMe ? <img key="me" className="stage-portrait stage-portrait-player" src={mePortrait} alt={meName} /> : portrait && <img key={`${scene.id}-${expression}`} className={`stage-portrait expr-${expression}`} src={portrait} alt={scene.speaker.name} />}
      <span className="stage-scene-title">{scene.title}</span>
      {scene.setting && <div className="stage-setting"><b>{scene.setting.time}</b> · {scene.setting.location}{scene.setting.weatherOrMood ? ` · ${scene.setting.weatherOrMood}` : ''}</div>}
      {scene.castInRoom?.length ? <div className="stage-cast" aria-label="Present in room"><span>Present</span>{scene.castInRoom.map(n => { const c = cast[n]; return <span key={n} className="stage-cast-member" title={c?.role ? `${n} · ${c.role}` : n}>{c?.img ? <img src={c.img} alt="" /> : <i>{n[0]}</i>}<small>{n.split(' ').pop()}</small></span>; })}</div> : null}
    </div>

    <section className="stage-dialogue" onClick={() => !tw.done && tw.skip()}>
      {step?.kind === 'establishing' ? <div className="stage-speaker stage-speaker-narrator"><b>Narrator</b></div>
        : step ? <div className="stage-speaker"><b>{step.beat.speaker}</b>{beatWho && <span className="stage-role">{beatWho.role}</span>}</div>
        : showMe ? <div className="stage-speaker stage-speaker-player"><b>{meName}</b><span className="stage-role">You</span></div> : <div className="stage-speaker"><b>{scene.speaker.name}</b><span className="stage-role">{scene.speaker.role}</span></div>}
      {direction && <p className="stage-direction">[{fmt(direction)}]</p>}
      <p key={text}>{tw.shown}{!tw.done && <span className="stage-caret">▍</span>}</p>
    </section>

    <div className="stage-actions">
      {session.complete ? <div className="stage-end"><b>The End</b><p>You finished {script.scenes.length === 6 ? 'the prologue' : 'every chapter'}. Your choices, meters and discoveries are saved.</p><Button variant="game" className="w-full" onClick={onExit}>Return to story menu</Button></div>
        : !tw.done ? <Button variant="gameQuiet" className="w-full" onClick={tw.skip}>Tap to skip</Button>
        : step ? <Button variant="game" className="w-full" onClick={next}>{step.kind === 'establishing' ? 'Step Inside' : 'Listen'} <ArrowRight /></Button>
        : scene.choices?.length && !choice ? scene.choices.map(c => <Button key={c.id} variant="gameChoice" className="stage-choice" onClick={() => pick(c.id)}>{fmt(c.label)}<ArrowRight /></Button>)
        : <Button variant="game" className="w-full" onClick={next}>{choice ? 'Continue' : 'Tap to Continue'} <ArrowRight /></Button>}
    </div>

    <nav className="stage-sheets">
      {story.scenarioId === CIVIL_WAR_ID && <NationalLedgerSheet session={session} />}
      {story.scenarioId === CIVIL_WAR_ID && <WarMapSheet session={session} />}
      {story.scenarioId === CIVIL_WAR_ID && <WarRoomSheet session={session} />}
      <Sheet><SheetTrigger asChild><Button variant="gameOutline" size="sm"><BookOpen /> Briefing Dossier</Button></SheetTrigger>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto"><SheetHeader><SheetTitle>Briefing Dossier</SheetTitle></SheetHeader>
          <h3 className="section-label mt-2">Objective</h3><p className="mini-note">{script.objectives[scene.chapter] ?? 'Keep going.'}</p>
          <h3 className="section-label mt-3">Characters</h3>{(script.characters ?? narrative?.characters ?? []).map(c => <div key={c.name} className="game-row static"><div><b>{c.name}</b><p>{c.role}</p></div></div>)}
          <h3 className="section-label mt-3">Standing</h3><ul className="mini-note">{script.meters.map(m => <li key={m.id}>{m.icon} {m.label}: {session.meters[m.id] ?? m.value}/{m.max}</li>)}</ul>
          <h3 className="section-label mt-3">Discoveries</h3>{session.flags.length ? <ul className="mini-note">{session.flags.map(f => <li key={f}>{f.replace(/-/g, ' ')}</li>)}</ul> : <p className="mini-note">Nothing discovered yet.</p>}
        </SheetContent></Sheet>
      <Sheet><SheetTrigger asChild><Button variant="gameOutline" size="sm"><Newspaper /> Headlines</Button></SheetTrigger>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto"><SheetHeader><SheetTitle>Historical Headlines</SheetTitle></SheetHeader>
          {headlines.length ? headlines.map((h, i) => <div key={i} className="game-row static"><div>{h.headline && <b>“{h.headline}”</b>}<p>You chose: {fmt(h.label)}</p></div></div>) : <p className="mini-note">No headlines yet. Your choices make the news.</p>}
        </SheetContent></Sheet>
    </nav>
  </div>;
}

/** Whether a career should play on the cinematic stage. */
export function usesStoryStage(career: Career) { return career.mode === 'story' && !!career.story && !!sceneScriptFor(career.story.scenarioId); }
export { ensureSession };
