/** Act I screenplay layer for "Enemy Across the Aisle": display-only scene staging merged by scene id.
 * Never touches choices, effects, flags or flow. Names must match speaker names (full or surname). */
import type { StoryScene } from '../story-engine';

type Layer = Pick<StoryScene, 'setting' | 'narration' | 'castInRoom' | 'stageDirection' | 'beats'> & { dialogue?: string };

const VANCE = 'Senator Julian Vance', DANA = 'Dana Cole', OSB = 'Chairman Osborne', IRIS = 'Iris Malone';

export const ENEMY_ACT1_SCREENPLAY: Record<string, Layer> = {
  // Ch.1 Introduction
  act1_ch1_sc1: {
    setting: { time: 'Monday, 11:40 AM', location: 'Senate Chamber, Washington D.C.', weatherOrMood: 'Grey drizzle' },
    narration: 'On Monday morning the Senate held its first session of the spring term. Freshman Senator {name} had spent forty minutes tearing apart the opposition’s water bill — a bill written by Julian Vance, the most feared man across the aisle. As the gavel falls for recess, the chamber empties, and Vance does not leave.',
    castInRoom: [VANCE],
    stageDirection: 'Vance straightens his cuffs, steps into the aisle and blocks your path with a polite, dangerous smile.',
    dialogue: 'So you are Senator {lastName}. The freshman everyone keeps warning me about. You tore my water bill apart on the floor this morning. Bold — or reckless. Which is it?',
  },
  act1_ch1_sc2: {
    setting: { time: 'Monday, 12:05 PM', location: 'Ohio Clock Corridor, U.S. Capitol' },
    narration: 'Camera shutters are still clicking down the corridor when your strategist finds you. Dana Cole has run three Senate campaigns and lost none of them. She does not look happy.',
    castInRoom: [DANA],
    stageDirection: 'Dana falls into step beside you, phone in one hand, a chewed pen cap in the other.',
    beats: [{ speaker: DANA, text: 'Keep walking, {lastName}. Do not look back. They are still shooting.', stageDirection: 'She lowers her voice to a hush.' }],
  },
  act1_ch1_sc3: {
    setting: { time: 'Monday, 2:30 PM', location: 'Senate Press Gallery' },
    narration: 'The press gallery is a narrow room of folding chairs and too many microphones. In the front row sits Iris Malone of the Capitol Ledger — the reporter who ended two careers last year.',
    castInRoom: [IRIS, DANA],
    stageDirection: 'Iris clicks her tape recorder on and sets it on the lectern, inches from your hand.',
    beats: [{ speaker: DANA, text: 'Thirty seconds. Water bill only. Nothing personal.', stageDirection: 'Dana whispers from the side door.' }],
    dialogue: 'Senator {lastName}, one question. Is there something between you and Julian Vance the voters should know about?',
  },
  act1_ch1_sc4: {
    setting: { time: 'Monday, 7:15 PM', location: 'Party Headquarters, Back Office', weatherOrMood: 'Cigar smoke' },
    narration: 'Chairman Arthur Osborne runs the party the way old men run card games — quietly, and always with the house’s money. Tonight he has sent for you. Dana waits outside; she was not invited.',
    castInRoom: [OSB],
    stageDirection: 'Osborne taps a silver fountain pen against the desk. His heavy ring catches the lamplight. He does not stand.',
    beats: [{ speaker: OSB, text: 'Close the door, {title}. Some conversations do not need witnesses.', stageDirection: 'He waves dismissively at the empty chair.' }],
  },
  act1_ch1_sc5: {
    setting: { time: 'Thursday, 4:00 PM', location: 'Senate Chamber — Final Vote' },
    narration: 'Thursday arrives. The galleries are full, the cameras are live, and every senator’s name is called aloud. Osborne watches from the leadership benches. Vance sits across the aisle, perfectly still.',
    castInRoom: [VANCE, OSB],
    stageDirection: 'The clerk reads the final tally. Somewhere a gavel strikes.',
  },
  act1_ch1_sc6: {
    setting: { time: 'Thursday, 11:50 PM', location: 'Capitol Rooftop Terrace', weatherOrMood: 'Clear, cold night' },
    narration: 'Long after the chamber empties you climb the service stairs for air. The city glows beneath you. You are not alone.',
    castInRoom: [VANCE],
    stageDirection: 'Vance has loosened his tie. He leans on the stone rail and does not turn around when he hears your footsteps.',
  },
  // Ch.2 Building Connections
  act1_ch2_sc1: {
    setting: { time: 'Monday, 6:45 AM', location: 'Senate Dining Room', weatherOrMood: 'Dawn light' },
    narration: 'A new week. The papers are stacked on the table, and your name is in all of them. Dana is already on her second coffee.',
    castInRoom: [DANA],
    stageDirection: 'Dana slides a polling sheet across the table and taps the number circled in red.',
  },
  act1_ch2_sc2: {
    setting: { time: 'Monday, 10:00 AM', location: 'Leadership Suite, Russell Building' },
    narration: 'Committee assignments are the currency of the Senate, and Osborne prints the money. He summons you before the list goes public.',
    castInRoom: [OSB, DANA],
    stageDirection: 'Osborne signs a page without reading it, then caps his fountain pen with a click.',
    beats: [{ speaker: DANA, text: 'Whatever he offers, it is not a gift.', stageDirection: 'Dana murmurs as you pass her in the doorway.' }],
  },
  act1_ch2_sc3: {
    setting: { time: 'Wednesday, 1:20 PM', location: 'Energy Committee Anteroom, Dirksen Building' },
    narration: 'Between hearings, the anteroom empties for lunch. Only one other senator stays behind, reading your amendments.',
    castInRoom: [VANCE],
    stageDirection: 'Vance closes the folder slowly and meets your eyes without blinking.',
  },
  act1_ch2_sc4: {
    setting: { time: 'Wednesday, 6:30 PM', location: 'Hearing Room 366, Dirksen Building' },
    narration: 'The markup session runs late. Staffers whisper in the back row. On the table between you sits a forty-page draft: rural broadband for your district, written in Vance’s hand.',
    castInRoom: [VANCE, DANA],
    stageDirection: 'Vance pushes the draft across the table and leaves a pen on top of it.',
    beats: [{ speaker: DANA, text: 'If you sign that, Osborne will hear about it before you reach the elevator.', stageDirection: 'Dana leans in from behind your chair.' }],
    dialogue: 'Rural broadband, {lastName}. My draft, your district. Co-sponsor it with me and it passes. Refuse and it dies, and your farmers keep waiting.',
  },
  act1_ch2_sc5: {
    setting: { time: 'Friday, 9:10 AM', location: 'Outside the Capitol Ledger Offices' },
    narration: 'Iris Malone catches you on the sidewalk, coffee in hand, as if by accident. Nothing Iris does is an accident.',
    castInRoom: [IRIS],
    stageDirection: 'She holds up her phone, a grainy photo of a diner window glowing on the screen.',
  },
  act1_ch2_sc6: {
    setting: { time: 'Friday, 10:40 PM', location: 'Your Office, Hart Building' },
    narration: 'The building is dark when you return. Under your office door, someone has slid a folded note on heavy cream paper.',
    stageDirection: 'You unfold it under the desk lamp.',
  },
  // Ch.3 The First Conflict
  act1_ch3_sc1: {
    setting: { time: 'Tuesday, 8:05 PM', location: 'Campaign War Room', weatherOrMood: 'Every screen tuned to cable news' },
    narration: 'On every television in the war room, Julian Vance is calling your energy plan “a gift to polluters.” Phones are ringing. Interns are pretending not to watch you.',
    castInRoom: [DANA],
    stageDirection: 'Dana mutes the wall of screens with one stab of the remote.',
  },
  act1_ch3_sc2: {
    setting: { time: 'Wednesday, 11:00 AM', location: 'Network Studio, Washington Bureau' },
    narration: 'The network wants a spectacle: the freshman and the veteran, one stage, live. Iris Malone has been chosen to moderate.',
    castInRoom: [IRIS, DANA],
    stageDirection: 'Iris sets her tape recorder on the producer’s desk, already running.',
  },
  act1_ch3_sc3: {
    setting: { time: 'Saturday, 7:40 PM', location: 'Green Room, Columbus Civic Hall' },
    narration: 'Twenty minutes to air. Makeup artists come and go. Then the door opens, and the room clears without anyone being asked.',
    castInRoom: [VANCE],
    stageDirection: 'Vance tugs his tie loose, then tightens it again, twice.',
  },
  act1_ch3_sc4: {
    setting: { time: 'Saturday, 8:30 PM', location: 'Debate Stage, Columbus Civic Hall', weatherOrMood: 'Live television' },
    narration: 'Two podiums. Two thousand people. Forty million watching at home. Iris Malone asks the final question, and Vance answers it by turning to face you.',
    castInRoom: [VANCE, IRIS],
    stageDirection: 'The spotlight narrows. Vance grips the podium and points straight at you.',
    beats: [{ speaker: IRIS, text: 'Senator Vance, your rebuttal — and keep it to the issues, please.', stageDirection: 'Iris raises an eyebrow over her notes.' }],
    dialogue: 'My opponent talks about the future, but votes for the past. Tell the people, Senator {lastName} — whose side are you really on?',
  },
  act1_ch3_sc5: {
    setting: { time: 'Saturday, 10:15 PM', location: 'Spin Room, Columbus Civic Hall' },
    narration: 'Reporters swarm the spin room. Snap polls flash on every phone. Dana pulls you behind a curtain before the first microphone reaches you.',
    castInRoom: [DANA],
    stageDirection: 'Dana holds two buzzing phones, one in each hand.',
  },
  act1_ch3_sc6: {
    setting: { time: 'Saturday, 11:55 PM', location: 'Civic Hall Rooftop', weatherOrMood: 'Thunder rolling in' },
    narration: 'Rain is coming. Up on the roof, away from the cameras, the only light is the red blink of a radio tower — and the glow of Vance’s cigarette.',
    castInRoom: [VANCE],
    stageDirection: 'Thunder breaks overhead. Vance does not flinch.',
  },
};
