import type { Career } from './career';
import type { Crisis } from './crisis-schema';
import { indicators } from './budget';
import { rand } from './campaign';
import { delayPublicProjects, projectJurisdiction, publicProjects } from './public-projects';
import { tenureKey } from './support';
import { dutyApproval } from './approval';
import { crisisVoterGroup } from './crisis-record';
import { groupRel } from './campaign';
import { queueCrisisNews } from './crisis-news';

const monthIndex = (date: string) => {
  const [year = 0, month = 0] = date.split('-').map(Number);
  return /^\d{4}-\d{2}-01$/.test(date) && month >= 1 && month <= 12 ? year * 12 + month - 1 : NaN;
};
const addQuarters = (date: string, turns: number) => {
  const index = monthIndex(date) + turns * 3;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`;
};

/** Attach only crisis defaults; never initialize or alter other government/player data. */
export function ensureCrises(c: Career): Career {
  if (c.crises && c.crisisGeneration?.lastProcessed !== undefined && c.crisisGeneration.nextEligibleTurn !== undefined) return c;
  return { ...c, crises: c.crises ?? [], crisisGeneration: {
    lastProcessed: c.crisisGeneration?.lastProcessed ?? '',
    nextEligibleTurn: c.crisisGeneration?.nextEligibleTurn ?? '',
  } };
}

type Candidate = Pick<Crisis, 'type' | 'title' | 'description' | 'jurisdiction' | 'projectId'> & { weight: number };
const titles = {
  city: ['Local business slowdown', 'Community health outbreak', 'Flooding in city neighborhoods', 'Municipal water supply failure', 'Local sanitation workers strike', 'Municipal construction failure'],
  state: ['State employment downturn', 'Regional hospital capacity crisis', 'Severe statewide flooding', 'Regional power network failure', 'State transport workers strike', 'State infrastructure project failure'],
  federal: ['National economic contraction', 'National public health emergency', 'Multi-state natural disaster', 'Interstate electricity network failure', 'National freight workers strike', 'Federal construction program failure'],
} as const;

/** Weighted context pool: legislative offices observe issues at their own jurisdiction too. */
export function crisisPool(c: Career): Candidate[] {
  const jurisdiction = projectJurisdiction(c);
  if (!jurisdiction) return [];
  const stats = indicators(c);
  const infrastructureRisk = Math.max(0, (60 - stats.infrastructure) / 20);
  const employmentRisk = Math.max(0, (60 - stats.employment) / 20);
  const projects = publicProjects(c).filter(p => p.status === 'in_progress');
  const legacy = jurisdiction === 'city' && c.city?.tenure === tenureKey(c) ? c.city.projects.filter(p => p.status === 'active') : [];
  const project = projects[0] ?? legacy[0];
  const types: Crisis['type'][] = ['economic', 'health', 'natural_disaster', 'utility_failure', 'worker_strike', 'project_failure'];
  const weights = [1 + employmentRisk, 1, 1, 1 + infrastructureRisk, 1 + employmentRisk, 1 + infrastructureRisk];
  const unresolved = (c.crises ?? []).filter(p => p.status !== 'resolved' && p.jurisdiction === jurisdiction && (!p.tenure || p.tenure === tenureKey(c)));
  return types.flatMap((type, i) => {
    if (unresolved.some(p => p.type === type) || type === 'project_failure' && !project) return [];
    const title = titles[jurisdiction][i] ?? 'Public emergency';
    const description = type === 'project_failure'
      ? `${project && 'name' in project ? project.name : project?.title ?? 'Public construction'} faces structural and delivery concerns in ${c.office?.jurisdiction}.`
      : `${title} is disrupting residents and public services in ${c.office?.jurisdiction}.`;
    return [{ type, title, description, jurisdiction, weight: weights[i] ?? 1, projectId: type === 'project_failure' ? project?.id ?? null : null }];
  });
}

export function crisisProbability(c: Career): number {
  if (!projectJurisdiction(c)) return 0;
  const stats = indicators(c);
  return Math.min(0.4, 0.22 + Math.max(0, 60 - stats.infrastructure) / 600 + Math.max(0, 60 - stats.employment) / 600);
}

/** Completed public infrastructure protects related future emergencies. */
export function crisisProtection(c: Career, type: Crisis['type']): number {
  const categories = type === 'health' ? ['healthcare'] : type === 'utility_failure' ? ['water', 'electricity'] : type === 'natural_disaster' ? ['water', 'housing'] : type === 'project_failure' ? ['transportation'] : [];
  return publicProjects(c).some(p => p.status === 'completed' && categories.includes(p.category) && (!p.completionDate || p.completionDate <= c.date)) ? 1 : 0;
}

/** Settle existing crises before construction/elections; each record locks its interval. */
export function crisisLifecycleTurn(c: Career, start: string, end: string): Career {
  if (start !== c.date || monthIndex(end) - monthIndex(start) !== 3 || !projectJurisdiction(c) || c.office?.termEnd && end > c.office.termEnd) return c;
  let n = ensureCrises(c), drag = 0, loyalty = 0;
  for (const p of n.crises) {
    if (p.status === 'resolved' || p.jurisdiction !== projectJurisdiction(c) || p.tenure && p.tenure !== tenureKey(c) || p.turnCreated > start || start < (p.lastProcessed || p.turnCreated)) continue;
    const neglected = ['unaddressed', 'prolonged'].includes(p.trajectory);
    const durationRemaining = Math.max(0, p.durationRemaining - 1);
    const resolved = durationRemaining === 0;
    const neglectedTurns = (p.neglectedTurns ?? 0) + (neglected && p.durationRemaining > 0 ? 1 : 0);
    if (!p.projectEffectsApplied && p.durationRemaining > 0 && ['natural_disaster', 'utility_failure'].includes(p.type)) n = delayPublicProjects(n, start, end);
    if (neglected && p.durationRemaining > 0 && drag < 2) {
      const delta = Math.min(2 - drag, p.severity === 3 ? 1.5 : 1);
      n = dutyApproval(n, -delta, `${p.title}: unresolved emergency response (${end}).`);
      drag += delta;
    }
    if (resolved && !neglected && loyalty < 2) {
      const group = crisisVoterGroup(p), gain = Math.min(1, 2 - loyalty);
      n = { ...n, groups: { ...n.groups, [group]: Math.min(100, groupRel(n, group) + gain) } };
      loyalty += gain;
    }
    n = { ...n, crises: n.crises.map(item => item.id === p.id ? { ...p, tenure: tenureKey(c), durationRemaining, neglectedTurns,
      status: resolved ? 'resolved' : neglectedTurns >= 2 ? 'escalated' : p.status,
      lastProcessed: end, projectEffectsApplied: true, resolutionDate: resolved ? end : null, outcome: resolved ? neglected ? 'neglected' : 'managed' : null } : item) };
    if (resolved) n = queueCrisisNews(n, p.id, 'resolution', end);
    else if (p.status !== 'escalated' && neglectedTurns >= 2) n = queueCrisisNews(n, p.id, 'outcry', end);
  }
  return n;
}

/** Evaluate once per exact quarter; save a 2–4-quarter generation cooldown. */
export function crisesTurn(c: Career, start: string, end: string): Career {
  const from = monthIndex(start), to = monthIndex(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from !== 3 || start !== c.date) return c;
  const jurisdiction = projectJurisdiction(c);
  if (!jurisdiction || c.office?.termEnd && end >= c.office.termEnd) return c;
  const ready = ensureCrises(c);
  // Creation dates backstop legacy generation, independently of lifecycle processing.
  const watermark = ready.crises.reduce((last, p) => p.turnCreated > last ? p.turnCreated : last, ready.crisisGeneration.lastProcessed);
  if (watermark && start < watermark) return c;
  let n: Career = { ...ready, crisisGeneration: { ...ready.crisisGeneration, lastProcessed: end } };
  const latestCreated = ready.crises.reduce((last, p) => p.turnCreated > last ? p.turnCreated : last, '');
  if (start < ready.crisisGeneration.nextEligibleTurn || latestCreated && monthIndex(end) - monthIndex(latestCreated) < 6) return n;
  const seed = `${c.character.name}|${tenureKey(c)}|${end}|crisis`;
  if (rand(`${seed}|chance`) >= crisisProbability(c)) return n;
  const pool = crisisPool(n), total = pool.reduce((sum, p) => sum + p.weight, 0);
  let pick = rand(`${seed}|type`) * total;
  const chosen = pool.find(p => { pick -= p.weight; return pick < 0; });
  if (!chosen) return n;
  const protection = crisisProtection(c, chosen.type);
  const severity = Math.max(1, 1 + Math.floor(rand(`${seed}|severity`) * 3) - protection) as Crisis['severity'];
  const crisis: Crisis = {
    id: `${tenureKey(c)}|crisis|${end}|${chosen.type}`, type: chosen.type,
    title: chosen.title, description: chosen.description, jurisdiction,
    severity, status: 'active', turnCreated: end, durationRemaining: Math.max(1, severity + 1 - protection),
    selectedResponseId: null, lastProcessed: end, tenure: tenureKey(c), projectId: chosen.projectId,
    trajectory: 'unaddressed', responseDate: null, indicatorEffects: { services: 0, infrastructure: 0, employment: 0 },
    resolutionDate: null, outcome: null, neglectedTurns: 0, projectEffectsApplied: false,
    reportedEvents: [],
  };
  const cooldown = 2 + Math.floor(rand(`${seed}|cooldown`) * 3);
  n = { ...n, crises: [...n.crises, crisis], crisisGeneration: { lastProcessed: end, nextEligibleTurn: addQuarters(end, cooldown - 1) } };
  if (severity >= 2) n = queueCrisisNews(n, crisis.id, 'outbreak', end);
  return n;
}