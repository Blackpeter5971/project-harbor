import { openSave } from './save-integrity';
import { rewardsSchema } from './rewards-schema';
import { BASE_TURN_ENERGY, MAX_ENERGY } from './energy-costs';
import { financeSchema } from './finance-schema';
import { socialMediaSchema } from './social-media';
import { networkSchema } from './network-schema';
import { appointmentCareerSchema } from './appointment-schema';
import { supportGroupsSchema, baselineSupportGroups } from './support-groups';
import { rollStartingScenario } from './character';
import { z } from 'zod';
import { termEndDate } from './terms';
import { startingHousing } from './housing';
import { DEFAULT_HEALTH, defaultLife, ensureLife } from './life';
import { startingVehicles } from './vehicles';
import { startingSocial } from './relationships';
import { publicProjectSchema } from './public-project-schema';
import { businessSchema, normalizeBusiness } from './business-schema';
import { crisisSchema, crisisGenerationSchema } from './crisis-schema';
import { scandalSchema } from './scandal-schema';
import { corruptionSchema } from './corruption-schema';
import { legalSchema } from './legal-schema';
import { debateSchema } from './debate-schema';
import { townHallSchema } from './town-hall-schema';
import { bankingSchema } from './banking-schema';
import { crimeSchema } from './crime-schema';
import { directorSchema, normalizeCampaignStaff } from './campaign-staff-schema';
import { executiveDocketSchema, initializeDocket } from './docket-schema';
import { legislatureSchema } from './legislature-schema';
import { impeachmentSchema } from './impeachment-schema';
import { dynastySchema } from './dynasty-schema';
import { legacySchema, medicalSchema } from './legacy-schema';
import { storyStateSchema, createStoryState } from './story-mode';
import { seedStoryState } from './story-engine';
import { encounterSceneSchema } from './encounter-schema';

export const states = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'] as const;
export const backgrounds = [
  { id: 'Nobody', difficulty: 'Very hard', description: 'No money, no network. The hardest climb — every gain is earned.', icon: 'footprints' },
  { id: 'Working-Class Family', difficulty: 'Hard', description: 'Modest savings and community roots. A tough but grounded start.', icon: 'hammer' },
  { id: 'Wealthy Family', difficulty: 'Easy', description: 'A solid cushion and well-placed friends. Early campaigns come easier.', icon: 'coins' },
  { id: 'Political Dynasty', difficulty: 'Very easy', description: 'A famous name, deep pockets and a ready network. The easiest start.', icon: 'landmark' },
  { id: 'Self-Made', difficulty: 'Normal', description: 'Your own savings and a name for ambition. A balanced challenge.', icon: 'briefcase' },
] as const;
export type BackgroundId = typeof backgrounds[number]['id'];
export type BackgroundKey = 'nobody' | 'working-class' | 'self-made' | 'wealthy' | 'dynasty';
export const BACKGROUND_KEY: Record<BackgroundId, BackgroundKey> = { 'Nobody': 'nobody', 'Working-Class Family': 'working-class', 'Self-Made': 'self-made', 'Wealthy Family': 'wealthy', 'Political Dynasty': 'dynasty' };
/** Adjustable starting balance matrix. Applied once, only in createCareer. */
export const BACKGROUND_CONFIG: Record<BackgroundKey, { cash: number; reputation: number; experience: number; difficulty: 'Very Hard' | 'Hard' | 'Normal' | 'Easy' | 'Very Easy'; connections: number }> = {
  'nobody': { cash: 0, reputation: 0, experience: 0, difficulty: 'Very Hard', connections: 0 },
  'working-class': { cash: 10_000, reputation: 5, experience: 0, difficulty: 'Hard', connections: 1 },
  'self-made': { cash: 20_000, reputation: 10, experience: 5, difficulty: 'Normal', connections: 2 },
  'wealthy': { cash: 50_000, reputation: 20, experience: 5, difficulty: 'Easy', connections: 4 },
  'dynasty': { cash: 100_000, reputation: 40, experience: 20, difficulty: 'Very Easy', connections: 8 },
};
export const backgroundConfig = (id: BackgroundId) => BACKGROUND_CONFIG[BACKGROUND_KEY[id]];
export const parties = ['Democrat','Republican','Independent'] as const;
export type Party = typeof parties[number];
export const education = ['High School Graduate','Political Science','Law','Business','Military','None',"Bachelor's Degree",'Advanced Degree'] as const;
export const draftSchema = z.object({
  name: z.string().trim().min(1).max(32), state: z.enum(states), sex: z.enum(['Male','Female']),
  portrait: z.number().int().min(0).max(5), background: z.enum(['Nobody','Working-Class Family','Wealthy Family','Political Dynasty','Self-Made']),
  party: z.enum(parties), education: z.enum(education),
});
export type CharacterDraft = z.infer<typeof draftSchema>;
/** Saved characters from before gender was limited load as Male instead of failing. */
const savedCharacterSchema = draftSchema.extend({ sex: z.preprocess(v => v === 'Custom' ? 'Male' : v, z.enum(['Male','Female'])) });
export const defaultDraft: CharacterDraft = { name: '', state: 'California', sex: 'Male', portrait: 0, background: 'Working-Class Family', party: 'Independent', education: 'High School Graduate' };

export const ACTIONS_PER_MONTH = BASE_TURN_ENERGY;
const v1Schema = z.object({ version: z.literal(1), character: savedCharacterSchema, age: z.number(), date: z.string(), money: z.number(), reputation: z.number(), relationships: z.number(), publicOffice: z.boolean(), eligibleAppointment: z.boolean() });
const skillsSchema = z.object({ communication: z.number(), leadership: z.number(), knowledge: z.number() });
const applicationSchema = z.object({ jobId: z.string(), month: z.string(), status: z.enum(['pending','offered','rejected','declined']), reason: z.string().optional() });
const entrySchema = z.object({ month: z.string(), label: z.string(), amount: z.number() });
const eventSchema = z.object({ id: z.string(), title: z.string(), text: z.string(), parties: z.array(z.string()), tenure: z.string().optional(), cost: z.number().optional(), scene: encounterSceneSchema.optional(), choices: z.array(z.object({ id: z.string(), label: z.string(), hint: z.string(), disabled: z.boolean().optional() })) });
export const positions = ['none','captain','committee'] as const;
export type Position = typeof positions[number];
const storySchema = z.object({ h: z.string(), sub: z.string(), body: z.string(), tag: z.string(), subject: z.string().optional(), portrait: z.number().int().min(0).max(5).optional(), caption: z.string().optional(), priority: z.number().optional() });
const candSchema = z.object({ name: z.string(), portrait: z.number().int().min(0).max(5).optional(), party: z.enum(parties), bio: z.string(), policy: z.string(), trait: z.enum(['money','ground','media']), quality: z.number(), funds: z.number(), raised: z.number(), spent: z.number(), staff: z.number(), volunteers: z.number(), support: z.number(), momentum: z.number(), primary: z.boolean(), out: z.boolean() });
export const campaignSchema = z.object({
  office: z.string(), title: z.string(), jurisdiction: z.string(), party: z.enum(parties), electionDate: z.string(), primaryDate: z.string().nullable(), startDate: z.string(),
  phase: z.enum(['primary','general']), slogan: z.string(), strategy: z.enum(['grassroots','media','policy']), manager: z.string().nullable(),
  funds: z.number(), raised: z.number(), spent: z.number(), donors: z.number(), staff: z.number(), volunteers: z.number(), support: z.number(), momentum: z.number(),
  opponents: z.array(candSchema), polls: z.array(z.object({ date: z.string(), shares: z.record(z.string(), z.number()), crisisRecord: z.object({ score: z.number(), neglected: z.array(z.string()), talkingPoints: z.array(z.string()) }).optional() })),
  txns: z.array(entrySchema), endorsements: z.array(z.object({ group: z.string(), candidate: z.string() })), headlines: z.array(z.string()),
  attack: z.string().nullable(), allegation: z.object({ target: z.string(), text: z.string(), status: z.enum(['alleged','cleared','proven']), date: z.string() }).nullable(), turnActs: z.array(z.string()),
  lastProcessedEnd: z.string().default(''),
  directors: z.array(directorSchema).optional(),
  legacyAides: z.number().int().nonnegative().optional(),
  staffRevision: z.number().int().nonnegative().optional(),
  staffPayrollEnd: z.string().optional(),
  dinnerQuarter: z.string().optional(),
  /** Latest town-hall encounter and the quarters already used, so reloads cannot replay or farm rewards. */
  townHall: townHallSchema.nullable().optional(),
  townHallQuarters: z.array(z.string()).optional(),
  adRevision: z.number().int().nonnegative().optional(),
  lastAdQuarter: z.string().optional(),
  nameRecognition: z.number().min(0).max(100).optional(),
  independentAdPenalty: z.number().min(0).max(12).optional(),
  adScoreOffsets: z.record(z.string(), z.number().finite()).optional(),
  stateSwing: z.record(z.string(), z.number().finite()).optional(),
  lastAd: z.object({ date: z.string(), kind: z.enum(['positive', 'contrast', 'attack']), budget: z.enum(['local', 'standard', 'saturation']), audience: z.string(), rival: z.string().nullable(), cost: z.number(), support: z.number(), rivalDrop: z.number(), backlash: z.boolean(), response: z.boolean(), message: z.string() }).optional(),
  /** Phase 5: rival attack damage on the player's score, weak spots already leaked and the latest leak (feeds rival posts). */
  rivalPressure: z.object({ damage: z.number().finite().min(0).default(0), leaked: z.array(z.string()).default([]), lastLeak: z.object({ date: z.string(), rival: z.string(), spot: z.string(), charge: z.string() }).nullable().default(null) }).optional(),
});
const resultSchema = z.object({ crisisRecord: z.object({ score: z.number(), neglected: z.array(z.string()), talkingPoints: z.array(z.string()) }).optional(), office: z.string(), title: z.string(), jurisdiction: z.string(), date: z.string(), stage: z.enum(['primary','general','ballot']), won: z.boolean(),
  rows: z.array(z.object({ name: z.string(), party: z.enum(parties), votes: z.number(), pct: z.number(), poll: z.number() })), ec: z.array(z.object({ name: z.string(), ev: z.number() })).nullable(), statesWon: z.array(z.string()).default([]), stateCalls: z.array(z.object({ state: z.string(), name: z.string(), party: z.enum(parties), ev: z.number(), margin: z.number() })).optional(), raised: z.number(), spent: z.number(), effects: z.array(z.string()), transitionChoice: z.string().optional() });
const supportSchema = z.object({ outcome: z.enum(['pass', 'fail', 'amend', 'compromise', 'delay', 'party opposition']), score: z.number(), votes: z.number(), needed: z.number(), seats: z.number(), reasons: z.array(z.string()) });
const billSchema = z.object({ id: z.string(), tenure: z.string(), title: z.string(), kind: z.enum(['ordinance', 'bill', 'budget', 'services']), policy: z.enum(['services', 'business', 'environment', 'safety']), stage: z.enum(['proposed', 'under consideration', 'passed', 'rejected', 'awaiting approval']), date: z.string(), cost: z.number(), revision: z.number().default(0), boost: z.number().default(0), attempts: z.number().default(0), support: supportSchema.nullable().default(null), chamberVotes: z.array(z.object({ chamber: z.enum(['house', 'senate']), support: supportSchema })).default([]), history: z.array(z.object({ date: z.string(), text: z.string() })).default([]), budget: z.object({ spending: z.record(z.string(), z.number()), stance: z.enum(['cut', 'hold', 'raise']) }).nullable().default(null) });
const careerBaseSchema = z.object({
  version: z.literal(2), character: savedCharacterSchema, age: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-01$/),
  money: z.number(), reputation: z.number(), relationships: z.number(), publicOffice: z.boolean(), eligibleAppointment: z.boolean(),
  actions: z.number().int().min(0).max(MAX_ENERGY),
  /** Set once a save uses energy points in `actions`; absent on legacy 0–5 action saves. */
  energyModel: z.literal(1).optional(),
  freePoliticalActivityUsed: z.boolean().default(false),
  politicalActivityRevision: z.number().int().nonnegative().default(0),
  politicalActivityUses: z.record(z.string(), z.number().int().nonnegative()).default({}),
  experience: z.number(), skills: skillsSchema, contacts: z.number(),
  job: z.object({ id: z.string(), since: z.string(), payLevel: z.number().int().min(1).max(4).optional(), basePay: z.number().finite().nonnegative().optional(), promotion: z.object({ date: z.string(), title: z.string(), fromLevel: z.number(), toLevel: z.number(), previousSalary: z.number(), salary: z.number() }).optional() }).nullable(), workMonths: z.number(),
  applications: z.array(applicationSchema), lastPaidMonth: z.string().nullable(),
  ledger: z.array(entrySchema), log: z.array(z.string()),
  lastOfficePaidMonth: z.string().nullable().default(null),
  officePayHistory: z.array(z.object({ month: z.string(), officeId: z.string(), title: z.string(), jurisdiction: z.string(), since: z.string(), amount: z.number() })).default([]),
  position: z.enum(positions).default('none'),
  startingScenario: z.object({ id: z.enum(['appointed-minister','state-commissioner','party-leadership','connected-heir']), title: z.string(), description: z.string(), perks: z.array(z.string()) }).nullable().default(null),
  report: z.object({ period: z.string(), lines: z.array(z.string()) }).nullable().default(null),
  pendingEvent: z.string().nullable().default(null),
  pendingEncounter: eventSchema.nullable().optional(),
  eventEncounter: eventSchema.extend({ date: z.string(), presented: z.literal(true) }).nullable().default(null),
  eventHistory: z.array(eventSchema.extend({ date: z.string(), choice: z.string(), consequences: z.string() })).default([]),
  office: z.object({ id: z.string(), title: z.string(), jurisdiction: z.string(), since: z.string(), party: z.enum(parties).default('Independent'), elected: z.string().default(''), termEnd: z.string().default(''), margin: z.number().default(0) }).nullable().default(null),
  groups: z.record(z.string(), z.number()).default({}),
  campaign: campaignSchema.nullable().default(null),
  debate: debateSchema.nullable().optional(),
  debateHistory: z.array(debateSchema).optional(),
  warChest: z.number().default(0),
  elections: z.array(resultSchema).default([]),
  news: z.array(z.object({ id: z.string(), date: z.string(), paper: z.string(), stories: z.array(storySchema) })).default([]),
  newsQueue: z.array(storySchema).default([]),
  newspaperPending: z.boolean().default(false),
  budget: z.object({ year: z.number(), revenue: z.number(), taxes: z.enum(['cut', 'hold', 'raise']).default('hold'), spending: z.record(z.string(), z.number()).default({}), proposals: z.array(z.object({ date: z.string(), total: z.number(), result: z.string() })).default([]) }).nullable().default(null),
  treasury: z.object({ tenure: z.string().default(''), balance: z.number().finite().nonnegative().default(0), lastProcessedEnd: z.string().default(''), transactions: z.array(z.object({ key: z.string(), tenure: z.string(), date: z.string(), label: z.string(), amount: z.number().finite() })).default([]), finance: financeSchema.nullable().optional() }).nullable().default(null),
  approval: z.object({ overall: z.number(), party: z.number(), independent: z.number(), groups: z.record(z.string(), z.number()).default({}), history: z.array(z.object({ date: z.string(), change: z.number(), reason: z.string() })).default([]), actionTurn: z.string().default(''), actionUses: z.record(z.string(), z.number().int().nonnegative()).default({}), driftTurn: z.string().default('') }).nullable().default(null),
  bills: z.array(billSchema).default([]),
  governmentDecisions: z.array(z.object({ date: z.string(), title: z.string(), support: supportSchema })).default([]),
  federalGovernment: z.object({ publicProjects: z.array(publicProjectSchema).default([]), tenure: z.string(), year: z.number(), spent: z.number().default(0), coalition: z.number().min(0).max(24).default(0), diplomacy: z.number().min(0).max(100).default(40), nominations: z.array(z.object({ id: z.string(), role: z.string(), name: z.string(), policy: z.enum(['services', 'business', 'environment', 'safety']), competence: z.number(), status: z.enum(['nominated', 'confirmed', 'rejected']), support: supportSchema.nullable().default(null) })).default([]), orders: z.array(z.object({ id: z.string(), title: z.string(), authority: z.string(), cost: z.number(), date: z.string() })).default([]) }).nullable().default(null),
  scandals: z.array(scandalSchema).default([]),
  scandalLastTurn: z.string().default(''),
  crises: z.array(crisisSchema).default([]),
  crisisGeneration: crisisGenerationSchema,
  housing: z.object({
    currentPropertyId: z.string(), status: z.enum(['renting', 'owning']),
    monthlyRent: z.number().nonnegative().default(0), arrears: z.number().nonnegative().default(0),
    missedQuarters: z.number().int().nonnegative().optional(), lastRentPeriod: z.string().optional(), since: z.string().optional(),
    history: z.array(z.object({ propertyId: z.string(), from: z.string(), to: z.string(), status: z.enum(['renting', 'owning']) })).default([]),
  }).nullable().default(null),
  health: z.number().finite().min(0).max(100).catch(85).default(85),
  life: z.object({ medical: medicalSchema.optional(), diet: z.object({ tierId: z.enum(['budget', 'standard', 'premium', 'organic_chef']).catch('standard'), monthlyCost: z.number().nonnegative(), healthDeltaPerQuarter: z.number() }), insurance: z.object({ planId: z.enum(['none', 'basic_hmo', 'comprehensive_ppo']).catch('none'), monthlyCost: z.number().nonnegative(), coverage: z.number().min(0).max(1) }).default({ planId: 'none', monthlyCost: 0, coverage: 0 }), medicalDebt: z.number().nonnegative().catch(0).default(0), energy: z.number().min(0).max(100).catch(80).default(80), stress: z.number().min(0).max(100).catch(20).default(20), lifestyle: z.object({ tierId: z.enum(['minimalist', 'balanced', 'affluent', 'luxury']).catch('balanced'), monthlyCost: z.number().nonnegative(), stressReductionPerQuarter: z.number(), energyBonusPerQuarter: z.number() }).catch({ tierId: 'balanced', monthlyCost: 400, stressReductionPerQuarter: -5, energyBonusPerQuarter: 3 }).default({ tierId: 'balanced', monthlyCost: 400, stressReductionPerQuarter: -5, energyBonusPerQuarter: 3 }), foodArrears: z.number().nonnegative().optional(), frugal: z.boolean().optional(), lastLivingPeriod: z.string().optional(), insurancePaidPeriod: z.string().optional(), vehicles: z.array(z.object({ id: z.string(), modelId: z.enum(['transit_pass','economy_sedan','executive_suv','armored_sedan','chauffeur_limo']), purchaseDate: z.string(), condition: z.number().min(0).max(100), monthlyUpkeep: z.number().nonnegative() })).catch([]).optional(), activeVehicleId: z.string().nullable().catch(null).optional(), possessions: z.array(z.object({ id: z.string(), itemId: z.enum(['tailored_suit','executive_watch','high_end_tech','leather_briefcase']), purchaseDate: z.string() })).catch([]).optional(), maintenanceOverdue: z.boolean().optional(), lastTransportPeriod: z.string().optional(), billArrears: z.number().nonnegative().catch(0).optional(), lastBillsPeriod: z.string().optional(), taxStance: z.enum(['honest','loophole','evade']).catch('honest').optional(), lastTaxPeriod: z.string().optional(), unpaidTax: z.number().nonnegative().catch(0).optional(), social: z.object({ contacts: z.array(z.object({ id: z.string(), archetypeId: z.enum(['confidant','organizer','executive','mentor','reporter','parents','sibling','romantic']), name: z.string(), role: z.string(), affinity: z.number().min(0).max(100), status: z.enum(['acquaintance','friend','close','family','estranged']), portrait: z.string(), lastInteraction: z.string().optional(), neglect: z.number().optional() })).catch([]), maritalStatus: z.enum(['single','dating','engaged','married','divorced']).catch('single'), partner: z.object({ id: z.string(), archetypeId: z.enum(['confidant','organizer','executive','mentor','reporter','parents','sibling','romantic']), name: z.string(), role: z.string(), affinity: z.number().min(0).max(100), status: z.enum(['acquaintance','friend','close','family','estranged']), portrait: z.string(), lastInteraction: z.string().optional(), neglect: z.number().optional() }).extend({ weddingDate: z.string().nullable(), sharedMonthlyExpenses: z.number().nonnegative(), datingSince: z.string().nullable().optional() }).nullable().catch(null), dependents: z.array(z.object({ id: z.string(), name: z.string(), age: z.number().nonnegative(), supportCost: z.number().nonnegative() })).catch([]), lastFamilyPeriod: z.string().optional(), familyImage: z.enum(['neutral','stable','strained']).optional(), household: z.unknown().optional(), pendingSocialEvent: z.object({ eventId: z.string(), period: z.string() }).optional().catch(undefined), introductions: z.array(z.object({ personId: z.string(), venue: z.string() })).optional().catch(undefined) }).optional() }).nullable().default(null),
  stateGovernment: z.object({ publicProjects: z.array(publicProjectSchema).default([]), tenure: z.string(), year: z.number(), spent: z.number().default(0), priority: z.enum(['services', 'business', 'environment', 'safety']).default('services'), coalition: z.number().min(0).max(24).default(0), officials: z.array(z.object({ role: z.string(), name: z.string(), competence: z.number() })).default([]), agencies: z.array(z.object({ id: z.string(), title: z.string(), cost: z.number(), progress: z.number(), status: z.enum(['active', 'completed']), lastProcessed: z.string() })).default([]), disaster: z.object({ id: z.string(), title: z.string(), cost: z.number(), resolved: z.boolean() }).nullable().default(null), lastProcessed: z.string().default('') }).nullable().default(null),
  city: z.object({ publicProjects: z.array(publicProjectSchema).default([]), tenure: z.string(), priority: z.enum(['services', 'business', 'environment', 'safety']), spent: z.number().default(0), year: z.number(), officials: z.array(z.object({ role: z.string(), name: z.string(), competence: z.number() })).default([]), projects: z.array(z.object({ id: z.string(), title: z.string(), cost: z.number(), progress: z.number(), status: z.enum(['active', 'completed']), lastProcessed: z.string() })).default([]), emergency: z.object({ id: z.string(), title: z.string(), cost: z.number(), resolved: z.boolean() }).nullable().default(null), lastProcessed: z.string().default('') }).nullable().default(null),
});
export const careerSchema = careerBaseSchema.extend({
  termHistory: z.array(z.object({
    office: careerBaseSchema.shape.office.removeDefault().unwrap(), ended: z.string().nullable(),
    reason: z.enum(['term ended', 'resigned', 're-elected', 'changed office', 'removed from office', 'retired', 'died in office']).nullable().default(null),
    government: careerBaseSchema.pick({ budget: true, treasury: true, approval: true, city: true, stateGovernment: true, federalGovernment: true }).nullable().default(null),
  })).default([]),
  termPlan: z.object({ tenure: z.string(), choice: z.enum(['run', 'leave']) }).nullable().default(null),
  termWarnings: z.array(z.string()).default([]),
  printedHeadlines: z.array(z.string()).default([]),
  businesses: z.array(businessSchema).default([]),
  businessRevision: z.number().int().nonnegative().optional(),
  supportGroups: supportGroupsSchema.nullable().default(null),
  socialMedia: socialMediaSchema.nullable().default(null),
  network: networkSchema.nullable().optional(),
  appointments: appointmentCareerSchema.nullable().optional(),
  corruption: corruptionSchema.nullable().default(null),
  legal: legalSchema.nullable().default(null),
  banking: bankingSchema.nullable().optional(),
  crime: crimeSchema.nullable().optional(),
  executiveDocket: executiveDocketSchema.nullable().optional(),
  legislature: legislatureSchema.nullable().optional(),
  impeachment: impeachmentSchema.nullable().optional(),
  dynasty: dynastySchema.nullable().optional(),
  legacy: legacySchema.nullable().optional(),
  rewards: rewardsSchema.nullable().optional(),
  legislativeRecord: z.object({ ineffective: z.array(z.object({ tenure: z.string(), office: z.string(), ended: z.string() })).default([]) }).nullable().optional(),
  /** Game mode; legacy saves without it are sandbox. Story careers also carry scenario progress. */
  mode: z.enum(['sandbox', 'story']).default('sandbox'),
  story: storyStateSchema.nullable().optional(),
});
export type Career = z.infer<typeof careerSchema>;
export const SAVE_KEY = 'crosian-president-career-v1';

function freshFields() {
  return { energyModel: 1 as const, actions: ACTIONS_PER_MONTH, freePoliticalActivityUsed: false, politicalActivityRevision: 0, politicalActivityUses: {}, experience: 0, skills: { communication: 0, leadership: 0, knowledge: 0 }, contacts: 0, job: null, workMonths: 0, applications: [], lastPaidMonth: null, lastOfficePaidMonth: null, officePayHistory: [], ledger: [], log: [], position: 'none' as const, startingScenario: null, report: null, pendingEvent: null, eventEncounter: null, eventHistory: [], office: null, groups: {}, campaign: null, warChest: 0, elections: [], news: [], newsQueue: [], newspaperPending: false, budget: null, treasury: null, approval: null, bills: [], governmentDecisions: [], city: null, stateGovernment: null, federalGovernment: null, scandals: [], businesses: [], supportGroups: null, socialMedia: null, corruption: null, legal: null };
}
export function createCareer(character: CharacterDraft, rng: () => number = Math.random): Career {
  const parsed = draftSchema.parse(character);
  const start = backgroundConfig(parsed.background);
  const base: Career = { version: 2, mode: 'sandbox', character: parsed, age: 22, date: '2026-01-01', money: start.cash, reputation: start.reputation, relationships: start.connections, publicOffice: false, eligibleAppointment: false, ...freshFields(), scandalLastTurn: '', experience: start.experience, crises: [], crisisGeneration: { lastProcessed: '', nextEligibleTurn: '' }, termHistory: [], termPlan: null, termWarnings: [], printedHeadlines: [], housing: startingHousing(parsed.background), health: DEFAULT_HEALTH, life: { ...defaultLife(), ...startingVehicles(parsed.background), social: startingSocial(parsed.background) } };
  const rolled = rollStartingScenario(base, rng);
  return { ...rolled, supportGroups: baselineSupportGroups(rolled) };
}
/** Story Mode career: same character creation, stamped with the scenario and its seeded progress state. */
export function createStoryCareer(character: CharacterDraft, scenarioId: string, rng: () => number = Math.random): Career {
  return { ...createCareer(character, rng), mode: 'story', story: seedStoryState(createStoryState(scenarioId)) };
}
export function parseCareer(raw: string | null): Career | null {
  if (!raw) return null;
  const opened = openSave(raw);
  if (opened.status !== 'signed' && opened.status !== 'unsigned') return null;
  try {
    const data = JSON.parse(opened.data);
    if (data.businesses == null) data.businesses = data.business ? [data.business] : [];
    if (data.businesses && !Array.isArray(data.businesses) && typeof data.businesses === 'object') data.businesses = [data.businesses];
    if (Array.isArray(data.businesses)) data.businesses = data.businesses.map((b: Record<string, unknown>) => ({ ...b, account: b['account'] ?? b['operatingCash'] ?? 0 }));
    const v2 = careerSchema.safeParse(data);
    if (v2.success) {
      const c = v2.data;
      if (c.energyModel !== 1) { c.actions = Math.min(MAX_ENERGY, c.actions * 20); c.energyModel = 1; }
      c.businesses = c.businesses.map(normalizeBusiness);
      if (c.campaign && c.campaign.directors === undefined && c.campaign.staff > 0) c.campaign = normalizeCampaignStaff(c.campaign);
      if (c.office && !c.office.termEnd) c.office = { ...c.office, elected: c.office.elected || `${Number(c.office.since.slice(0, 4)) - 1}-11-01`, termEnd: termEndDate(c.office.since, c.office.id) };
      if (!Array.isArray(data.termHistory)) {
        c.termHistory = c.elections.filter(e => e.won && e.stage === 'general').map(e => {
          const since = `${Number(e.date.slice(0, 4)) + 1}-01-01`;
          const office = c.office?.id === e.office && c.office.elected === e.date ? c.office : { id: e.office, title: e.title, jurisdiction: e.jurisdiction, party: e.rows.find(r => r.name === c.character.name)?.party ?? c.character.party, elected: e.date, since, termEnd: termEndDate(since, e.office), margin: 0 };
          return { office, ended: c.office?.since === office.since && c.office.id === office.id ? null : office.termEnd, reason: null, government: null };
        });
        const active = c.office;
        if (active && !c.termHistory.some(t => t.office.id === active.id && t.office.since === active.since)) c.termHistory.push({ office: active, ended: null, reason: null, government: null });
      }
      c.printedHeadlines = [...new Set([...c.printedHeadlines, ...c.news.flatMap(e => e.stories.map(s => s.h))])];
      if (!c.housing) c.housing = startingHousing(c.character.background);
      return initializeDocket(ensureLife(c));
    }
    const v1 = v1Schema.safeParse(data);
    if (v1.success) { const m = careerSchema.safeParse({ ...v1.data, ...freshFields(), version: 2 }); return m.success ? ensureLife(m.data) : null; }
    return null;
  } catch { return null; }
}
export function canAccessGovernment(career: Pick<Career, 'publicOffice' | 'eligibleAppointment'>): boolean {
  return career.publicOffice || career.eligibleAppointment;
}
