/** Civil War campaign foundation (Sub-Phases 1A–1B): faction selection + secession winter to Fort Sumter. Pure data. */
import type { SceneScript, StoryScene, StorySceneChoice } from '../story-engine';

export const CIVIL_WAR_ID = 'civil-war-alternate-destiny';
export type CivilWarFaction = 'union' | 'confederacy';

type Sp = StoryScene['speaker'];
const sp = (name: string, role: string, portraitKey?: string) => (expression = 'neutral'): Sp => ({ name, role, ...(portraitKey ? { portraitKey } : {}), expression });
const N = (role: string): Sp => ({ name: 'Narrator', role });
const c = (id: string, label: string, reactionText: string, effects: Record<string, number>, headline: string, flagSets?: string[], nextSceneId?: string): StorySceneChoice =>
  ({ id, label, reactionText, reactionExpression: 'neutral', effects, headline, ...(flagSets ? { flagSets } : {}), ...(nextSceneId ? { nextSceneId } : {}) });
const meter = (id: string, label: string, icon: string, value: number) => ({ id, label, icon, min: 0, max: 100, value });

const Seward = sp('William Seward', 'Senator, New York', 'cw-seward');
const Toombs = sp('Robert Toombs', 'Senator, Georgia', 'cw-toombs');
const Chase = sp('Salmon Chase', 'Governor, Ohio', 'cw-chase');
const Anderson = sp('Major Robert Anderson', 'Commander, Fort Sumter', 'cw-anderson');
const Davis = sp('Jefferson Davis', 'Provisional President', 'cw-davis');
const Memminger = sp('Christopher Memminger', 'Treasury Secretary', 'cw-memminger');
const Lincoln = sp('Abraham Lincoln', 'President', 'cw-lincoln');
const Scott = sp('Winfield Scott', 'General-in-Chief', 'cw-scott');
const Welles = sp('Gideon Welles', 'Secretary of the Navy', 'cw-welles');
const Mallory = sp('Stephen Mallory', 'Secretary of the Navy', 'cw-mallory');
const Beauregard = sp('P. G. T. Beauregard', 'Brigadier General, Charleston', 'cw-beauregard');
const scene2 = (id: string, n: number, title: string, backdrop: string, speaker: Sp, dialogue: string, extra: Partial<StoryScene> = {}): StoryScene =>
  ({ id, act: 1, chapter: 2, sceneNumber: n, title, backdrop, speaker, dialogue, ...extra });
const scene = (id: string, n: number, title: string, backdrop: string, speaker: Sp, dialogue: string, extra: Partial<StoryScene> = {}): StoryScene =>
  ({ id, act: 1, chapter: 1, sceneNumber: n, title, backdrop, speaker, dialogue, ...extra });

/** Read the chosen side from a session's flags. */
export const civilWarFaction = (flags: readonly string[]): CivilWarFaction | null =>
  flags.includes('faction-union') ? 'union' : flags.includes('faction-confederacy') ? 'confederacy' : null;

export const CIVIL_WAR_SCRIPT: SceneScript = {
  meters: [meter('warEnthusiasm', 'War Enthusiasm', '🥁', 40), meter('treasury', 'Treasury', '💰', 50), meter('europeanFavor', 'European Favor', '🌍', 30), meter('borderLoyalty', 'Border State Loyalty', '⚖️', 50)],
  chapterTitles: { '1-1': 'November 1860 – April 1861: The Secession Winter', '1-2': 'Summer 1861: The War Begins' },
  objectives: { 1: 'Choose your side and steer the nation through the secession winter.' },
  characters: [{ name: 'Abraham Lincoln', role: 'President' }, { name: 'William Seward', role: 'Senator, New York' }, { name: 'Robert Toombs', role: 'Senator, Georgia' }, { name: 'Salmon Chase', role: 'Governor, Ohio' }, { name: 'Major Robert Anderson', role: 'Commander, Fort Sumter' }, { name: 'Jefferson Davis', role: 'Provisional President' }, { name: 'Christopher Memminger', role: 'Treasury Secretary' }, { name: 'P. G. T. Beauregard', role: 'Brigadier General, Charleston' }],
  theme: 'civilwar',
  firstSceneId: 'cw_choose',
  scenes: [
    scene('cw_choose', 1, 'A House Divided', 'cw-war-council', N('November 1860'), 'Abraham Lincoln has won the presidency without a single Southern electoral vote. South Carolina threatens to leave the Union. Whose story will you lead?', {
      setting: { time: 'November 1860', location: 'Washington City', weatherOrMood: 'Cold, uneasy' },
      choices: [
        c('union', 'Abraham Lincoln — Union', 'Springfield, Illinois. The telegraph will not stop clicking.', { borderLoyalty: 5 }, 'Lincoln elected; South weighs secession', ['faction-union'], 'cw_u_1'),
        c('confederacy', 'Southern Leadership — Confederacy', 'Milledgeville, Georgia. The legislature is waiting for you to speak.', { warEnthusiasm: 10 }, 'Southern leaders gather as secession fever spreads', ['faction-confederacy'], 'cw_c_1'),
      ],
    }),
    scene('cw_u_1', 2, 'President-Elect', 'cw-springfield', Seward('anxious'), 'Mr. Lincoln, the South is already drafting ordinances. Say something soothing, or say nothing at all — but the country is listening.', {
      choices: [
        c('reassure', 'Promise not to touch slavery where it exists', 'It may calm Kentucky. It will not calm Charleston.', { borderLoyalty: 10, warEnthusiasm: -5 }, 'Lincoln vows restraint toward the South'),
        c('silent', 'Stay silent until inauguration', 'Silence is a policy too. Let us hope it is the right one.', { treasury: 5 }, 'President-elect keeps his counsel'),
        c('firm', 'Declare the Union perpetual', 'Bold. The North will cheer. The border will tremble.', { warEnthusiasm: 10, borderLoyalty: -10 }, '“The Union is perpetual,” Lincoln declares'),
      ],
      nextSceneId: 'cw_u_2',
    }),
    scene('cw_u_2', 3, 'South Carolina Leaves', 'cw-springfield', N('December 20, 1860'), 'In Charleston, delegates vote 169 to 0 to dissolve their bond with the Union. Bells ring. In Springfield, you read the telegram twice.', { nextSceneId: 'cw_u_3' }),
    scene('cw_u_3', 4, 'A Team of Rivals', 'cw-springfield', Chase('confident'), 'Your cabinet will decide whether the party holds together. Seward wants conciliation; I want a firm hand. Whom will you trust with the government?', {
      setting: { time: 'January 1861', location: 'Springfield, Illinois', weatherOrMood: 'Snow on the prairie' },
      choices: [
        c('rivals', 'Appoint both rivals to the cabinet', 'Keep your enemies inside the tent. They will quarrel, but they will not plot.', { borderLoyalty: 5, warEnthusiasm: 5 }, 'Lincoln names rivals Seward and Chase to cabinet', ['cabinet-rivals']),
        c('seward', 'Lean on Seward and the moderates', 'The border will breathe easier. The radicals will grumble.', { borderLoyalty: 10, warEnthusiasm: -5 }, 'Moderates dominate Lincoln cabinet'),
        c('radicals', 'Lean on Chase and the radicals', 'The North wants steel. You are giving it to them.', { warEnthusiasm: 10, borderLoyalty: -10 }, 'Radical Republicans gain cabinet power'),
      ],
      nextSceneId: 'cw_u_4',
    }),
    scene('cw_u_4', 5, 'The Crittenden Compromise', 'senate', Seward('anxious'), 'Senator Crittenden proposes restoring the Missouri line forever. Slavery would be allowed south of it in every new territory. Accept it, and some states may come back. Refuse, and the party keeps its word.', {
      setting: { time: 'February 1861', location: 'Washington City', weatherOrMood: 'Tense' },
      choices: [
        c('reject', 'Hold firm: no slavery in the territories', 'You kept faith with the voters who elected you. The South will call it a declaration of war.', { warEnthusiasm: 10, borderLoyalty: -5 }, 'Lincoln rejects Crittenden plan', ['crittenden-rejected']),
        c('amend', 'Offer a smaller deal: protect slavery only where it exists', 'A narrow door, but a door. Virginia may stay a while longer.', { borderLoyalty: 10, europeanFavor: 5 }, 'Lincoln backs limited amendment to calm border'),
        c('accept', 'Accept the compromise to save the Union', 'The border cheers. Your own party feels betrayed.', { borderLoyalty: 15, warEnthusiasm: -15 }, 'Lincoln endorses Crittenden compromise', ['crittenden-accepted']),
      ],
      nextSceneId: 'cw_u_5',
    }),
    scene('cw_u_5', 6, 'The Inaugural Address', 'cw-inauguration', Lincoln('neutral'), 'The Capitol dome stands unfinished behind me. Soldiers watch from the rooftops. Thirty thousand people are waiting. What shall I tell them?', {
      choices: [
        c('friends', '“We are not enemies, but friends”', 'Even some Southern papers print it in full.', { borderLoyalty: 10, europeanFavor: 5 }, '“We must not be enemies,” new President pleads'),
        c('law', 'Promise to enforce federal law in every state', 'The North stands taller. Richmond takes note.', { warEnthusiasm: 10, borderLoyalty: -5 }, 'Lincoln vows to hold federal property'),
        c('tariff', 'Focus on the economy and the tariff', 'Bankers in New York are pleased. Few others are.', { treasury: 10, warEnthusiasm: -5 }, 'Inaugural stresses tariffs and trade'),
      ],
      nextSceneId: 'cw_u_6',
    }),
    scene('cw_u_6', 7, 'Fort Sumter', 'cw-fort-sumter', Anderson('anxious'), 'Mr. President, my garrison has bread for six weeks. Charleston has ringed this fort with guns. Send food, send ships, or send orders to leave.', {
      setting: { time: 'April 1861', location: 'Charleston Harbor', weatherOrMood: 'Calm before the storm' },
      choices: [
        c('bread', 'Send food only, and tell the South first', 'If they fire on bread, the world will know who fired first.', { warEnthusiasm: 15, europeanFavor: 10 }, 'Lincoln sends provisions to Sumter', ['sumter-resupply']),
        c('fleet', 'Send warships to reinforce the fort', 'Strength may deter them. Or it may give them their excuse.', { warEnthusiasm: 10, borderLoyalty: -10, treasury: -10 }, 'Union fleet sails for Charleston', ['sumter-reinforce']),
        c('evacuate', 'Withdraw the garrison to avoid war', 'Peace for a season. The North calls it surrender.', { borderLoyalty: 10, warEnthusiasm: -20 }, 'Federal troops abandon Fort Sumter', ['sumter-evacuated']),
      ],
      nextSceneId: 'cw_u_7',
    }),
    scene2('cw_u_7', 1, 'Who Will Lead the Army?', 'cw-war-council', Scott('anxious'), 'Mr. President, I am too old to take the field. You need a commander for the Army of the Potomac. Choose carefully — the whole North is watching.', {
      setting: { time: 'May 1861', location: 'The War Department', weatherOrMood: 'Drums in the street' },
      choices: [
        c('mcdowell', 'Give the army to Irvin McDowell', 'A steady officer. He says the men are not ready. You may not give him time.', { warEnthusiasm: 5 }, 'McDowell to command Union army', ['gen-mcdowell']),
        c('mcclellan', 'Bring in young George McClellan', 'Brilliant at drill. Slow to fight. The soldiers love him.', { warEnthusiasm: 10, treasury: -5 }, 'McClellan named to lead the East', ['gen-mcclellan']),
        c('lee', 'Offer the command to Robert E. Lee', 'If he says yes, Virginia loses its best soldier.', { borderLoyalty: 5 }, 'Lincoln offers Lee field command', ['gen-lee-offer']),
      ],
      nextSceneId: 'cw_u_8',
    }),
    scene2('cw_u_8', 2, 'The Anaconda Plan', 'cw-naval', Welles('confident'), 'General Scott proposes we squeeze the South like a snake: close every port, take the Mississippi, starve their trade. It will cost ships we do not yet have.', {
      choices: [
        c('blockade', 'Declare a full naval blockade', 'Three thousand miles of coast. We will need every ship we can buy.', { treasury: -15, europeanFavor: -5, warEnthusiasm: 5 }, 'Lincoln proclaims blockade of Southern ports', ['blockade-full']),
        c('river', 'Focus on taking the Mississippi', 'Split the South in two. The West will cheer.', { treasury: -10, borderLoyalty: 5 }, 'Union eyes the Mississippi River', ['west-river']),
        c('none', 'Skip the blockade — win quickly on land', 'Europe is relieved. Your admirals are not.', { europeanFavor: 10, warEnthusiasm: 5 }, 'No blockade: Lincoln bets on a quick war'),
      ],
      nextSceneId: 'cw_u_9',
    }),
    scene2('cw_u_9', 3, 'On to Richmond!', 'cw-battlefield', N('July 1861'), 'Newspapers shout "On to Richmond!" The army is green, but the ninety-day volunteers will soon go home. Rebel troops gather at Manassas Junction.', {
      choices: [
        c('attack', 'Attack at Bull Run now', 'Picnickers ride out from Washington to watch. It will not be the show they expect.', { warEnthusiasm: -10, treasury: -5 }, 'Union army routed at Bull Run', ['east-defeat']),
        c('drill', 'Wait and train the army first', 'The papers call you timid. The army grows stronger.', { warEnthusiasm: -5, treasury: -5 }, 'Lincoln delays Virginia offensive', ['east-hold']),
        c('defend', 'Fortify Washington and stay on defense', 'The capital is safe. The war will be long.', { borderLoyalty: 5, warEnthusiasm: -5 }, 'Ring of forts rises around Washington', ['east-hold']),
      ],
      nextSceneId: 'cw_u_10',
    }),
    scene2('cw_u_10', 4, 'The Western Rivers', 'senate', N('Autumn 1861'), 'Kentucky says it is neutral. Both armies want it. An unknown officer named Ulysses Grant asks for permission to move on Paducah.', {
      choices: [
        c('grant', 'Let Grant move into Kentucky', 'He moves fast and quietly. The rivers open to the Union.', { borderLoyalty: 5, warEnthusiasm: 5 }, 'Grant seizes Paducah', ['west-advance']),
        c('respect', 'Respect Kentucky neutrality', 'Kentucky thanks you. The South may not be so polite.', { borderLoyalty: 15 }, 'Lincoln honors Kentucky neutrality', ['west-hold']),
        c('missouri', 'Send troops to secure Missouri first', 'St. Louis stays loyal. The fighting there turns bitter.', { borderLoyalty: 5, treasury: -5 }, 'Union troops hold Missouri', ['west-hold']),
      ],
      nextSceneId: 'cw_end',
    }),
    scene('cw_c_1', 2, 'The Secession Question', 'senate', Toombs('confident'), 'The Black Republican has won. Georgia must decide: leave now with South Carolina, or wait and bargain. The people want an answer from you.', {
      choices: [
        c('secede', 'Call for immediate secession', 'Then we ride for Montgomery by February.', { warEnthusiasm: 15, borderLoyalty: -10 }, 'Southern leader demands immediate secession'),
        c('cooperate', 'Wait for the other states to act together', 'Prudent. Prudence may not survive the winter.', { borderLoyalty: 10, warEnthusiasm: -5 }, 'Calls for a united Southern front'),
        c('europe', 'Court British cotton buyers first', 'King Cotton will speak for us in London.', { europeanFavor: 10, treasury: 5 }, 'Cotton envoys sail for Liverpool'),
      ],
      nextSceneId: 'cw_c_2',
    }),
    scene('cw_c_2', 3, 'Road to Montgomery', 'cw-montgomery', N('February 1861'), 'Six states have left. Delegates gather in Montgomery, Alabama, to form a new government. Every eye in the hall turns to you.', {
      choices: [
        c('davis', 'Back Jefferson Davis for president', 'A soldier and a senator. The convention approves him quickly.', { warEnthusiasm: 5, europeanFavor: 5 }, 'Davis chosen to lead Confederacy', ['davis-president']),
        c('self', 'Put your own name forward', 'The hall argues for two days. You lose, but they will remember you.', { warEnthusiasm: 10, borderLoyalty: -5 }, 'Rival bid splits Montgomery convention'),
        c('constitution', 'Focus on writing the new constitution', 'Your words will last longer than any office.', { borderLoyalty: 5, treasury: 5 }, 'Confederate constitution adopted'),
      ],
      nextSceneId: 'cw_c_3',
    }),
    scene('cw_c_3', 4, 'Paying for Independence', 'cw-montgomery', Memminger('anxious'), 'We have a government and no money. The banks are nervous. I can print notes, sell bonds, or hold back cotton until Europe begs for it.', {
      setting: { time: 'March 1861', location: 'Montgomery, Alabama', weatherOrMood: 'Busy and hopeful' },
      choices: [
        c('bonds', 'Sell bonds backed by cotton', 'Planters pledge their crops. It is slow, but it is real money.', { treasury: 15 }, 'Confederacy issues $15 million loan'),
        c('print', 'Print paper money', 'Fast money today. Rising prices tomorrow.', { treasury: 10, warEnthusiasm: 5, europeanFavor: -5 }, 'Confederate notes flood Southern markets', ['printed-money']),
        c('embargo', 'Hold back cotton to pressure Europe', 'Let the mills of Manchester go quiet. London will come to us.', { europeanFavor: -10, warEnthusiasm: 10 }, 'South withholds cotton from Europe', ['cotton-embargo']),
      ],
      nextSceneId: 'cw_c_4',
    }),
    scene('cw_c_4', 5, 'The Federal Forts', 'senate', Davis('confident'), 'Fort Pickens in Florida and Fort Sumter in Charleston still fly the old flag. A nation cannot have foreign soldiers in its harbors. What do we demand?', {
      choices: [
        c('envoys', 'Send peace envoys to Washington', 'Seward will not see them. But Europe will see that you tried.', { europeanFavor: 10, borderLoyalty: 5 }, 'Confederate commissioners seek peaceful terms'),
        c('ultimatum', 'Demand the forts be handed over', 'Now Lincoln must choose. That is exactly what we want.', { warEnthusiasm: 10, borderLoyalty: -5 }, 'South demands surrender of federal forts'),
        c('siege', 'Cut off supplies to the forts', 'Hunger is quieter than cannon. Anderson will feel it.', { warEnthusiasm: 5, treasury: -5 }, 'Charleston blockades Fort Sumter'),
      ],
      nextSceneId: 'cw_c_5',
    }),
    scene('cw_c_5', 6, 'The First Shot', 'cw-fort-sumter', Beauregard('confident'), 'A Union ship is on its way with supplies. My guns are ready. Anderson was my teacher at West Point. Give the word, and we fire before it arrives.', {
      setting: { time: 'April 12, 1861', location: 'Charleston Harbor', weatherOrMood: 'Dark, before dawn' },
      choices: [
        c('fire', 'Open fire on Fort Sumter', 'The shells arc over the harbor. There is no going back now.', { warEnthusiasm: 20, borderLoyalty: -15, europeanFavor: -5 }, 'Confederate guns fire on Fort Sumter', ['fired-first']),
        c('wait', 'Wait for the fort to starve', 'Patience. Let Lincoln be the one to break the peace.', { europeanFavor: 10, borderLoyalty: 10, warEnthusiasm: -10 }, 'South holds fire as Sumter starves'),
        c('terms', 'Offer Anderson an honorable exit', 'He may take it. He may not. Either way, the world sees mercy.', { europeanFavor: 5, borderLoyalty: 5 }, 'Beauregard offers Anderson safe passage'),
      ],
      nextSceneId: 'cw_c_6',
    }),
    scene2('cw_c_6', 1, 'Generals for a New Nation', 'cw-war-council', Davis('confident'), 'Virginia has joined us and Richmond is our capital now. Robert E. Lee has resigned from the old army. Who should lead our men in the field?', {
      setting: { time: 'May 1861', location: 'Richmond, Virginia', weatherOrMood: 'Proud and restless' },
      choices: [
        c('lee', 'Make Robert E. Lee your top general', 'Quiet, careful, and fearless. The men will follow him anywhere.', { warEnthusiasm: 10, borderLoyalty: 5 }, 'Lee takes command in Virginia', ['gen-lee']),
        c('johnston', 'Trust Joseph E. Johnston', 'A careful defender. He will not waste lives — or take risks.', { warEnthusiasm: 5, treasury: 5 }, 'Johnston leads Confederate army', ['gen-johnston']),
        c('beauregard', 'Keep the hero of Sumter, Beauregard', 'The crowds adore him. Davis does not.', { warEnthusiasm: 10, europeanFavor: -5 }, 'Beauregard hailed as Southern champion', ['gen-beauregard']),
      ],
      nextSceneId: 'cw_c_7',
    }),
    scene2('cw_c_7', 2, 'Breaking the Blockade', 'cw-naval', Mallory('anxious'), 'Yankee ships are closing our ports. We cannot build a navy as big as theirs. We can build something new — or slip past them in the dark.', {
      choices: [
        c('ironclad', 'Build an ironclad from the Merrimack', 'An iron ship no wooden fleet can sink. If it works.', { treasury: -15, warEnthusiasm: 10 }, 'South raises the iron ship Virginia', ['navy-ironclad']),
        c('runners', 'Pay fast ships to run the blockade', 'Rifles in, cotton out. Profitable, if risky.', { treasury: 10, europeanFavor: 5 }, 'Blockade runners slip into Wilmington', ['navy-runners']),
        c('raiders', 'Send raiders to attack Northern trade', 'Every merchant ship sunk makes New York angrier.', { warEnthusiasm: 5, europeanFavor: -5 }, 'Confederate raiders strike Union shipping', ['navy-raiders']),
      ],
      nextSceneId: 'cw_c_8',
    }),
    scene2('cw_c_8', 3, 'Manassas Junction', 'cw-battlefield', Beauregard('confident'), 'The Yankee army marches toward us along Bull Run Creek. They are as green as we are. Do we wait for them, or strike first?', {
      setting: { time: 'July 21, 1861', location: 'Manassas, Virginia', weatherOrMood: 'Hot and dusty' },
      choices: [
        c('hold', 'Hold the line and bring reinforcements by train', 'Jackson stands like a stone wall. The Yankees break and run.', { warEnthusiasm: 15, europeanFavor: 10 }, 'Confederate victory at Manassas', ['east-victory']),
        c('strike', 'Attack before they arrive', 'Brave, but the plan falls apart in the woods.', { warEnthusiasm: -5, treasury: -5 }, 'Bloody stalemate at Bull Run', ['east-hold']),
        c('pursue', 'Win, then chase them to Washington', 'Your men are exhausted. The chase stalls in the rain.', { warEnthusiasm: 10, treasury: -10 }, 'Rebels push toward the Potomac', ['east-victory']),
      ],
      nextSceneId: 'cw_c_9',
    }),
    scene2('cw_c_9', 4, 'The Kentucky Question', 'senate', N('Autumn 1861'), 'Kentucky says it is neutral. General Polk wants to seize Columbus on the Mississippi before the Yankees do.', {
      choices: [
        c('seize', 'Let Polk seize Columbus', 'The river fort is ours. Kentucky is furious.', { borderLoyalty: -15, warEnthusiasm: 5 }, 'Confederates enter Kentucky', ['west-advance']),
        c('respect', 'Respect Kentucky neutrality', 'Kentuckians remember who kept their word.', { borderLoyalty: 15 }, 'South honors Kentucky neutrality', ['west-hold']),
        c('forts', 'Build river forts in Tennessee instead', 'Forts Henry and Donelson rise on the rivers.', { treasury: -10, borderLoyalty: 5 }, 'South fortifies Tennessee rivers', ['west-hold']),
      ],
      nextSceneId: 'cw_end',
    }),
    scene2('cw_end', 5, 'The Winter Ahead', 'cw-battlefield', N('Spring 1861'), 'The first battles are over. Both sides now know this war will be long. Your story continues in the next chapter.'),
  ],
  endings: [
    { id: 'cw-union-victory', number: 1, title: 'The Union Preserved', headline: 'Rebellion collapses; the Union stands', narrative: 'Your blockade and river campaigns slowly choke the South. By 1864 the Confederate armies are beaten and the states return to the Union. Epilogue: slavery is ended by constitutional amendment, and history remembers you as the President who held the nation together.', backdrop: 'cw-inauguration', hint: 'As Lincoln, keep War Enthusiasm and Border Loyalty high and press the war in the West or at sea.', relationship: 'Seward calls you the savior of the Union.', legacy: 'The President who preserved the Union.', when: ({ flags, meters }) => flags.includes('faction-union') && (meters['warEnthusiasm'] ?? 40) >= 55 && (meters['borderLoyalty'] ?? 50) >= 50 && (flags.includes('west-advance') || flags.includes('blockade-full')) },
    { id: 'cw-union-armistice', number: 2, title: 'An Uneasy Peace', headline: 'Washington signs armistice with the South', narrative: 'The North grows tired of war. Peace commissioners meet in Canada and agree to stop the fighting. Epilogue: two nations share one continent, and the border between them stays armed for a generation.', backdrop: 'senate', hint: 'As Lincoln, let War Enthusiasm fall or give ground early.', relationship: 'Your cabinet is bitterly divided.', legacy: 'The President who chose peace over victory.', when: ({ flags, meters }) => flags.includes('faction-union') && ((meters['warEnthusiasm'] ?? 40) < 35 || flags.includes('sumter-evacuated') || flags.includes('crittenden-accepted')) },
    { id: 'cw-union-long-war', number: 3, title: 'The Long War', headline: 'War drags on into its fourth year', narrative: 'Neither side breaks. The armies bleed each other through Virginia and Tennessee. Epilogue: the Union wins at last, but only after years of losses, and your name is tied to the war\'s terrible cost.', backdrop: 'cw-battlefield', hint: 'As Lincoln, finish the campaign without a clear edge.', relationship: 'Stanton and Seward argue every day.', legacy: 'A wartime President in an endless war.', when: ({ flags }) => flags.includes('faction-union') },
    { id: 'cw-south-independence', number: 4, title: 'Southern Independence', headline: 'Britain recognizes the Confederate States', narrative: 'Your victory at Manassas and your friends in London change everything. Britain and France recognize the Confederacy, and Washington is forced to accept a separate South. Epilogue: you are a founding father of a new nation, with all the troubles that come with it.', backdrop: 'cw-montgomery', hint: 'As the South, win in the East and keep European Favor high.', relationship: 'Davis owes you his nation.', legacy: 'A founder of the Confederate States.', when: ({ flags, meters }) => flags.includes('faction-confederacy') && flags.includes('east-victory') && (meters['europeanFavor'] ?? 30) >= 45 && (meters['warEnthusiasm'] ?? 40) >= 50 },
    { id: 'cw-south-armistice', number: 5, title: 'A Negotiated Armistice', headline: 'North and South agree to stop the war', narrative: 'With neither side able to win, envoys meet and sign an armistice. Epilogue: the border states vote on their own future, and the continent lives with an uneasy peace.', backdrop: 'senate', hint: 'As the South, keep Border Loyalty or European Favor high without a decisive win.', relationship: 'Toombs calls it a betrayal; others call it wisdom.', legacy: 'The leader who made peace.', when: ({ flags, meters }) => flags.includes('faction-confederacy') && ((meters['borderLoyalty'] ?? 50) >= 60 || (meters['europeanFavor'] ?? 30) >= 45) },
    { id: 'cw-south-defeat', number: 6, title: 'The Lost Cause', headline: 'Confederate armies surrender', narrative: 'The blockade tightens and the Western rivers fall. Your armies fight bravely but cannot win alone. Epilogue: the Confederacy surrenders, slavery ends, and the South begins the long road of Reconstruction.', backdrop: 'cw-battlefield', hint: 'The South falls without Europe or a decisive victory.', relationship: 'Toombs rides beside you to the end.', legacy: 'A leader of a lost cause.', when: () => true },
  ],
};
