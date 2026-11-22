/** Complete 72-scene script for "Enemy Across the Aisle" (4 acts × 3 chapters × 6 scenes). Pure data. */
import { ENEMY_ACT1_SCREENPLAY } from './enemy-act1-screenplay';
import type { SceneScript, StageEnding, StageEndingContext, StoryScene, StorySceneChoice } from '../story-engine';

type Sp = StoryScene['speaker'];
const V = (expression = 'neutral'): Sp => ({ name: 'Senator Julian Vance', role: 'Rival · Opposition leader', portraitKey: 'rival', expression });
const D = (expression = 'neutral'): Sp => ({ name: 'Dana Cole', role: 'Campaign strategist', portraitKey: 'chief', expression });
const O = (expression = 'neutral'): Sp => ({ name: 'Chairman Osborne', role: 'Party boss', portraitKey: 'chair', expression });
const I = (expression = 'neutral'): Sp => ({ name: 'Iris Malone', role: 'Investigative journalist', portraitKey: 'reporter', expression });
const N: Sp = { name: 'Narrator', role: 'The Capitol' };

const c = (id: string, label: string, reactionText: string, reactionExpression: string, effects: Record<string, number>, headline: string, flagSets?: string[]): StorySceneChoice =>
  ({ id, label, reactionText, reactionExpression, effects, headline, ...(flagSets ? { flagSets } : {}) });

type Beat = [title: string, backdrop: string, speaker: Sp, dialogue: string, choices?: StorySceneChoice[]];

/** Six beats per chapter: opening, development, character moment, major decision, complication, finale. */
const CHAPTERS: Beat[][] = [
  // ACT I — THE BEGINNING
  [ // Ch.1 Introduction
    ['The First Clash', 'senate', V('confident'), 'So you are the freshman everyone keeps warning me about. You tore my water bill apart on the floor this morning. Bold — or reckless. Which is it?', [
      c('spar', 'Hold your ground', 'Reckless, then. Good. I was getting bored of people who flinch.', 'confident', { affinity: 10, momentum: 5 }, 'Freshman stands toe-to-toe with Vance', ['sparred-vance']),
      c('concede', 'Offer a compromise', 'A compromise, on day one? Your whip will have your head. …I will think about it.', 'guarded', { affinity: 5, party: -5, integrity: 5 }, 'Cross-aisle olive branch raises eyebrows', ['offered-compromise']),
      c('snub', 'Walk away', 'Running already? Pity. The cameras liked the two of us together.', 'furious', { affinity: -10, party: 10 }, 'Party cheers as freshman snubs Vance', ['snubbed-vance']),
    ]],
    ['Corridor Whispers', 'capitol', D('anxious'), 'Three photographers caught you with Vance outside the chamber. Whatever you said, the party will read it in tomorrow’s papers. Choose your next words carefully.'],
    ['The Reporter’s Question', 'press', I('probing'), 'Senator, one question. Is there something between you and Julian Vance the voters should know about?', [
      c('deny', 'Deny it flatly', 'Flatly. Noted. Denials make the best second headlines.', 'cynical', { party: 5, integrity: -5 }, '“Nothing there,” insists freshman', ['denied-vance']),
      c('deflect', 'Talk about the water bill', 'Smooth. You will go far — or straight into my notebook.', 'neutral', { momentum: 10 }, 'Freshman pivots to water reform'),
      c('honest', '“We respect each other.”', 'Respect. In this building? That is the most interesting thing anyone has told me all year.', 'probing', { integrity: 10, affinity: 5, party: -5 }, 'Rivals “respect each other,” says senator', ['admitted-respect']),
    ]],
    ['The Chairman’s Summons', 'backroom', O('stern'), 'Sit. The water bill vote is Thursday. You will vote against it, loudly, and you will call Vance a fraud on camera. Is that clear?', [
      c('obey', 'Agree to the attack line', 'Good. Loyalty is cheap until it is not. Remember who bought your first campaign.', 'transactional', { party: 15, affinity: -10, integrity: -5 }, 'Freshman brands Vance “a fraud”', ['attacked-vance']),
      c('soften', 'Vote no, skip the insult', 'Half a soldier is still half a traitor. We will see.', 'stern', { party: 5, integrity: 5 }, 'Senator opposes bill, declines personal attack'),
      c('defy', 'Refuse — the bill helps your district', 'Then you had better hope your district remembers you when I do not.', 'ruthless', { party: -15, integrity: 10, momentum: 5 }, 'Freshman defies party on water bill', ['defied-osborne-water']),
    ]],
    ['The Vote', 'senate', N, 'The chamber holds its breath. Fifty-one to forty-nine. The tally board flickers, and somewhere across the aisle Vance looks straight at you — not at the board.'],
    ['After Hours', 'rooftop', V('vulnerable'), 'Everyone left. I usually come up here when I lose. Tonight I am not sure if I lost. Stay a minute? No cameras. Just… the city.'],
  ],
  [ // Ch.2 Building Connections
    ['Coffee at Dawn', 'capitol', D('practical'), 'New week, new numbers. Your profile jumped ten points after the vote. People want to know who you are. So do I, frankly.'],
    ['The Committee Assignment', 'senate', O('transactional'), 'You are on the Energy Committee. So is Vance. Find his weak spot. Every man has one, and his has never been found.'],
    ['Between Hearings', 'backroom', V('guarded'), 'Osborne put you on my committee to spy on me. Everyone knows. The question is whether you are any good at it.'],
    ['The Shared Bill', 'senate', V('neutral'), 'Rural broadband. My draft, your district. Co-sponsor it with me and it passes. Refuse and it dies, and your farmers keep waiting.', [
      c('cosponsor', 'Co-sponsor with Vance', 'Then we are officially dangerous. I like the sound of that.', 'confident', { affinity: 15, party: -10, momentum: 10 }, 'Unlikely duo unveil broadband bill', ['cosponsored-broadband']),
      c('amend', 'Demand your own amendments first', 'You negotiate like you mean it. Fine. Mark it up.', 'guarded', { affinity: 5, integrity: 5, party: 5 }, 'Freshman forces changes to Vance bill'),
      c('leak', 'Leak the draft to Osborne', 'I had a feeling. I just hoped I was wrong.', 'furious', { affinity: -15, party: 15, integrity: -10 }, 'Leaked draft sinks broadband plan', ['leaked-broadband']),
    ]],
    ['Ink and Blood', 'press', I('cynical'), 'My sources say you and Vance were seen at a diner past midnight. Working dinner? The internet has opinions, and they are not about broadband.'],
    ['A Note Under the Door', 'street', N, 'A folded note waits at your office: “Whatever happens next, it was never about the bill. — J.” The handwriting is careful, as if it was rewritten twice.'],
  ],
  [ // Ch.3 The First Conflict
    ['Battle Lines', 'tv', D('anxious'), 'Vance just called your energy plan “a gift to polluters” on national television. We need a response in an hour.'],
    ['The Debate Invitation', 'townhall', I('probing'), 'The network wants a televised debate. You and Vance, one stage, no notes. I am moderating. Try not to bore me.'],
    ['Green Room', 'backroom', V('guarded'), 'I said what I had to say. You know how this works. Out there we are enemies. In here… I do not know what we are.'],
    ['Under the Lights', 'townhall', V('confident'), 'My opponent talks about the future, but votes for the past. Tell the people, Senator — whose side are you really on?', [
      c('counter', 'Hit back with his voting record', 'Touché. You came armed. The audience loved it — and so, unfortunately, did I.', 'confident', { momentum: 15, affinity: -5, party: 10 }, 'Freshman wins debate on the record', ['won-debate']),
      c('high', 'Take the high road', 'Grace under fire. You made me look petty. I deserved it.', 'vulnerable', { integrity: 15, affinity: 10, momentum: -5 }, 'Senator rises above the mud'),
      c('personal', 'Expose a rumor about his family', 'Do not. Not my family. You just crossed a line you cannot uncross.', 'furious', { affinity: -20, momentum: 10, integrity: -15 }, 'Debate turns ugly over Vance family', ['attacked-family']),
    ]],
    ['The Spin Room', 'press', D('protective'), 'The snap polls are in. Whatever you did out there, it moved the needle. Osborne is calling. So is Vance’s office. Which first?'],
    ['Thunder Outside', 'rooftop', V('vulnerable'), 'You want to know why I fight so hard? Because someone once fought for me when nobody else would. One day I will tell you who.'],
  ],
  // ACT II — RISING TENSIONS
  [ // Ch.4 Political Pressure
    ['The Party Ultimatum', 'backroom', O('ruthless'), 'Primary season. I have a challenger ready to run against you. Prove your loyalty and he disappears.'],
    ['War Room', 'warroom', D('practical'), 'Our internal polling shows you can win the primary without Osborne — barely. But it costs money we do not have.'],
    ['A Quiet Warning', 'street', V('guarded'), 'Osborne is going to ask you to destroy me. I am telling you now so you do not have to pretend to be surprised.'],
    ['The Price of Loyalty', 'backroom', O('transactional'), 'Here is a file on Vance’s campaign finances. Release it and your primary is safe. Simple.', [
      c('release', 'Release the file', 'There it is. The killer instinct. Welcome to the family.', 'transactional', { party: 20, affinity: -20, integrity: -10 }, 'Finance file rocks Vance campaign', ['released-file']),
      c('bury', 'Bury it — refuse quietly', 'You will regret this. Not today. But soon.', 'stern', { party: -15, integrity: 10, affinity: 5 }, 'Senator rebuffs party pressure', ['buried-file']),
      c('warn', 'Give the file to Vance', 'You are either a saint or a fool. Either way, I owe you.', 'vulnerable', { affinity: 20, party: -20, integrity: 5 }, 'Mystery tip-off reaches Vance camp', ['warned-vance']),
    ]],
    ['The Primary Challenger', 'tv', D('anxious'), 'A challenger just filed against you. Either Osborne is sending a message — or the file has started a fire we cannot control.'],
    ['Midnight Call', 'rooftop', V('neutral'), 'I heard what happened with Osborne. Whatever you chose, I am still here. That has to count for something.'],
  ],
  [ // Ch.5 Hidden Motives
    ['Unmarked Envelope', 'capitol', N, 'An envelope with no return address: photographs of Osborne meeting an energy lobbyist. The timestamp is the night the water bill died.'],
    ['Iris Digs Deeper', 'press', I('probing'), 'I have been chasing Osborne for years. You might be the first person inside who can prove it. What would you trade for the truth?'],
    ['Confession at the Gala', 'gala', V('vulnerable'), 'The man who fought for me when I was young? It was Osborne. Before he became this. I owe him everything — and I hate that I do.'],
    ['The Leak Dilemma', 'press', I('cynical'), 'Give me the photos and I publish tonight. Osborne falls — but Vance gets dragged into it too. Your call, Senator.', [
      c('publish', 'Give Iris the photos', 'History will thank you. Vance might not.', 'probing', { integrity: 20, party: -15, affinity: -10 }, 'Osborne photographed with energy lobbyist', ['exposed-osborne']),
      c('hold', 'Hold the photos for leverage', 'Leverage. You are learning the wrong lessons from the right people.', 'cynical', { party: 10, integrity: -10, momentum: 5 }, 'Rumors swirl over Osborne secrets', ['held-photos']),
      c('ask', 'Ask Vance first', 'Thank you for asking me. Nobody in this town ever asks.', 'vulnerable', { affinity: 15, integrity: 5 }, 'Rivals huddle as scandal looms', ['asked-vance']),
    ]],
    ['The Lobbyist Calls', 'street', O('furious'), 'Someone is asking questions about my meetings. If it is you, stop. If it is not, find out who. Either way, you have a week.'],
    ['Two Shadows', 'rooftop', N, 'From the rooftop you see two figures in Osborne’s window: the Chairman, and someone who looks a great deal like Dana Cole.'],
  ],
  [ // Ch.6 The Turning Point
    ['Dana Explains', 'warroom', D('protective'), 'Yes, I met Osborne. He threatened to end your career. I was buying you time. Everything I have done was to protect you.'],
    ['The Poll Collapse', 'tv', I('neutral'), 'Breaking: your approval has swung twelve points in a week. Voters are confused about whose side you are on. So, frankly, am I.'],
    ['Under the Bridge', 'street', V('vulnerable'), 'I am tired of pretending. When I look at you across the chamber, I do not see an enemy. I have not for a long time.'],
    ['Crossing the Line', 'rooftop', V('vulnerable'), 'Tell me where we stand. Not as senators. As us.', [
      c('love', 'Admit you feel it too', 'Then we are in so much trouble. And I do not care.', 'confident', { affinity: 25, party: -10, integrity: 5 }, 'Rivals spotted in late-night embrace', ['romance-open']),
      c('pause', 'Not until the election is over', 'Patience. I can do patience. For you, I can do almost anything.', 'guarded', { affinity: 5, momentum: 5, party: 5 }, 'Senator keeps rival at arm’s length', ['romance-paused']),
      c('end', 'End it — this can only hurt you both', 'Then I will hate you on the floor. It will be easier than this.', 'furious', { affinity: -25, party: 15, momentum: 5 }, 'Vance and freshman go to war', ['romance-ended']),
    ]],
    ['The Photograph', 'press', I('cynical'), 'Someone sold a photo of you and Vance on that rooftop. I could run it. I could also find out who sold it. Which story do you want written?'],
    ['Osborne’s Move', 'backroom', O('ruthless'), 'Congratulations. You have handed me the leverage I needed on both of you. Act Three begins now, Senator — on my terms.'],
  ],
  // ACT III — THE CRISIS
  [ // Ch.7 Consequences
    ['Morning Headlines', 'tv', D('anxious'), 'Every channel is running your name next to Vance’s. Donors are calling. Half want refunds, half want to double down.'],
    ['Emergency Caucus', 'senate', O('stern'), 'The caucus meets in an hour to strip you of your committee seat. Unless you give me a reason not to.'],
    ['Vance Under Fire', 'backroom', V('distressed'), 'My party wants me censured. Yours wants you gone. Osborne is winning, and we are letting him.'],
    ['The Hearing', 'court', O('transactional'), 'Testify that Vance pressured you on the broadband bill and your seat is safe. Refuse and you sit in the back row forever.', [
      c('testify', 'Testify against Vance', 'You did what you had to. I hope you can live with it.', 'furious', { party: 20, affinity: -25, integrity: -15 }, 'Senator testifies against Vance', ['testified-vance']),
      c('truth', 'Tell the whole truth — Osborne included', 'You just declared war on the party. I hope you know what you are doing.', 'ruthless', { integrity: 20, party: -20, momentum: 10 }, 'Bombshell testimony implicates Osborne', ['testified-osborne']),
      c('silent', 'Invoke your right to stay silent', 'Silence is an answer too. Not a brave one.', 'stern', { party: -5, integrity: -5, affinity: 5 }, 'Senator stonewalls hearing'),
    ]],
    ['Fallout', 'press', I('probing'), 'Your testimony is trending. Some call you a hero, some call you a snake. I am writing the version that is true. Want to help?'],
    ['The Empty Office', 'capitol', N, 'Your nameplate has been removed from the Energy Committee door. In its place, a single red rose with no card.'],
  ],
  [ // Ch.8 Betrayal and Sacrifice
    ['Dana’s Resignation', 'warroom', D('distressed'), 'I cannot protect you anymore. Osborne has something on me — my brother’s debts. I am resigning before he can use it against you.'],
    ['The Insider', 'street', I('cynical'), 'I found the person who sold the rooftop photo. It was someone in Vance’s own office. Turns out you are not the only one with traitors.'],
    ['Vance Breaks', 'rooftop', V('distressed'), 'My chief of staff sold us out. To Osborne. I trusted him for ten years. I am starting to think the only person I trust is you.'],
    ['The Sacrifice', 'backroom', O('ruthless'), 'Final offer. One of you resigns, the other keeps a career. Decide by morning, or I end you both.', [
      c('self', 'Offer to resign yourself', 'Noble. Pointless, but noble. Vance will survive. You will not.', 'stern', { affinity: 25, integrity: 15, party: -20, momentum: -10 }, 'Senator offers resignation to save rival', ['offered-resignation']),
      c('him', 'Ask Vance to step down', 'He will do it, you know. For you. I almost admire how cruel that is.', 'transactional', { affinity: -20, party: 15, momentum: 10 }, 'Pressure mounts on Vance to quit', ['asked-vance-resign']),
      c('neither', 'Refuse — call his bluff', 'No one calls my bluff. Then again, no one has ever had nothing left to lose.', 'furious', { integrity: 10, momentum: 15, party: -10 }, 'Senator dares Osborne to strike', ['called-bluff']),
    ]],
    ['Dana Returns', 'warroom', D('protective'), 'I could not stay away. If you are going down, you are not going down alone. I brought coffee. And Osborne’s bank records.'],
    ['The Storm Breaks', 'street', N, 'Rain hammers the Capitol steps as Osborne’s car pulls away. In the morning papers, one headline waits — and it names everyone.'],
  ],
  [ // Ch.9 The Breaking Point
    ['The Indictment Rumor', 'court', I('probing'), 'Federal investigators are asking about Osborne. And about you. If you have anything to confess, now is the moment.'],
    ['Party Civil War', 'senate', O('furious'), 'Half my caucus has stopped returning calls. This is your doing. You think you are winning? Watch what I do when cornered.'],
    ['Confession', 'rooftop', V('vulnerable'), 'If we burn, I want to burn honestly. No more secret meetings. No more rooftops. I want to stand next to you in daylight.'],
    ['Going Public', 'press', I('neutral'), 'Cameras are set. Whatever you say next defines the rest of your career. And maybe his.', [
      c('announce', 'Announce your alliance with Vance', 'That is the bravest thing I have seen in this town. It might also be the dumbest.', 'probing', { affinity: 20, integrity: 15, party: -20, momentum: 10 }, 'Rivals go public: “We stand together”', ['public-alliance']),
      c('expose', 'Expose Osborne’s bank records', 'The records are real. Osborne is finished. You are not — yet.', 'cynical', { integrity: 20, party: -10, momentum: 15 }, 'Bank records expose Party Chairman', ['exposed-records']),
      c('deny', 'Deny everything and fight on alone', 'Same old politics. I expected more from you.', 'cynical', { party: 15, integrity: -15, affinity: -15 }, 'Defiant senator denies all charges', ['denied-everything']),
    ]],
    ['Breaking News', 'tv', D('anxious'), 'The networks broke in with your statement. Osborne has called an emergency press conference. He is going to try something desperate.'],
    ['Osborne Falls', 'capitol', O('furious'), 'You think this is over? I built this party. I can still choose who leads it into the election. Enjoy your last free week.'],
  ],
  // ACT IV — THE FINAL BATTLE
  [ // Ch.10 Final Preparations
    ['Rebuilding', 'warroom', D('practical'), 'Ninety days to the election. We have no party machine, a nervous donor base, and the most famous rivalry in the country. Let us use it.'],
    ['The Endorsement Race', 'gala', O('transactional'), 'The party needs a nominee. I can still make it you — if you publicly forgive me. Politics is forgetting at the right moment.'],
    ['Vance’s Choice', 'rooftop', V('guarded'), 'My party offered me the nomination too. If we both run, one of us loses everything. Maybe we should talk about that.'],
    ['The Ticket', 'warroom', D('protective'), 'Three paths. Make peace with Osborne, run an independent campaign, or something no one has ever tried — a cross-party ticket with Vance.', [
      c('osborne', 'Take Osborne’s deal', 'Smart. Ugly, but smart. The machine is yours again.', 'transactional', { party: 25, integrity: -20, affinity: -15 }, 'Senator reconciles with disgraced Chairman', ['osborne-deal']),
      c('indie', 'Run independent', 'No party, no safety net. Only you and the voters. Let us go win it.', 'confident', { integrity: 15, momentum: 10, party: -15 }, 'Senator launches independent bid', ['independent-run']),
      c('unity', 'Propose a unity ticket with Vance', 'A unity ticket. They will call us mad. They will also call us history.', 'confident', { affinity: 20, momentum: 15, party: -10 }, 'Historic cross-party ticket announced', ['unity-ticket']),
    ]],
    ['The Backlash', 'tv', I('cynical'), 'Pundits are calling your move either genius or political suicide. Your opponents are already cutting attack ads.'],
    ['Eve of the Campaign', 'street', V('confident'), 'Whatever happens out there, I am glad it was you on the other side of the aisle. It made me better.'],
  ],
  [ // Ch.11 The Last Decision
    ['The October Surprise', 'press', I('probing'), 'Someone just leaked a recording of you from Osborne’s office, months ago. It is edited, but it is damaging. You have twelve hours.'],
    ['Damage Control', 'warroom', D('anxious'), 'The polls dropped six points overnight. We can fight the recording, release our own, or let it burn out.'],
    ['Last Rooftop', 'rooftop', V('vulnerable'), 'Whatever you decide tomorrow, decide it as yourself. Not for me. Not for Osborne. For the person who walked onto that floor on day one.'],
    ['The Final Debate', 'townhall', I('neutral'), 'Final question of the campaign, Senator. Why should anyone trust you after everything?', [
      c('truth', 'Tell the unedited truth', 'Nobody has ever answered that honestly on this stage. The room is silent — in the good way.', 'probing', { integrity: 25, momentum: 10 }, 'Raw honesty electrifies final debate', ['final-truth']),
      c('attack', 'Turn it on your opponents', 'An attack. Effective. Forgettable by morning.', 'cynical', { momentum: 15, integrity: -10, party: 10 }, 'Fiery attack closes final debate'),
      c('vance', 'Point to what you and Vance built together', 'You just turned the scandal into a love story. America may never recover.', 'neutral', { affinity: 20, momentum: 10, party: -5 }, 'Senator cites rival in closing plea', ['final-vance']),
    ]],
    ['Final Polls', 'tv', D('practical'), 'Dead heat. Fifty-fifty. Whatever we do in the next seventy-two hours decides everything.'],
    ['Election Eve', 'street', N, 'The city hums with nervous energy. Volunteers knock on their last doors. Your phone buzzes once: “See you on the other side. — J.”'],
  ],
  [ // Ch.12 The Finale
    ['Election Night', 'ballroom', D('anxious'), 'Polls closed. The first precincts are in. I have never been this nervous in my life — and I once ran a campaign for a man who was literally arrested on stage.'],
    ['Osborne’s Last Call', 'backroom', O('stern'), 'Whatever the result, the party will need someone to blame or someone to crown. Either way, you will need me. Remember that.'],
    ['The Call', 'rooftop', V('vulnerable'), 'Whatever the numbers say, I need you to know something. You were never my enemy. You were the only person who ever made me want to be better.'],
    ['Victory Speech', 'ballroom', N, 'The networks call the race. The ballroom erupts. Before you walk on stage, you decide what this night will mean.', [
      c('together', 'Bring Vance on stage with you', 'Vance steps into the light beside you. The crowd roars — not for a party, but for something new.', 'confident', { affinity: 20, momentum: 10, integrity: 10 }, 'Rivals share the stage on election night', ['ending-together']),
      c('alone', 'Give the speech alone', 'You stand alone at the podium. Composed, powerful — and somehow lonely.', 'neutral', { party: 15, momentum: 10, affinity: -10 }, 'Victor stands alone at the podium', ['ending-alone']),
      c('reform', 'Announce a cross-party reform pact', 'The reform pact echoes through the hall. Even your rivals are applauding.', 'confident', { integrity: 20, party: -10, momentum: 10 }, 'Reform pact unveiled on election night', ['ending-reform']),
    ]],
    ['Morning After', 'capitol', I('neutral'), 'I have covered this town for twenty years. I have never written a story like yours. For what it is worth, Senator — it was the truth that won.'],
    ['Across the Aisle', 'senate', V('confident'), 'New term, same chamber, same aisle. Except now, when I look across it, I see a future. Shall we get to work?'],
  ],
];

export const ENEMY_ACROSS_THE_AISLE_ACTS = ['The Beginning', 'Rising Tensions', 'The Crisis', 'The Final Battle'] as const;
export const ENEMY_ACROSS_THE_AISLE_CHAPTERS = ['Introduction', 'Building Connections', 'The First Conflict', 'Political Pressure', 'Hidden Motives', 'The Turning Point', 'Consequences', 'Betrayal and Sacrifice', 'The Breaking Point', 'Final Preparations', 'The Last Decision', 'The Finale'] as const;

const sceneId = (ch: number, n: number) => `act${Math.ceil(ch / 3)}_ch${ch}_sc${n}`;

export const ENEMY_ACROSS_THE_AISLE_SCENES: StoryScene[] = CHAPTERS.flatMap((beats, ci) => beats.map(([title, backdrop, speaker, dialogue, choices], si): StoryScene => {
  const chapter = ci + 1, n = si + 1;
  const next = n < 6 ? sceneId(chapter, n + 1) : chapter < 12 ? sceneId(chapter + 1, 1) : undefined;
  const id = sceneId(chapter, n);
  return { id, act: Math.ceil(chapter / 3), chapter, sceneNumber: n, title, backdrop, speaker, dialogue, ...(choices ? { choices } : {}), ...(next ? { nextSceneId: next } : {}), ...(ENEMY_ACT1_SCREENPLAY[id] ?? {}) };
}));


/** Derived end-of-story signals from final meters and flags (pure). */
export function enemyStorySignals({ meters, flags }: StageEndingContext) {
  const has = (f: string) => flags.includes(f);
  const m = (k: string) => meters[k] ?? 50;
  const withdrawn = has('offered-resignation');
  const electionWon = !withdrawn && m('momentum') >= 50;
  const sabotage = ['attacked-vance', 'leaked-broadband', 'attacked-family', 'testified-vance', 'released-file', 'asked-vance-resign'].filter(has).length;
  return {
    affinity: m('affinity'), party: m('party'), integrity: m('integrity'), momentum: m('momentum'),
    electionWon, withdrawn,
    corruptionExposed: has('exposed-osborne') || has('exposed-records') || has('testified-osborne'),
    backroomBargain: has('osborne-deal'),
    mutualSabotage: sabotage >= 2,
    parted: has('romance-ended') || has('ending-alone'),
  };
}
const sig = enemyStorySignals;

/** Seven branching endings, most specific first; the Political Divorce is the balanced fallback. */
export const ENEMY_ACROSS_THE_AISLE_ENDINGS: StageEnding[] = [
  { id: 'unbroken-reformer', number: 5, title: 'The Unbroken Reformer', backdrop: 'court',
    headline: 'OSBORNE MACHINE FALLS — REFORMER LEFT STANDING',
    narrative: 'You dragged the party’s secrets into daylight and refused every shortcut. The machine collapsed, and a chastened Capitol finally learned what an honest senator looks like.',
    hint: 'Hint: Expose the rot — and never let your integrity slip.',
    relationship: 'Vance respects you more than anyone in the building; whatever you are now, it was built on the truth.',
    legacy: 'Remembered as the senator who broke the Osborne machine and rewrote ethics law.',
    when: c => { const x = sig(c); return x.integrity >= 80 && x.corruptionExposed; } },
  { id: 'impeached-puppet', number: 6, title: 'The Impeached Puppet', backdrop: 'backroom',
    headline: 'BACKROOM DEAL UNRAVELS — VICTOR FACES IMPEACHMENT',
    narrative: 'Osborne bought you the election, and Osborne’s ledger bought your downfall. Within a year the deal surfaced and the chamber you won turned against you.',
    hint: 'Hint: Win at any price — and let someone else hold your strings.',
    relationship: 'Vance leads the inquiry against you, quietly, without joy.',
    legacy: 'Won the seat, lost the office: impeached for the bargain that made you.',
    when: c => { const x = sig(c); return x.integrity < 35 && x.backroomBargain && x.electionWon; } },
  { id: 'scorched-earth', number: 4, title: 'Scorched Earth & Mutual Ruin', backdrop: 'street',
    headline: 'RIVALS DESTROY EACH OTHER IN NASTIEST RACE EVER',
    narrative: 'Every leak was answered with a leak, every wound with a deeper one. By election night neither of you had a reputation left to defend.',
    hint: 'Hint: Sabotage your rival again and again — and sacrifice your own honor to do it.',
    relationship: 'You and Vance never speak again. Both careers end in the same ashes.',
    legacy: 'A cautionary chapter in civics textbooks about what politics can become.',
    when: c => { const x = sig(c); return x.affinity < 35 && x.integrity < 35 && x.mutualSabotage; } },
  { id: 'bipartisan-dynasty', number: 1, title: 'Bipartisan Dynasty', backdrop: 'ballroom',
    headline: 'LOVE ACROSS THE AISLE: RIVALS UNITE TO RESHAPE WASHINGTON',
    narrative: 'You won with your party behind you, your conscience intact and Vance at your side. Together you became the most powerful partnership the Capitol has ever known.',
    hint: 'Hint: Keep your heart, your party and your honor — all at once.',
    relationship: 'Partners in life and in power; Vance stands beside you at every swearing-in.',
    legacy: 'The founding pair of a new bipartisan era — and, whispers say, a dynasty.',
    when: c => { const x = sig(c); return x.affinity >= 70 && x.party >= 65 && x.integrity >= 65 && x.electionWon; } },
  { id: 'crown-without-heart', number: 2, title: 'Crown Without a Heart', backdrop: 'capitol',
    headline: 'PARTY’S CHAMPION SWEEPS TO VICTORY — ALONE',
    narrative: 'The party crowned you and the country followed. In the quiet of the new office, you sometimes wonder who you would have been if you had chosen differently.',
    hint: 'Hint: Prioritize political power above all personal loyalty.',
    relationship: 'Vance sends a formal congratulation note. Nothing more.',
    legacy: 'A formidable party leader with a record everyone respects — and few love.',
    when: c => { const x = sig(c); return x.affinity < 40 && x.party >= 65 && x.electionWon; } },
  { id: 'exiled-by-love', number: 3, title: 'Exiled by Love', backdrop: 'rooftop',
    headline: 'SENATOR’S CAREER ENDS — FOR LOVE OF A RIVAL',
    narrative: 'Your party cast you out and the voters followed. But on the rooftop where it all began, Vance is waiting — and it feels nothing like losing.',
    hint: 'Hint: Choose Vance over your party, even if it costs you the race.',
    relationship: 'Together, openly and for good, outside the Capitol walls.',
    legacy: 'An exile from politics whose love story the country never forgot.',
    when: c => { const x = sig(c); return x.affinity >= 70 && x.party < 40 && (!x.electionWon || x.withdrawn); } },
  { id: 'political-divorce', number: 7, title: 'The Political Divorce', backdrop: 'senate',
    headline: 'INCUMBENT HOLDS SEAT AS RIVALS GO SEPARATE WAYS',
    narrative: 'You kept your seat and your balance, but what you had with Vance did not survive the campaign. Two colleagues now nod politely across the aisle.',
    hint: 'Hint: Walk the middle road — and let the relationship go.',
    relationship: 'Parted ways. Cordial in committee, strangers everywhere else.',
    legacy: 'A steady, pragmatic senator who survived the storm intact.',
    when: () => true },
];

export const ENEMY_ACROSS_THE_AISLE_SCRIPT: SceneScript = {
  endings: ENEMY_ACROSS_THE_AISLE_ENDINGS,
  meters: [
    { id: 'affinity', label: 'Vance Affinity', icon: '❤️', min: 0, max: 100, value: 50 },
    { id: 'party', label: 'Party Standing', icon: '🏛️', min: 0, max: 100, value: 50 },
    { id: 'integrity', label: 'Public Integrity', icon: '⚖️', min: 0, max: 100, value: 50 },
    { id: 'momentum', label: 'Electoral Momentum', icon: '📊', min: 0, max: 100, value: 50 },
  ],
  chapterTitles: Object.fromEntries(ENEMY_ACROSS_THE_AISLE_CHAPTERS.map((t, i) => [`${Math.ceil((i + 1) / 3)}-${i + 1}`, t])),
  objectives: {
    1: 'Survive your first week in the Senate without losing your party — or your nerve around Vance.',
    2: 'Build allies on the Energy Committee while Osborne watches your every move.',
    3: 'Win the televised debate without losing yourself.',
    4: 'Survive the primary threat Osborne is holding over you.',
    5: 'Uncover what Osborne is hiding — and who else is involved.',
    6: 'Decide where you and Vance truly stand.',
    7: 'Keep your seat as the scandal breaks.',
    8: 'Choose what — and who — you are willing to sacrifice.',
    9: 'Break Osborne’s grip before he breaks you.',
    10: 'Build a campaign that can win without the machine.',
    11: 'Weather the October surprise and win the final debate.',
    12: 'Win election night — and decide what victory means.',
  },
  firstSceneId: 'act1_ch1_sc1',
  scenes: ENEMY_ACROSS_THE_AISLE_SCENES,
};
