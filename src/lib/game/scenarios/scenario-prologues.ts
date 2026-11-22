/** Prologue scene scripts (one chapter, six scenes) for the base scenarios. Pure data. */
import type { SceneScript, StoryScene, StorySceneChoice } from '../story-engine';

type Sp = StoryScene['speaker'];
type Beat = [title: string, backdrop: string, speaker: Sp, dialogue: string, choices?: StorySceneChoice[]];
const sp = (name: string, role: string, portraitKey?: string) => (expression = 'neutral'): Sp => ({ name, role, ...(portraitKey ? { portraitKey } : {}), expression });
const N = (role: string): Sp => ({ name: 'Narrator', role });
const c = (id: string, label: string, reactionText: string, reactionExpression: string, effects: Record<string, number>, headline: string, flagSets?: string[]): StorySceneChoice =>
  ({ id, label, reactionText, reactionExpression, effects, headline, ...(flagSets ? { flagSets } : {}) });

function build(prefix: string, beats: Beat[]): StoryScene[] {
  return beats.map(([title, backdrop, speaker, dialogue, choices], i) => {
    const n = i + 1, id = `${prefix}_ch1_sc${n}`;
    return { id, act: 1, chapter: 1, sceneNumber: n, title, backdrop, speaker, dialogue, ...(choices ? { choices } : {}), ...(n < beats.length ? { nextSceneId: `${prefix}_ch1_sc${n + 1}` } : {}) };
  });
}
const meter = (id: string, label: string, icon: string, value = 50) => ({ id, label, icon, min: 0, max: 100, value });

// THE UNDERDOG ---------------------------------------------------------------
const Rosa = sp('Rosa Delgado', 'Volunteer organiser', 'chief');
const Thorne = sp('Governor Thorne', 'Establishment frontrunner', 'chair');
const Kai = sp('Kai Mensah', 'Local reporter', 'reporter');
export const UNDERDOG_SCRIPT: SceneScript = {
  meters: [meter('grassroots', 'Grassroots Energy', '✊', 35), meter('warchest', 'War Chest', '💰', 15), meter('credibility', 'Media Credibility', '📰', 40), meter('resistance', 'Establishment Heat', '🏢', 30)],
  chapterTitles: { '1-1': 'A Street Corner' },
  objectives: { 1: 'Turn a handful of volunteers into a movement the machine cannot ignore.' },
  characters: [{ name: 'Rosa Delgado', role: 'Volunteer organiser' }, { name: 'Governor Thorne', role: 'Establishment frontrunner' }, { name: 'Kai Mensah', role: 'Local reporter' }],
  theme: 'underdog',
  firstSceneId: 'ud_ch1_sc1',
  scenes: build('ud', [
    ['The Folding Table', 'street', Rosa('confident'), 'Twelve volunteers, one folding table, and a borrowed megaphone. Everyone says you cannot win. So — what do we tell them?', [
      c('doors', 'Knock every door yourself', 'Then I am bringing better shoes. Let us go.', 'confident', { grassroots: 15, warchest: -5 }, 'Unknown candidate knocks 400 doors in a day', ['door-knocker']),
      c('rally', 'Hold a loud street rally', 'Loud I can do. The police might have opinions.', 'neutral', { grassroots: 10, credibility: 5, resistance: 5 }, 'Street rally stops traffic downtown'),
      c('donors', 'Call small donors first', 'Money before people? Fine — but only five-dollar people.', 'guarded', { warchest: 15, grassroots: -5 }, 'Upstart raises $8,000 in small gifts'),
    ]],
    ['A Thin Envelope', 'backroom', N('Campaign office'), 'The rent is due. The phone bill is overdue. A thin envelope from a supporter holds forty dollars and a note: “Don’t quit.”'],
    ['The Reporter Shows Up', 'press', Kai('probing'), 'Nobody covers your race. I’m here because I’m curious. Give me one reason my editor should care.', [
      c('story', 'Tell your real story', 'That’s… actually a headline. Don’t make me regret it.', 'neutral', { credibility: 15, grassroots: 5 }, 'From night shifts to the ballot', ['told-story']),
      c('attack', 'Attack Governor Thorne', 'Everyone attacks Thorne. You sound like everyone.', 'cynical', { resistance: 10, credibility: -5, grassroots: 5 }, 'Upstart takes aim at Thorne'),
    ]],
    ['The Governor’s Offer', 'gala', Thorne('transactional'), 'You have energy. I have a machine. Drop out, endorse me, and there is a deputy post with your name on it.', [
      c('refuse', 'Refuse to your face', 'Then enjoy losing. It builds character.', 'ruthless', { grassroots: 15, resistance: 15, credibility: 5 }, 'Upstart rejects Thorne’s backroom offer', ['refused-thorne']),
      c('delay', 'Ask for time to think', 'Take a week. After that, the offer is gone — and so are you.', 'stern', { warchest: 5, grassroots: -5 }, 'Rumours swirl of a Thorne deal'),
      c('record', 'Secretly record the offer', 'You didn’t hear that from me… did you?', 'guarded', { credibility: 10, resistance: 20, warchest: 5 }, 'Tape of Thorne’s offer surfaces', ['taped-thorne']),
    ]],
    ['The Flyers Vanish', 'street', Rosa('anxious'), 'Someone tore down every poster on Fifth Street overnight. The volunteers are scared. Some want to go home.'],
    ['Night on the Steps', 'capitol', N('The Capitol steps'), 'From here the Capitol looks enormous. Then Rosa sends a photo: forty new volunteers queued outside the office. The machine just noticed you.'],
  ]),
};

// THE LEGACY BURDEN ----------------------------------------------------------
const Father = sp('Senator Aldric Hale', 'Your father · Dynasty patriarch', 'chair');
const Lena = sp('Lena Hale', 'Your sister · Family fixer', 'chief');
const Ward = sp('Miriam Ward', 'Biographer', 'reporter');
export const LEGACY_SCRIPT: SceneScript = {
  meters: [meter('prestige', 'Dynasty Prestige', '👑', 70), meter('independence', 'Independence', '🕊️', 25), meter('oldguard', 'Old Guard Loyalty', '🤝', 60), meter('secrets', 'Secrets Exposed', '🔍', 10)],
  chapterTitles: { '1-1': 'The Family Name' },
  objectives: { 1: 'Step out of your father’s shadow without bringing the house down.' },
  characters: [{ name: 'Senator Aldric Hale', role: 'Your father · Dynasty patriarch' }, { name: 'Lena Hale', role: 'Your sister · Family fixer' }, { name: 'Miriam Ward', role: 'Biographer' }],
  theme: 'legacy',
  firstSceneId: 'lg_ch1_sc1',
  scenes: build('lg', [
    ['The Portrait Hall', 'gala', Father('stern'), 'Three generations of Hales on these walls. Yours goes up next — if you run the campaign my way.', [
      c('obey', 'Accept his campaign team', 'Good. A Hale does not improvise.', 'confident', { prestige: 10, oldguard: 10, independence: -10 }, 'Hale heir unveils father’s veteran team'),
      c('own', 'Insist on your own team', 'Your grandfather said the same. He lost his first race.', 'furious', { independence: 15, oldguard: -10 }, 'Hale heir breaks with family advisers', ['own-team']),
    ]],
    ['Breakfast Diplomacy', 'backroom', Lena('practical'), 'Father is furious, the donors are nervous, and I am the one who cleans up. Please tell me you have a plan.'],
    ['The Biographer', 'press', Ward('probing'), 'I’m writing the definitive Hale history. Your father refuses to discuss 1998. Will you?', [
      c('silent', '“Ask my father.”', 'A family answer. I expected nothing less.', 'cynical', { oldguard: 5, secrets: -5 }, 'Hale heir stonewalls biographer'),
      c('curious', '“What happened in 1998?”', 'You genuinely don’t know. That is the most interesting thing in this book.', 'probing', { independence: 5, secrets: 15 }, 'Biographer hints at Hale family secret', ['asked-1998']),
    ]],
    ['The Locked Ledger', 'backroom', Lena('anxious'), 'I found Father’s old ledger. Payments to a construction firm in 1998 — and a name I don’t recognise. What do we do with this?', [
      c('burn', 'Burn it', 'Then it never existed. I hope you can live with that.', 'distressed', { secrets: -10, prestige: 5, independence: -5 }, 'Quiet weekend at Hale estate', ['burned-ledger']),
      c('keep', 'Keep it as leverage', 'Leverage against our own father. You are more of a Hale than you think.', 'guarded', { independence: 10, oldguard: -5 }, 'Hale heir grows distant from patriarch', ['kept-ledger']),
      c('confront', 'Confront Father tonight', 'He will never forgive you. But maybe that is the point.', 'neutral', { independence: 15, prestige: -10, secrets: 10 }, 'Raised voices at the Hale mansion', ['confronted-father']),
    ]],
    ['Whispers at the Club', 'gala', N('The Senators’ Club'), 'Old men lower their voices as you pass. Your name opens every door — but every door has someone listening behind it.'],
    ['The Empty Frame', 'capitol', Father('vulnerable'), 'Your grandfather once told me a name is a debt, not a gift. I did not believe him. Perhaps you will.'],
  ]),
};

// CRISIS LEADERSHIP ----------------------------------------------------------
const Chief = sp('General Okafor', 'Chief of Staff', 'chief');
const Fin = sp('Minister Vale', 'Finance Minister', 'chair');
const Press = sp('Nadia Petrov', 'Press secretary', 'reporter');
export const CRISIS_SCRIPT: SceneScript = {
  meters: [meter('order', 'Civil Order', '🚨', 40), meter('resources', 'Emergency Reserves', '🏥', 45), meter('cabinet', 'Cabinet Cohesion', '🤝', 55), meter('economy', 'Economic Solvency', '📉', 35)],
  chapterTitles: { '1-1': 'The First Night' },
  objectives: { 1: 'Get the nation through the first 72 hours without losing the cabinet.' },
  characters: [{ name: 'General Okafor', role: 'Chief of Staff' }, { name: 'Minister Vale', role: 'Finance Minister' }, { name: 'Nadia Petrov', role: 'Press secretary' }],
  theme: 'crisis',
  firstSceneId: 'cr_ch1_sc1',
  scenes: build('cr', [
    ['The Situation Room', 'warroom', Chief('anxious'), 'Banks froze withdrawals an hour ago. Strikes are spreading in three cities. Madam President, we need your first order.', [
      c('curfew', 'Declare a curfew', 'Understood. The streets will be quiet. The people will not.', 'stern', { order: 15, cabinet: 5, economy: -5 }, 'President orders nationwide curfew', ['curfew']),
      c('address', 'Address the nation now', 'Then say something they can believe.', 'neutral', { order: 5, cabinet: 5 }, 'President speaks as crisis deepens', ['addressed-nation']),
      c('reserves', 'Release emergency reserves', 'That buys us a week. Maybe.', 'guarded', { resources: -15, order: 10, economy: 5 }, 'Emergency fund opened to calm markets'),
    ]],
    ['Midnight Ledger', 'backroom', Fin('transactional'), 'The treasury has eleven days of liquidity. After that, we print money or we cut pensions. There is no third door.'],
    ['Briefing Room', 'press', Press('anxious'), 'Two hundred reporters, one podium. What do I tell them — the truth or the plan?', [
      c('truth', 'Tell them the truth', 'Brave. Markets may hate it. People may not.', 'neutral', { order: 5, economy: -10, cabinet: -5 }, 'Government admits depth of crisis', ['told-truth']),
      c('calm', 'Project total calm', 'Calm it is. Let’s pray nothing leaks.', 'guarded', { economy: 10, cabinet: 5 }, 'Officials insist situation “under control”'),
    ]],
    ['The Bailout Vote', 'warroom', Fin('stern'), 'The banks want a bailout. The unions want the banks to burn. The cabinet is split down the middle. Decide.', [
      c('bailout', 'Bail out the banks', 'Markets will rally. The streets will not forgive you quickly.', 'confident', { economy: 20, order: -15, cabinet: 5 }, 'Government rescues collapsing banks', ['bailout']),
      c('unions', 'Side with the workers', 'Then I offer my resignation by morning.', 'furious', { order: 15, economy: -10, cabinet: -15 }, 'Finance minister threatens to quit', ['sided-unions']),
      c('split', 'Partial rescue with conditions', 'Nobody will love it. That may mean it is right.', 'neutral', { economy: 5, order: 5, resources: -10 }, 'Conditional rescue package announced'),
    ]],
    ['Smoke on the Horizon', 'street', N('The capital'), 'Fires flicker on the east side. Not riots — barricades. The protesters are waiting to see what kind of leader you are.'],
    ['Dawn', 'capitol', Chief('vulnerable'), 'We made it to sunrise. Seventy hours to go. Get an hour of sleep, Madam President. Tomorrow is worse.'],
  ]),
};
