import { ENEMY_ACROSS_THE_AISLE_SCRIPT } from './scenarios/enemy-across-the-aisle';
import { CIVIL_WAR_SCRIPT } from './civil-war/civil-war-script';
import { CRISIS_SCRIPT, LEGACY_SCRIPT, UNDERDOG_SCRIPT } from './scenarios/scenario-prologues';
import type { Career } from './career';
import { scenarioById, storyStateSchema, type StoryState } from './story-mode';

/**
 * Story engine (Phases 2–3).
 * Pure, browser-safe, data-driven: every scenario is a `StoryNarrative`
 * definition and all progression runs through the functions below. No DOM,
 * no storage, no randomness — the quarterly turn cycle calls `advanceStory`
 * once per turn and the UI renders whatever event is queued.
 *
 * Phase 3 adds career effects (approval/reputation/campaign momentum) on
 * choices — declared here as data and applied by story-effects.ts so this
 * module stays cycle-free — and data-driven ending evaluation.
 */

// ---------------------------------------------------------------------------
// Definitions (data-driven; future scenarios only add entries, not code)

export interface StoryChapter {
  id: string;
  title: string;
  /** Act this chapter belongs to (1-based). */
  act: number;
  /** Inclusive story-turn range this chapter spans. */
  turns: [number, number];
  /** Objective shown to the player while the chapter is active. */
  objective: string;
}

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  /** Asset key resolved by the UI (see story-portraits.ts). */
  portrait: string;
}

export interface EventTrigger {
  /** Fire on exactly this story turn. */
  turn?: number;
  /** Fire within this inclusive story-turn range (first eligible turn). */
  turnRange?: [number, number];
  /** All of these flags must be set. */
  flagsAll?: string[];
  /** None of these flags may be set. */
  flagsNone?: string[];
  /** Numeric variables that must be >= the given value. */
  varMin?: Record<string, number>;
  /** Numeric variables that must be <= the given value. */
  varMax?: Record<string, number>;
  /** Relationships that must be >= the given value. */
  relMin?: Record<string, number>;
  /** Relationships that must be <= the given value. */
  relMax?: Record<string, number>;
}

/**
 * Real career effects a story choice can apply (Phase 3 election integration).
 * Declared as data here; applied through the existing approval/campaign
 * systems by story-effects.ts so previews match actual gains.
 */
export interface CareerEffect {
  /** Approval shift via shiftApproval (bounded by approval rules). */
  approval?: number;
  /** Reputation delta (clamped 0–100). */
  reputation?: number;
  /** Campaign momentum delta, only when a campaign is active. */
  momentum?: number;
}

export interface ChoiceEffect {
  /** Immediate deltas to numeric variables (clamped 0–100). */
  variables?: Record<string, number>;
  /** Immediate deltas to relationship standings (clamped -100–100). */
  relationships?: Record<string, number>;
  /** Flags set immediately. */
  setFlags?: Record<string, string | number | boolean>;
  /** Flags armed now but applied after the given number of turns. */
  delayed?: { inTurns: number; flag: string; value?: string | number | boolean }[];
  /** Real career effects applied through existing game systems. */
  career?: CareerEffect;
}

export interface StoryChoice {
  id: string;
  label: string;
  /** Consequence preview shown before choosing. */
  preview: string;
  effects: ChoiceEffect;
  /** One-line summary recorded in the decision log. */
  log: string;
}

export interface StoryEvent {
  id: string;
  /** Defaults to true: one-time events never re-trigger. */
  once?: boolean;
  trigger: EventTrigger;
  speaker: string;
  characterId?: string;
  title: string;
  dialogue: string;
  choices: StoryChoice[];
}

/** A possible scenario ending; the first whose condition matches wins. */
export interface StoryEnding {
  id: string;
  title: string;
  description: string;
  /** Ending condition, evaluated with the same rules as event triggers. */
  when: EventTrigger;
}

export interface StoryNarrative {
  scenarioId: string;
  acts: { n: number; title: string }[];
  chapters: StoryChapter[];
  characters: StoryCharacter[];
  /** Starting variable/relationship values for a fresh story career. */
  initialVariables: Record<string, number>;
  initialRelationships: Record<string, number>;
  events: StoryEvent[];
  /** Endings evaluated in order once the final chapter closes. */
  endings: StoryEnding[];
}

// ---------------------------------------------------------------------------
// Scenario content: Enemy Across the Aisle (20 turns, 4 acts / 8 chapters)

const RIVAL = 'rival';
const CHIEF = 'chief';
const REPORTER = 'reporter';
const CHAIR = 'chair';

export const STORY_NARRATIVES: StoryNarrative[] = [
  {
    scenarioId: 'enemy-across-the-aisle',
    acts: [
      { n: 1, title: 'The Spark' },
      { n: 2, title: 'The Secret' },
      { n: 3, title: 'The Vow' },
      { n: 4, title: 'The Reckoning' },
    ],
    chapters: [
      { id: 'ch1', title: 'Across the Floor', act: 1, turns: [0, 2], objective: 'Establish your name — and survive first contact with Senator Vance.' },
      { id: 'ch2', title: 'The Bistro', act: 1, turns: [3, 5], objective: 'A secret table, a leaked rumor. Decide what this becomes.' },
      { id: 'ch3', title: 'Hidden Meetings', act: 2, turns: [6, 8], objective: 'Midterms loom. Balance the romance against the party line.' },
      { id: 'ch4', title: 'The Debate Stage', act: 2, turns: [9, 10], objective: 'The cameras are rolling. Choose how hard to hit him.' },
      { id: 'ch5', title: 'Whispers', act: 3, turns: [11, 13], objective: 'Both parties smell a story. Control it before it controls you.' },
      { id: 'ch6', title: 'The Wedding Question', act: 3, turns: [14, 15], objective: 'Public vows or a private promise — either way, there is a price.' },
      { id: 'ch7', title: 'The Leak', act: 4, turns: [16, 18], objective: 'Your campaign strategy is in the open. Find out who sold it.' },
      { id: 'ch8', title: 'Election Night', act: 4, turns: [19, 20], objective: 'One night left. Choose the ending you can live with.' },
    ],
    characters: [
      { id: RIVAL, name: 'Senator Vance', role: 'Opposition party leader', portrait: 'rival' },
      { id: CHIEF, name: 'Dana Cole', role: 'Your campaign manager', portrait: 'chief' },
      { id: REPORTER, name: 'Iris Malone', role: 'Investigative reporter', portrait: 'reporter' },
      { id: CHAIR, name: 'Chairman Osborne', role: 'Your party chair', portrait: 'chair' },
    ],
    initialVariables: { love: 10, suspicion: 5, loyalty: 60, trust: 50 },
    initialRelationships: { [RIVAL]: 0, [CHIEF]: 20, [REPORTER]: -10, [CHAIR]: 10 },
    events: [
      // --- Act I: The Spark -------------------------------------------------
      {
        id: 'eata-first-clash',
        trigger: { turn: 1 },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The First Clash',
        dialogue: 'The hearing room lights burn. Across the aisle, Senator Vance — the opposition’s leader and its brightest star — dismantles your argument with a smile. Afterward, in the corridor, he offers his hand. “You’re better than your party’s talking points. Pity.” His eyes linger a moment too long.',
        choices: [
          {
            id: 'sparring',
            label: 'Spar back — wit for wit',
            preview: 'Love +10 · Vance +15 · Suspicion +5',
            effects: { variables: { love: 10, suspicion: 5 }, relationships: { [RIVAL]: 15 } },
            log: 'Traded barbs with Senator Vance after the hearing — and both of you enjoyed it.',
          },
          {
            id: 'cold',
            label: 'Keep it cold and professional',
            preview: 'Loyalty +5 · Vance -5',
            effects: { variables: { loyalty: 5 }, relationships: { [RIVAL]: -5 } },
            log: 'Kept Senator Vance at a careful professional distance.',
          },
        ],
      },
      {
        id: 'eata-late-vote',
        trigger: { turn: 2 },
        speaker: 'Dana Cole',
        characterId: CHIEF,
        title: 'The Late Vote',
        dialogue: 'Midnight session. Dana corners you by the elevators. “Vance’s amendment passes if you stay quiet. Your party will call it betrayal if you help him. But he asked for you specifically.” She studies your face. “What is he to you?”',
        choices: [
          {
            id: 'help',
            label: 'Quietly help his amendment pass',
            preview: 'Love +10 · Vance +10 · Loyalty -10',
            effects: {
              variables: { love: 10, loyalty: -10 },
              relationships: { [RIVAL]: 10 },
              setFlags: { 'helped-amendment': true },
              delayed: [{ inTurns: 2, flag: 'party-whispers' }],
            },
            log: 'Quietly helped Vance’s amendment pass. The party whips noticed.',
          },
          {
            id: 'block',
            label: 'Vote it down like a loyal soldier',
            preview: 'Loyalty +10 · Love -5 · Vance -10',
            effects: { variables: { loyalty: 10, love: -5 }, relationships: { [RIVAL]: -10 } },
            log: 'Voted down Vance’s amendment to prove party loyalty.',
          },
        ],
      },
      {
        id: 'eata-bistro',
        trigger: { turn: 3 },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The Bistro',
        dialogue: 'A text from an unknown number: “Corner table, Maison Rouge, 8pm. No staff, no cameras. — V.” He is already there when you arrive, two glasses poured. “One dinner. Enemies on the record, nobody off it.” The candle between you flickers. Whatever this is, it stops being hypothetical tonight.',
        choices: [
          {
            id: 'dinner',
            label: 'Stay for dinner',
            preview: 'Love +15 · Vance +15 · Suspicion +10',
            effects: {
              variables: { love: 15, suspicion: 10 },
              relationships: { [RIVAL]: 15 },
              setFlags: { 'bistro-met': true },
            },
            log: 'Shared a secret dinner with Senator Vance at Maison Rouge.',
          },
          {
            id: 'leave',
            label: 'Walk out before dessert',
            preview: 'Loyalty +5 · Love -5 · Romance avoided',
            effects: {
              variables: { loyalty: 5, love: -5 },
              setFlags: { 'avoided-rival': true },
            },
            log: 'Walked out of the bistro before anything could begin.',
          },
        ],
      },
      {
        id: 'eata-leak-response',
        trigger: { turn: 4 },
        speaker: 'Iris Malone',
        characterId: REPORTER,
        title: 'The Media Leak',
        dialogue: 'Iris Malone from the Herald catches you on the capitol steps, recorder out. “A source says you dined with Senator Vance off the books. Care to comment?” Cameras drift toward you. Whatever you say next is tomorrow’s headline.',
        choices: [
          {
            id: 'deny',
            label: 'Flatly deny the dinner',
            preview: 'Suspicion +10 · Malone -15 · Reputation -1',
            effects: {
              variables: { suspicion: 10 },
              relationships: { [REPORTER]: -15 },
              setFlags: { 'denied-bistro': true },
              career: { reputation: -1 },
            },
            log: 'Denied the bistro dinner on the record. Malone is not convinced.',
          },
          {
            id: 'charm',
            label: 'Charm her — “I dine with everyone”',
            preview: 'Malone +10 · Suspicion -5 · Trust +5',
            effects: {
              variables: { suspicion: -5, trust: 5 },
              relationships: { [REPORTER]: 10 },
              career: { approval: 2 },
            },
            log: 'Charmed Iris Malone on the steps. The story ran soft.',
          },
          {
            id: 'counter',
            label: 'Feed her a story about Vance instead',
            preview: 'Suspicion -10 · Vance -20 · Malone +10 · Betrayal remembered',
            effects: {
              variables: { suspicion: -10 },
              relationships: { [RIVAL]: -20, [REPORTER]: 10 },
              setFlags: { 'fed-press': true },
            },
            log: 'Fed Malone a story about Vance to kill the bistro rumor. He will find out.',
          },
        ],
      },
      {
        id: 'eata-rooftop',
        trigger: { turn: 5, flagsNone: ['avoided-rival'] },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The Rooftop',
        dialogue: 'He finds you on the capitol rooftop after the gala, two glasses of champagne in hand. “One drink. Enemies below, nobody up here.” The city hums beneath you. He is closer than a rival should ever be.',
        choices: [
          {
            id: 'kiss',
            label: 'Close the distance',
            preview: 'Love +20 · Vance +20 · Suspicion +10 · Romance begins',
            effects: {
              variables: { love: 20, suspicion: 10 },
              relationships: { [RIVAL]: 20 },
              setFlags: { 'romance-active': true },
            },
            log: 'Kissed Senator Vance on the rooftop. The secret romance began.',
          },
          {
            id: 'leave',
            label: 'Walk away before it starts',
            preview: 'Love -10 · Suspicion -5 · Romance avoided',
            effects: {
              variables: { love: -10, suspicion: -5 },
              setFlags: { 'avoided-rival': true },
            },
            log: 'Walked away from the rooftop before anything could begin.',
          },
        ],
      },
      // --- Act II: The Secret -----------------------------------------------
      {
        id: 'eata-midterm-clash',
        trigger: { turn: 6 },
        speaker: 'Chairman Osborne',
        characterId: CHAIR,
        title: 'The Midterm Line',
        dialogue: 'Osborne slaps a briefing folder on your desk. “Vance’s infrastructure bill is polling well. Midterms are coming, and I want it dead — and I want you to twist the knife.” He waits. Across town, Vance texts: “I need this one. You know what it means.”',
        choices: [
          {
            id: 'back-bill',
            label: 'Quietly back Vance’s bill',
            preview: 'Love +10 · Vance +15 · Loyalty -15 · Approval +3 (bipartisan praise)',
            effects: {
              variables: { love: 10, loyalty: -15 },
              relationships: { [RIVAL]: 15, [CHAIR]: -15 },
              setFlags: { 'backed-vance-bill': true },
              career: { approval: 3 },
            },
            log: 'Backed Vance’s infrastructure bill against the party line. Voters praised the bipartisanship; Osborne did not.',
          },
          {
            id: 'torpedo',
            label: 'Torpedo the bill on live TV',
            preview: 'Loyalty +10 · Love -10 · Vance -15 · Momentum +2',
            effects: {
              variables: { loyalty: 10, love: -10 },
              relationships: { [RIVAL]: -15, [CHAIR]: 10 },
              career: { momentum: 2 },
            },
            log: 'Killed Vance’s bill on live television. The base loved it; Vance went quiet.',
          },
        ],
      },
      {
        id: 'eata-debate',
        trigger: { turn: 8 },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The Televised Debate',
        dialogue: 'Twenty million viewers. Vance leans into his microphone: “My opponent talks about courage. Let’s talk about conviction.” You catch his eye during the commercial break — the faintest nod: give them a show. How hard do you hit him?',
        choices: [
          {
            id: 'kill',
            label: 'Go for the kill — full attack',
            preview: 'Reputation +3 · Momentum +2 · Love -10 · Vance -10',
            effects: {
              variables: { love: -10, suspicion: 5 },
              relationships: { [RIVAL]: -10 },
              career: { reputation: 3, momentum: 2 },
            },
            log: 'Eviscerated Vance in the televised debate. The polls moved; his texts stopped for a week.',
          },
          {
            id: 'pull-punches',
            label: 'Pull your punches',
            preview: 'Love +10 · Vance +10 · Reputation -2 · Loyalty -5',
            effects: {
              variables: { love: 10, loyalty: -5 },
              relationships: { [RIVAL]: 10 },
              career: { reputation: -2 },
            },
            log: 'Pulled your punches in the debate. Vance noticed. So did the pundits.',
          },
        ],
      },
      {
        id: 'eata-manager-warning',
        trigger: { turn: 9 },
        speaker: 'Dana Cole',
        characterId: CHIEF,
        title: 'The Manager’s Warning',
        dialogue: 'Dana closes your office door and lowers her voice. “Two donors asked me why you were seen near Vance’s district office. I covered for you — I don’t even know what I’m covering.” She folds her arms. “Level with me. Right now.”',
        choices: [
          {
            id: 'come-clean',
            label: 'Come clean to Dana',
            preview: 'Trust +15 · Dana +15 · Suspicion -5',
            effects: {
              variables: { trust: 15, suspicion: -5 },
              relationships: { [CHIEF]: 15 },
              setFlags: { 'manager-knows': true },
            },
            log: 'Told Dana the truth about Vance. She started managing the secret, not just the campaign.',
          },
          {
            id: 'deny-manager',
            label: 'Deny it to her face',
            preview: 'Trust -10 · Dana -10 · A lie on the record',
            effects: {
              variables: { trust: -10 },
              relationships: { [CHIEF]: -10 },
              setFlags: { 'manager-deceived': true },
            },
            log: 'Lied to Dana about Vance. She nodded — and started keeping her own file.',
          },
        ],
      },
      {
        id: 'eata-photo',
        trigger: { turnRange: [10, 11], flagsAll: ['romance-active'] },
        speaker: 'Dana Cole',
        characterId: CHIEF,
        title: 'The Photograph',
        dialogue: 'Dana drops a manila envelope on your desk. Inside: a grainy photo of you and Vance leaving the same hotel, forty minutes apart. “A tabloid has this. They’ll run it next week unless someone gives them a better story.” She waits. “Someone, chief. Decide who.”',
        choices: [
          {
            id: 'deny',
            label: 'Deny everything and bury it',
            preview: 'Suspicion +15 · Loyalty +5 · Sets up a future reckoning',
            effects: {
              variables: { suspicion: 15, loyalty: 5 },
              setFlags: { 'denied-photo': true },
              delayed: [{ inTurns: 3, flag: 'denial-unravels' }],
            },
            log: 'Denied the photograph and paid to bury it. The lie is now on the clock.',
          },
          {
            id: 'confess',
            label: 'Get ahead of it — confess to Chairman Osborne',
            preview: 'Suspicion -10 · Loyalty -5 · Osborne +10',
            effects: {
              variables: { suspicion: -10, loyalty: -5 },
              relationships: { [CHAIR]: 10 },
              setFlags: { 'confessed-to-chair': true },
            },
            log: 'Confessed the romance to Osborne before the tabloid could break it.',
          },
          {
            id: 'leak-rival',
            label: 'Feed the tabloid a story about him instead',
            preview: 'Suspicion -15 · Vance -30 · Love -20 · Betrayal remembered',
            effects: {
              variables: { suspicion: -15, love: -20 },
              relationships: { [RIVAL]: -30 },
              setFlags: { 'betrayed-rival': true },
            },
            log: 'Fed the tabloid a story about Vance to kill the photo. He will find out.',
          },
        ],
      },
      // --- Act III: The Vow ---------------------------------------------------
      {
        id: 'eata-ultimatum',
        trigger: { turn: 11, flagsAll: ['romance-active'], flagsNone: ['betrayed-rival', 'romance-ended'] },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The Ultimatum',
        dialogue: 'His apartment, rain on the windows. “My party knows something. Yours knows something. We’re out of runway.” He takes your hand. “One of us has to lose the midterms — or both of us go public and burn together. I’ll follow your lead. Whatever you choose.”',
        choices: [
          {
            id: 'public',
            label: 'Go public together — love in the open',
            preview: 'Love +20 · Suspicion → 0 · Loyalty -25 · Public couple',
            effects: {
              variables: { love: 20, suspicion: -100, loyalty: -25 },
              relationships: { [RIVAL]: 20 },
              setFlags: { 'went-public': true },
              career: { approval: -3, momentum: 3 },
            },
            log: 'Went public with Senator Vance. The country chose sides overnight — and the cameras never left.',
          },
          {
            id: 'sacrifice',
            label: 'Ask him to step back from the race',
            preview: 'Love -15 · Vance -20 · Loyalty +15',
            effects: {
              variables: { love: -15, loyalty: 15 },
              relationships: { [RIVAL]: -20 },
              setFlags: { 'asked-sacrifice': true },
            },
            log: 'Asked Vance to sacrifice his race for both your careers.',
          },
          {
            id: 'end-it',
            label: 'End it cleanly, before it ends you',
            preview: 'Love → 0 · Vance -15 · Loyalty +10 · Romance over',
            effects: {
              variables: { love: -100, loyalty: 10 },
              relationships: { [RIVAL]: -15 },
              setFlags: { 'romance-ended': true },
            },
            log: 'Ended the romance with Vance before it could end your career.',
          },
        ],
      },
      {
        id: 'eata-proposal',
        trigger: { turn: 12, flagsAll: ['romance-active'], flagsNone: ['romance-ended', 'betrayed-rival'] },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The Proposal',
        dialogue: 'Back at Maison Rouge — the same corner table. Vance pushes a small box across the tablecloth. “No staff, no cameras, no parties. Just this.” He opens it. “Marry me. In secret, in public, I don’t care. Choose.”',
        choices: [
          {
            id: 'yes',
            label: 'Say yes',
            preview: 'Love +20 · Vance +20 · Engaged',
            effects: {
              variables: { love: 20, trust: 10 },
              relationships: { [RIVAL]: 20 },
              setFlags: { engaged: true },
            },
            log: 'Said yes to Senator Vance at the corner table.',
          },
          {
            id: 'not-yet',
            label: '“Not yet. After the election.”',
            preview: 'Love -5 · Trust +5 · Vance -5',
            effects: {
              variables: { love: -5, trust: 5 },
              relationships: { [RIVAL]: -5 },
              setFlags: { 'proposal-delayed': true },
            },
            log: 'Asked Vance to wait until after the election. He pocketed the ring, slowly.',
          },
        ],
      },
      {
        id: 'eata-wedding',
        trigger: { turn: 14, flagsAll: ['engaged'] },
        speaker: 'Dana Cole',
        characterId: CHIEF,
        title: 'The Wedding Question',
        dialogue: 'Dana lays two plans side by side. “Option one: a cathedral, three hundred guests, both parties front row — the wedding of the decade, and the scandal of it with it. Option two: a courthouse, two witnesses, and a secret that has to hold forever.” She taps the folder. “Which life do you want?”',
        choices: [
          {
            id: 'public-wedding',
            label: 'The cathedral — a public wedding',
            preview: 'Love +15 · Suspicion → 0 · Loyalty -25 · Approval -4 · Momentum +3',
            effects: {
              variables: { love: 15, suspicion: -100, loyalty: -25 },
              relationships: { [RIVAL]: 15, [CHAIR]: -20 },
              setFlags: { 'married-public': true, 'went-public': true },
              career: { approval: -4, momentum: 3 },
            },
            log: 'Married Senator Vance in a cathedral before three hundred guests and every camera in the country.',
          },
          {
            id: 'secret-wedding',
            label: 'The courthouse — a secret wedding',
            preview: 'Love +10 · Suspicion +10 · Loyalty -5',
            effects: {
              variables: { love: 10, suspicion: 10, loyalty: -5 },
              relationships: { [RIVAL]: 10 },
              setFlags: { 'married-secret': true },
            },
            log: 'Married Senator Vance at the courthouse with two witnesses and a secret to keep forever.',
          },
          {
            id: 'call-off',
            label: 'Call it off',
            preview: 'Love -30 · Vance -25 · Loyalty +10',
            effects: {
              variables: { love: -30, loyalty: 10 },
              relationships: { [RIVAL]: -25 },
              setFlags: { 'wedding-cancelled': true, 'romance-ended': true },
            },
            log: 'Called off the wedding. Vance returned the ring without a word.',
          },
        ],
      },
      {
        id: 'eata-backlash',
        trigger: { turnRange: [13, 15], flagsAll: ['went-public'] },
        speaker: 'Chairman Osborne',
        characterId: CHAIR,
        title: 'The Backlash',
        dialogue: 'Osborne doesn’t sit down. “Half the committee wants your head. Donors are pulling seven figures. You made this party a punchline.” He jabs a finger at you. “Get on television and call it a mistake, or get out of the way.”',
        choices: [
          {
            id: 'defy',
            label: 'Defy him — “It’s not a mistake”',
            preview: 'Loyalty -15 · Osborne -20 · Love +10 · Approval -3',
            effects: {
              variables: { loyalty: -15, love: 10 },
              relationships: { [CHAIR]: -20, [RIVAL]: 10 },
              setFlags: { 'defied-chair': true },
              career: { approval: -3 },
            },
            log: 'Defied Osborne on live television and called the marriage the real thing.',
          },
          {
            id: 'apologize',
            label: 'Apologize to the party',
            preview: 'Loyalty +10 · Love -10 · Vance -10',
            effects: {
              variables: { loyalty: 10, love: -10 },
              relationships: { [RIVAL]: -10, [CHAIR]: 10 },
            },
            log: 'Apologized to the party for the relationship. Vance watched the clip in silence.',
          },
        ],
      },
      // --- Act IV: The Reckoning ----------------------------------------------
      {
        id: 'eata-campaign-leak',
        trigger: { turn: 16 },
        speaker: 'Iris Malone',
        characterId: REPORTER,
        title: 'The Campaign Leak',
        dialogue: 'Malone slides a printed email across the café table — your campaign’s internal strategy, verbatim. “This is running tomorrow either way. What I don’t have is who sold it.” She watches you closely. “The metadata points at Senator Vance’s office. Give me a quote.”',
        choices: [
          {
            id: 'accuse',
            label: 'Publicly accuse Vance’s camp',
            preview: 'Vance -30 · Love -25 · Loyalty +10 · Momentum +2',
            effects: {
              variables: { love: -25, loyalty: 10 },
              relationships: { [RIVAL]: -30 },
              setFlags: { 'accused-vance': true },
              career: { momentum: 2 },
            },
            log: 'Accused Vance’s office of the campaign leak on the record. The race turned vicious.',
          },
          {
            id: 'confront-quietly',
            label: 'Confront Vance in private first',
            preview: 'Trust +10 · Vance +5 · Suspicion +5',
            effects: {
              variables: { trust: 10, suspicion: 5 },
              relationships: { [RIVAL]: 5 },
              setFlags: { 'confronted-quietly': true },
            },
            log: 'Confronted Vance about the leak in private. He swore it wasn’t him — and you wanted to believe him.',
          },
          {
            id: 'bigger-story',
            label: 'Hand Malone a bigger story',
            preview: 'Malone +15 · Suspicion -10 · Reputation -1',
            effects: {
              variables: { suspicion: -10 },
              relationships: { [REPORTER]: 15 },
              setFlags: { 'press-ally': true },
              career: { reputation: -1 },
            },
            log: 'Traded Malone a bigger story to soften the leak coverage.',
          },
        ],
      },
      {
        id: 'eata-final-debate',
        trigger: { turn: 18 },
        speaker: 'Senator Vance',
        characterId: RIVAL,
        title: 'The Final Debate',
        dialogue: 'Last debate before the election. The moderator turns to you: “Senator Vance calls you a flip-flopper who can’t be trusted. Your response?” Vance stands ten feet away, jaw tight, waiting. The whole race — and whatever is between you — comes down to the next sixty seconds.',
        choices: [
          {
            id: 'attack-record',
            label: 'Attack his record, mercilessly',
            preview: 'Momentum +3 · Reputation +2 · Love -15 · Vance -20',
            effects: {
              variables: { love: -15 },
              relationships: { [RIVAL]: -20 },
              career: { momentum: 3, reputation: 2 },
            },
            log: 'Tore into Vance’s record in the final debate. The polls jumped; something between you broke.',
          },
          {
            id: 'defend-record',
            label: 'Defend your own record, ignore him',
            preview: 'Momentum +1 · Loyalty +5',
            effects: {
              variables: { loyalty: 5 },
              career: { momentum: 1 },
            },
            log: 'Stayed on your own record in the final debate and let Vance swing at air.',
          },
          {
            id: 'praise',
            label: 'Praise him — “a worthy opponent”',
            preview: 'Love +10 · Vance +15 · Momentum -2 · Loyalty -10',
            effects: {
              variables: { love: 10, loyalty: -10 },
              relationships: { [RIVAL]: 15 },
              career: { momentum: -2 },
            },
            log: 'Called Vance a worthy opponent on the biggest stage of the race. The base howled; he mouthed “thank you.”',
          },
        ],
      },
      {
        id: 'eata-finale',
        trigger: { turn: 20 },
        speaker: 'Dana Cole',
        characterId: CHIEF,
        title: 'Election Night',
        dialogue: 'Returns crawl across the screen. Dana mutes the television. “However tonight ends, the story they tell tomorrow is the one we write right now.” She slides two drafted statements across the desk — one about power, one about the truth. “Pick the ending.”',
        choices: [
          {
            id: 'power',
            label: 'Choose power — the career comes first',
            preview: 'Loyalty +20 · Love -20 · Momentum +2 · Ending: The Operator',
            effects: {
              variables: { loyalty: 20, love: -20 },
              setFlags: { 'ending-power': true },
              career: { momentum: 2 },
            },
            log: 'Chose the career on election night.',
          },
          {
            id: 'heart',
            label: 'Choose the truth — whatever it costs',
            preview: 'Love +20 · Loyalty -20 · Ending: The Confession',
            effects: {
              variables: { love: 20, loyalty: -20 },
              setFlags: { 'ending-heart': true },
            },
            log: 'Chose the truth on election night.',
          },
        ],
      },
    ],
    endings: [
      {
        id: 'fall-from-grace',
        title: 'Fall from Grace',
        description: 'The buried photo surfaced, the denials collapsed, and the scandal swallowed the campaign whole. You lost the race, the party’s trust, and Vance — all in one brutal news cycle.',
        when: { flagsAll: ['denied-photo', 'denial-unravels'], varMin: { suspicion: 60 } },
      },
      {
        id: 'burned-bridges',
        title: 'Burned Bridges',
        description: 'You fed Vance to the press to save yourself, and it worked — the seat is yours. But he never forgave it, and some nights neither do you. Power tastes like ashes.',
        when: { flagsAll: ['betrayed-rival'] },
      },
      {
        id: 'power-and-love',
        title: 'Power & Love',
        description: 'The cathedral wedding, the defied chairman, the final debate truce — you ran the gauntlet in the open and won both the election and the man. The country’s most watched marriage begins in office.',
        when: { flagsAll: ['married-public'], varMin: { love: 60 } },
      },
      {
        id: 'secret-forever',
        title: 'The Secret Forever',
        description: 'A courthouse marriage, two witnesses, and a love that lives in drawn curtains and coded texts. You kept the career and kept him — at the price of never once holding his hand in daylight.',
        when: { flagsAll: ['married-secret'], varMax: { suspicion: 59 } },
      },
      {
        id: 'the-operator',
        title: 'The Operator',
        description: 'You chose the career on election night and the machine rewarded you: the seat, the chair’s blessing, the machine’s loyalty. The apartment is quiet. The resume is magnificent.',
        when: { flagsAll: ['ending-power'], varMin: { loyalty: 60 } },
      },
      {
        id: 'the-confession',
        title: 'The Confession',
        description: 'You read the true statement on election night — the whole story, love and all — and let the chips fall. You may have lost the race, but you walked out of the studio with your head up and his hand in yours.',
        when: { flagsAll: ['ending-heart'] },
      },
      {
        id: 'lone-wolf',
        title: 'Lone Wolf',
        description: 'No scandal, no romance, no hostage to fortune. You beat Vance cleanly and alone, and the party never learned how close it came to a very different story.',
        when: {},
      },
    ],
  },
];

export const narrativeFor = (scenarioId: string): StoryNarrative | undefined =>
  STORY_NARRATIVES.find(n => n.scenarioId === scenarioId);

// ---------------------------------------------------------------------------
// Act / chapter engine

export function chapterForTurn(narrative: StoryNarrative, turn: number): StoryChapter | undefined {
  return narrative.chapters.find(ch => turn >= ch.turns[0] && turn <= ch.turns[1]);
}

/** Derive act/chapter from the turn counter; supports variable-length scenarios. */
export function deriveProgress(narrative: StoryNarrative, turn: number): { act: number; chapter: number } {
  const ch = chapterForTurn(narrative, turn) ?? narrative.chapters[narrative.chapters.length - 1]!;
  return { act: ch.act, chapter: narrative.chapters.indexOf(ch) + 1 };
}

export function chapterObjective(state: StoryState): string | null {
  const narrative = narrativeFor(state.scenarioId);
  if (!narrative) return null;
  return chapterForTurn(narrative, state.turn)?.objective ?? null;
}

// ---------------------------------------------------------------------------
// Trigger evaluation

function flagSet(state: StoryState, flag: string): boolean {
  return state.flags[flag] !== undefined && state.flags[flag] !== false;
}

export function triggerMatches(state: StoryState, trigger: EventTrigger): boolean {
  if (trigger.turn !== undefined && state.turn !== trigger.turn) return false;
  if (trigger.turnRange && (state.turn < trigger.turnRange[0] || state.turn > trigger.turnRange[1])) return false;
  if (trigger.flagsAll?.some(f => !flagSet(state, f))) return false;
  if (trigger.flagsNone?.some(f => flagSet(state, f))) return false;
  if (trigger.varMin && Object.entries(trigger.varMin).some(([k, v]) => (state.variables[k] ?? 0) < v)) return false;
  if (trigger.varMax && Object.entries(trigger.varMax).some(([k, v]) => (state.variables[k] ?? 0) > v)) return false;
  if (trigger.relMin && Object.entries(trigger.relMin).some(([k, v]) => (state.relationships[k] ?? 0) < v)) return false;
  if (trigger.relMax && Object.entries(trigger.relMax).some(([k, v]) => (state.relationships[k] ?? 0) > v)) return false;
  return true;
}

/** Next event due to fire this turn; completed one-time events are skipped. */
export function dueEvent(narrative: StoryNarrative, state: StoryState): StoryEvent | null {
  for (const ev of narrative.events) {
    if (ev.once !== false && state.completedEvents.includes(ev.id)) continue;
    if (triggerMatches(state, ev.trigger)) return ev;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Turn integration

/**
 * Advance the story clock by one quarterly turn. Resolves delayed triggers,
 * derives act/chapter, queues the next due event and closes finished chapters.
 * Idempotent per turn: re-running for the same turn returns the state unchanged.
 */
export function advanceStory(career: Career): Career {
  const story = career.story;
  if (!story || career.mode !== 'story') return career;
  const narrative = narrativeFor(story.scenarioId);
  const scenario = scenarioById(story.scenarioId);
  if (!narrative || !scenario) return career;

  const nextTurn = story.turn + 1;
  let next: StoryState = { ...story, turn: nextTurn };

  // Resolve delayed triggers armed by earlier choices.
  const due = next.pendingTriggers.filter(t => t.atTurn <= nextTurn);
  if (due.length) {
    next = {
      ...next,
      flags: { ...next.flags, ...Object.fromEntries(due.map(t => [t.flag, t.value])) },
      pendingTriggers: next.pendingTriggers.filter(t => t.atTurn > nextTurn),
    };
  }

  // Derive act/chapter and close chapters whose turn range has passed.
  const { act, chapter } = deriveProgress(narrative, nextTurn);
  const completedChapters = new Set(next.completedChapters);
  for (const ch of narrative.chapters) if (nextTurn > ch.turns[1]) completedChapters.add(ch.id);
  next = { ...next, act, chapter, completedChapters: [...completedChapters] };

  // Queue the next due event (one at a time; the UI drains it before the next turn).
  if (!next.queuedEvent) {
    const ev = dueEvent(narrative, next);
    if (ev) next = { ...next, queuedEvent: ev.id };
  }

  return { ...career, story: next };
}

/** The queued story event definition, if one is waiting to be shown. */
export function pendingStoryEvent(career: Career): StoryEvent | null {
  const story = career.story;
  if (!story?.queuedEvent) return null;
  return narrativeFor(story.scenarioId)?.events.find(e => e.id === story.queuedEvent) ?? null;
}

// ---------------------------------------------------------------------------
// Choice application

const clampVar = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const clampRel = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));

export type StoryChoiceResult =
  | { ok: true; career: Career; message: string; effects: ChoiceEffect }
  | { ok: false; message: string };

/** Apply a story card choice: variables/flags now, delayed triggers armed, decision logged. */
export function applyStoryChoice(career: Career, eventId: string, choiceId: string): StoryChoiceResult {
  const story = career.story;
  if (!story || career.mode !== 'story') return { ok: false, message: 'No active story.' };
  const narrative = narrativeFor(story.scenarioId);
  const event = narrative?.events.find(e => e.id === eventId);
  const choice = event?.choices.find(c => c.id === choiceId);
  if (!narrative || !event || !choice) return { ok: false, message: 'That story moment has passed.' };
  // Replay guard: only the currently queued event can be resolved.
  if (story.queuedEvent !== eventId) return { ok: false, message: 'That story moment has passed.' };

  const variables = { ...story.variables };
  const relationships = { ...story.relationships };
  const shifts: string[] = [];
  for (const [k, d] of Object.entries(choice.effects.variables ?? {})) {
    variables[k] = clampVar((variables[k] ?? 0) + d);
    shifts.push(`${k} ${d > 0 ? '+' : ''}${d}`);
  }
  for (const [k, d] of Object.entries(choice.effects.relationships ?? {})) {
    relationships[k] = clampRel((relationships[k] ?? 0) + d);
    const who = narrative.characters.find(c => c.id === k)?.name ?? k;
    shifts.push(`${who} ${d > 0 ? '+' : ''}${d}`);
  }

  let next: StoryState = {
    ...story,
    variables,
    relationships,
    flags: { ...story.flags, ...(choice.effects.setFlags ?? {}) },
    pendingTriggers: [
      ...story.pendingTriggers,
      ...(choice.effects.delayed ?? []).map(t => ({ atTurn: story.turn + t.inTurns, flag: t.flag, value: t.value ?? true })),
    ],
    completedEvents: event.once === false ? story.completedEvents : [...story.completedEvents, eventId],
    queuedEvent: null,
    decisionLog: [
      ...story.decisionLog,
      { turn: story.turn, date: career.date, eventId, choiceId, summary: choice.log, shifts },
    ],
  };

  // The final chapter closes on its last turn: evaluate the ending once.
  const lastTurn = Math.max(...narrative.chapters.map(ch => ch.turns[1]));
  if (!next.ending && next.turn >= lastTurn) {
    next = { ...next, ending: evaluateEnding(narrative, next).id };
  }

  return { ok: true, career: { ...career, story: next }, message: choice.log, effects: choice.effects };
}

/** Fresh story state for a new story career, seeded with the scenario's starting values. */
export function seedStoryState(state: StoryState): StoryState {
  const narrative = narrativeFor(state.scenarioId);
  if (!narrative) return state;
  return { ...state, variables: { ...narrative.initialVariables }, relationships: { ...narrative.initialRelationships } };
}

/** Scenario finished when every chapter is complete (turn counter passed the last chapter). */
export function storyFinished(state: StoryState): boolean {
  const narrative = narrativeFor(state.scenarioId);
  return !!narrative && narrative.chapters.every(ch => state.completedChapters.includes(ch.id));
}

// ---------------------------------------------------------------------------
// Ending evaluation (Phase 3)

/** Evaluate the scenario ending: the first ending whose condition matches wins. */
export function evaluateEnding(narrative: StoryNarrative, state: StoryState): StoryEnding {
  for (const ending of narrative.endings) {
    if (triggerMatches(state, ending.when)) return ending;
  }
  // Narratives always end with an unconditional ending, but stay safe.
  return narrative.endings[narrative.endings.length - 1]!;
}

/** The evaluated ending for a finished story, if any. */
export function storyEnding(career: Career): StoryEnding | null {
  const story = career.story;
  if (!story?.ending) return null;
  return narrativeFor(story.scenarioId)?.endings.find(e => e.id === story.ending) ?? null;
}

// ---------------------------------------------------------------------------
// Cinematic scene engine (story stage). Pure: the stage UI renders scenes and
// dispatches choices; progress lives in StoryState.session (STORY_SAVE_KEY).

export interface StoryMeter {
  id: string;
  label: string;
  icon: string;
  min: number;
  max: number;
  value: number;
}

export interface StorySceneChoice {
  id: string;
  label: string;
  /** NPC dialogue immediately following this choice. */
  reactionText: string;
  /** Speaker expression after this choice. */
  reactionExpression?: string;
  /** Meter adjustments, e.g. { affinity: 10, party: -5 }. */
  effects: Record<string, number>;
  flagSets?: string[];
  nextSceneId?: string;
  /** Headline printed in the Historical Headlines drawer. */
  headline?: string;
}

export interface StoryScene {
  id: string;
  act: number;
  chapter: number;
  sceneNumber: number;
  title: string;
  backdrop: string;
  speaker: { name: string; role: string; portraitKey?: string; expression?: string };
  dialogue: string;
  choices?: StorySceneChoice[];
  nextSceneId?: string;
  /** Optional screenplay layer (all display-only; never changes effects or flow). */
  setting?: { time: string; location: string; weatherOrMood?: string };
  narration?: string;
  castInRoom?: string[];
  stageDirection?: string;
  beats?: StoryDialogueBeat[];
}

export interface StoryDialogueBeat { speaker: string; text: string; stageDirection?: string }

export type ScenePreludeStep =
  | { kind: 'establishing'; narration: string }
  | { kind: 'beat'; beat: StoryDialogueBeat };

/** Ordered display steps shown before the scene's main dialogue (empty for legacy scenes). */
export function scenePrelude(scene: StoryScene): ScenePreludeStep[] {
  const steps: ScenePreludeStep[] = [];
  if (scene.narration || scene.setting) steps.push({ kind: 'establishing', narration: scene.narration ?? '' });
  for (const beat of scene.beats ?? []) steps.push({ kind: 'beat', beat });
  return steps;
}

export interface SceneScript {
  meters: StoryMeter[];
  chapterTitles: Record<string, string>;
  objectives: Record<number, string>;
  firstSceneId: string;
  scenes: StoryScene[];
  /** Dossier cast when the scenario has no quarterly narrative. */
  characters?: { name: string; role: string }[];
  /** Dashboard accent theme (CSS class suffix). */
  theme?: string;
  /** Branching endings evaluated in order when the last scene closes (last = fallback). */
  endings?: StageEnding[];
}

/** Final meters + flags a stage ending is judged on. */
export interface StageEndingContext { meters: Record<string, number>; flags: readonly string[] }

/** A branching story-stage ending. Pure data plus a pure condition. */
export interface StageEnding {
  id: string;
  number: number;
  title: string;
  headline: string;
  narrative: string;
  backdrop: string;
  hint: string;
  relationship: string;
  legacy: string;
  when: (ctx: StageEndingContext) => boolean;
}

/** First matching ending wins; the last ending is the unconditional fallback. */
export function evaluateStageEnding(script: SceneScript, ctx: StageEndingContext): StageEnding | null {
  const list = script.endings ?? [];
  return list.find(e => e.when(ctx)) ?? list[list.length - 1] ?? null;
}

export function stageEndingById(script: SceneScript, id: string | null | undefined): StageEnding | null {
  return script.endings?.find(e => e.id === id) ?? null;
}

/** The N decisions with the largest total meter swing, in the order they were made. */
export function consequentialDecisions(history: StorySession['history'], n = 3) {
  const weight = (d: Record<string, number>) => Object.values(d).reduce((a, v) => a + Math.abs(v), 0);
  const ranked = history.map((h, i) => ({ h, i, w: weight(h.deltas) })).sort((a, b) => b.w - a.w || a.i - b.i).slice(0, n);
  return ranked.sort((a, b) => a.i - b.i).map(r => r.h);
}

/** A fresh run of the same scenario with default meters. Never touches device-wide progress. */
export function replayStory(story: StoryState): StoryState {
  const script = sceneScriptFor(story.scenarioId);
  return { ...storyStateSchema.parse({ scenarioId: story.scenarioId }), session: script ? startSession(script) : null };
}

type StorySession = NonNullable<StoryState['session']>;

export const SCENE_SCRIPTS: Record<string, SceneScript> = {
  'enemy-across-the-aisle': ENEMY_ACROSS_THE_AISLE_SCRIPT,
  'the-underdog': UNDERDOG_SCRIPT,
  'the-legacy-burden': LEGACY_SCRIPT,
  'crisis-leadership': CRISIS_SCRIPT,
  'civil-war-alternate-destiny': CIVIL_WAR_SCRIPT,
};

export function sceneScriptFor(scenarioId: string): SceneScript | undefined { return SCENE_SCRIPTS[scenarioId]; }
export function sceneById(script: SceneScript, id: string): StoryScene | undefined { return script.scenes.find(s => s.id === id); }

export function startSession(script: SceneScript): StorySession {
  return { sceneId: script.firstSceneId, meters: Object.fromEntries(script.meters.map(m => [m.id, m.value])), flags: [], pendingChoice: null, history: [], visited: [script.firstSceneId], complete: false };
}

/** Story state with an active session; starts one when missing. */
export function ensureSession(story: StoryState): StoryState {
  const script = sceneScriptFor(story.scenarioId);
  if (!script || (story.session && sceneById(script, story.session.sceneId))) return story;
  return { ...story, session: startSession(script) };
}

function clampMeter(script: SceneScript, id: string, v: number) {
  const m = script.meters.find(x => x.id === id);
  return m ? Math.max(m.min, Math.min(m.max, v)) : v;
}

/** Apply a choice once; repeated/stale choices are rejected. */
export function chooseScene(story: StoryState, sceneId: string, choiceId: string): { ok: true; story: StoryState; deltas: Record<string, number> } | { ok: false; message: string } {
  const script = sceneScriptFor(story.scenarioId), s = story.session;
  if (!script || !s || s.complete) return { ok: false, message: 'No active scene.' };
  if (s.sceneId !== sceneId || s.pendingChoice) return { ok: false, message: 'That choice has already been made.' };
  const choice = sceneById(script, sceneId)?.choices?.find(c => c.id === choiceId);
  if (!choice) return { ok: false, message: 'Unknown choice.' };
  const meters = { ...s.meters }, deltas: Record<string, number> = {};
  for (const [k, d] of Object.entries(choice.effects)) { const before = meters[k] ?? 0; meters[k] = clampMeter(script, k, before + d); deltas[k] = meters[k]! - before; }
  const flags = [...new Set([...s.flags, ...(choice.flagSets ?? [])])];
  return { ok: true, deltas, story: { ...story, session: { ...s, meters, flags, pendingChoice: choiceId, history: [...s.history, { sceneId, choiceId, label: choice.label, deltas }] } } };
}

/** Move past the current scene (after a choice, or a dialogue-only beat). */
export function continueScene(story: StoryState): StoryState {
  const script = sceneScriptFor(story.scenarioId), s = story.session;
  if (!script || !s || s.complete) return story;
  const scene = sceneById(script, s.sceneId);
  if (!scene) return story;
  if (scene.choices?.length && !s.pendingChoice) return story;
  const choice = scene.choices?.find(c => c.id === s.pendingChoice);
  const idx = script.scenes.indexOf(scene);
  const next = choice?.nextSceneId ?? scene.nextSceneId ?? script.scenes[idx + 1]?.id;
  if (!next || !sceneById(script, next)) {
    const ending = story.ending ?? evaluateStageEnding(script, { meters: s.meters, flags: s.flags })?.id ?? null;
    return { ...story, ending, session: { ...s, pendingChoice: null, complete: true } };
  }
  const nextScene = sceneById(script, next)!;
  return { ...story, act: nextScene.act, chapter: nextScene.chapter, session: { ...s, sceneId: next, pendingChoice: null, visited: [...s.visited, next] } };
}
