import type { Career } from './career';
import { wardrobeReputationBonus } from './vehicles';
import { backgroundCheckLabel, passesBackgroundCheck } from './criminal-record';

export const jobSectors = ['Public Administration', 'Education', 'Healthcare', 'Banking & Finance', 'Technology & IT', 'Construction & Logistics', 'Retail & Hospitality', 'Media & Communications', 'Agriculture & Manufacturing', 'Security & Law Enforcement'] as const;
export type JobSector = typeof jobSectors[number];
export type EducationLevel = 'None' | 'High School' | "Bachelor's" | 'Advanced';
type Skill = keyof Career['skills'];
export type Job = {
  id: string; title: string; description: string; salary: number;
  sector: JobSector; minimumEducation: EducationLevel; experienceMonths: number;
  thresholds: Partial<Record<Skill, number>>; tier: 1 | 2 | 3;
  primarySkill: Skill; quarterlyReputation: number; monthlyGains: Partial<Record<Skill | 'experience' | 'contacts', number>>;
  requirements: { label: string; check: (c: Career) => boolean }[]; skills: string;
};
const educationRank: Record<string, number> = { None: 0, 'High School Graduate': 1, Military: 1, 'Political Science': 2, Business: 2, "Bachelor's Degree": 2, Law: 3, 'Advanced Degree': 3 };
const ranks: Record<EducationLevel, number> = { None: 0, 'High School': 1, "Bachelor's": 2, Advanced: 3 };
export function educationMeets(c: Career, level: EducationLevel) { return (educationRank[c.character.education] ?? 0) >= ranks[level]; }
function role(id: string, title: string, sector: JobSector, salary: number, minimumEducation: EducationLevel, experienceMonths: number, thresholds: Job['thresholds'], primarySkill: Skill, tier: Job['tier'], description: string): Job {
  const gain = tier === 1 ? 0.5 : tier === 2 ? 0.7 : 0.9;
  return { id, title, sector, salary, minimumEducation, experienceMonths, thresholds, primarySkill, tier, description,
    monthlyGains: { [primarySkill]: gain }, quarterlyReputation: tier === 1 ? 0 : tier === 2 ? 0.3 : 0.6,
    skills: `+${gain} ${primarySkill}`,
    requirements: [
      { label: `Education: ${minimumEducation}`, check: c => educationMeets(c, minimumEducation) },
      { label: `${experienceMonths} months work experience`, check: c => c.workMonths >= experienceMonths },
      ...Object.entries(thresholds).map(([skill, min]) => ({ label: `${skill[0]?.toUpperCase()}${skill.slice(1)} ${min}+`, check: (c: Career) => c.skills[skill as Skill] >= (min ?? 0) })),
    ],
  };
}
// Legacy IDs, titles, wages and eligibility remain intact for saved careers/applications.
const legacy = (j: Job, requirements: Job['requirements'], gains = j.monthlyGains): Job => ({ ...j, requirements, monthlyGains: gains, quarterlyReputation: 0 });
const edu = (...e: string[]) => (c: Career) => e.includes(c.character.education);
export const jobs: Job[] = [
  legacy(role('food', 'Restaurant Crew', 'Retail & Hospitality', 780, 'None', 0, {}, 'communication', 1, 'Fast-paced part-time shifts at a busy diner.'), []),
  legacy(role('retail', 'Retail Associate', 'Retail & Hospitality', 850, 'None', 0, {}, 'communication', 1, 'Part-time stocking and customer help at a local store.'), []),
  legacy(role('warehouse', 'Warehouse Worker', 'Construction & Logistics', 950, 'None', 0, {}, 'leadership', 1, 'Pick, pack and load orders. Physical work.'), []),
  legacy(role('office', 'Office Assistant', 'Public Administration', 1400, 'None', 0, { communication: 10 }, 'communication', 1, 'Answer phones and manage paperwork.'), [{ label: 'Communication 10+', check: c => c.skills.communication >= 10 }]),
  legacy(role('intern', 'Legislative Intern', 'Public Administration', 1300, "Bachelor's", 0, { knowledge: 15 }, 'knowledge', 1, 'Research and constituent mail at the state capitol.'), [{ label: 'Political Science or Law education', check: edu('Political Science', 'Law') }, { label: 'Knowledge 15+', check: c => c.skills.knowledge >= 15 }], { knowledge: 0.5, contacts: 0.5 }),
  legacy(role('field', 'Campaign Field Staffer', 'Public Administration', 1700, 'None', 0, {}, 'communication', 1, 'Paid organiser for a local campaign.'), [{ label: 'Political experience 15+', check: c => c.experience >= 15 }], { experience: 1, contacts: 0.5 }),
  legacy(role('security', 'Security Officer', 'Security & Law Enforcement', 1900, 'None', 0, { leadership: 15 }, 'leadership', 1, 'Patrol and protect a downtown building.'), [{ label: 'Military education or Leadership 15+', check: c => edu('Military')(c) || c.skills.leadership >= 15 }]),
  legacy(role('teller', 'Bank Teller', 'Banking & Finance', 2400, 'None', 0, { knowledge: 20 }, 'knowledge', 1, 'Handle deposits and customer accounts.'), [{ label: 'Business education or Knowledge 20+', check: c => edu('Business')(c) || c.skills.knowledge >= 20 }, { label: 'Reputation 5+', check: c => c.reputation + wardrobeReputationBonus(c) >= 5 }]),
  role('clerk', 'Clerk', 'Public Administration', 1600, 'High School', 0, { communication: 5 }, 'communication', 1, 'Process service requests, maintain records and assist residents.'),
  role('policy-analyst', 'Policy Analyst', 'Public Administration', 3800, "Bachelor's", 12, { knowledge: 25, communication: 15 }, 'knowledge', 2, 'Research policy options, evaluate data and prepare departmental briefings.'),
  role('department-director', 'Department Director', 'Public Administration', 7500, 'Advanced', 72, { leadership: 50, knowledge: 40 }, 'leadership', 3, 'Lead civilian staff, coordinate services and supervise departmental operations. This is employment, not a political appointment.'),
  role('teacher', 'Teacher', 'Education', 3000, "Bachelor's", 0, { communication: 15, knowledge: 15 }, 'communication', 1, 'Prepare lessons, teach classes and assess student progress.'),
  role('principal', 'School Principal', 'Education', 5500, "Bachelor's", 36, { leadership: 35, communication: 25 }, 'leadership', 2, 'Manage a school, support teachers and oversee student welfare.'),
  role('professor', 'Professor', 'Education', 6800, 'Advanced', 48, { knowledge: 45, communication: 30 }, 'knowledge', 3, 'Teach university courses, conduct research and mentor students.'),
  role('nurse', 'Nurse', 'Healthcare', 3400, "Bachelor's", 0, { knowledge: 20, communication: 10 }, 'knowledge', 1, 'Monitor patients, coordinate care and maintain clinical records.'),
  role('medical-officer', 'Medical Officer', 'Healthcare', 6200, 'Advanced', 24, { knowledge: 35, leadership: 20 }, 'knowledge', 2, 'Assess patients, manage treatment plans and supervise clinical teams.'),
  role('chief-medicine', 'Chief of Medicine', 'Healthcare', 11000, 'Advanced', 72, { knowledge: 55, leadership: 45 }, 'leadership', 3, 'Set clinical standards, supervise medical staff and oversee patient safety.'),
  role('financial-analyst', 'Financial Analyst', 'Banking & Finance', 4200, "Bachelor's", 12, { knowledge: 25 }, 'knowledge', 2, 'Analyze accounts, assess risk and prepare financial forecasts.'),
  role('investment-manager', 'Investment Manager', 'Banking & Finance', 8500, "Bachelor's", 60, { knowledge: 45, leadership: 35 }, 'knowledge', 3, 'Manage client portfolios, supervise analysts and review investment risk.'),
  role('junior-developer', 'Junior Developer', 'Technology & IT', 3200, 'High School', 0, { knowledge: 15 }, 'knowledge', 1, 'Implement small features, fix defects and write software tests.'),
  role('systems-architect', 'Systems Architect', 'Technology & IT', 7200, "Bachelor's", 36, { knowledge: 40 }, 'knowledge', 2, 'Design reliable systems, review architecture and plan integrations.'),
  role('tech-lead', 'Tech Lead', 'Technology & IT', 9000, "Bachelor's", 60, { knowledge: 45, leadership: 35 }, 'leadership', 3, 'Lead engineering delivery, mentor developers and review technical decisions.'),
  role('site-laborer', 'Site Laborer', 'Construction & Logistics', 1200, 'None', 0, {}, 'leadership', 1, 'Prepare sites, move materials and assist skilled construction crews.'),
  role('logistics-coordinator', 'Logistics Coordinator', 'Construction & Logistics', 3000, 'High School', 12, { knowledge: 15, communication: 10 }, 'knowledge', 2, 'Schedule deliveries, track stock and coordinate drivers.'),
  role('site-manager', 'Site Manager', 'Construction & Logistics', 5200, 'High School', 36, { leadership: 30, knowledge: 20 }, 'leadership', 3, 'Supervise crews, plan site schedules and maintain safety standards.'),
  role('sales-associate', 'Sales Associate', 'Retail & Hospitality', 1100, 'None', 0, {}, 'communication', 1, 'Help customers, handle purchases and keep merchandise organized.'),
  role('store-manager', 'Store Manager', 'Retail & Hospitality', 3200, 'High School', 12, { leadership: 20, communication: 15 }, 'leadership', 2, 'Manage shifts, support staff and supervise stock and customer service.'),
  role('hotel-director', 'Hotel Director', 'Retail & Hospitality', 6500, "Bachelor's", 48, { leadership: 40, communication: 30 }, 'leadership', 3, 'Oversee hotel departments, guest service and staffing.'),
  role('copywriter', 'Copywriter', 'Media & Communications', 2200, 'High School', 0, { communication: 10 }, 'communication', 1, 'Write clear copy, revise drafts and prepare publication materials.'),
  role('reporter', 'Reporter', 'Media & Communications', 3500, 'High School', 12, { communication: 20, knowledge: 15 }, 'communication', 2, 'Interview sources, verify facts and report local stories.'),
  role('editor-chief', 'Editor-in-Chief', 'Media & Communications', 7200, "Bachelor's", 60, { communication: 45, leadership: 35 }, 'communication', 3, 'Direct editorial coverage, supervise journalists and uphold publication standards.'),
  role('factory-worker', 'Factory Worker', 'Agriculture & Manufacturing', 1300, 'None', 0, {}, 'knowledge', 1, 'Operate production equipment, inspect output and follow safety procedures.'),
  role('farm-supervisor', 'Farm Supervisor', 'Agriculture & Manufacturing', 2800, 'High School', 12, { leadership: 15, knowledge: 10 }, 'leadership', 2, 'Coordinate farm crews, plan field work and monitor crop handling.'),
  role('operations-head', 'Operations Head', 'Agriculture & Manufacturing', 6200, "Bachelor's", 48, { leadership: 40, knowledge: 30 }, 'leadership', 3, 'Lead production teams, coordinate supply chains and improve operations.'),
  role('security-guard', 'Security Guard', 'Security & Law Enforcement', 1400, 'None', 0, {}, 'leadership', 1, 'Monitor entrances, patrol premises and document incidents.'),
  role('police-officer', 'Police Officer', 'Security & Law Enforcement', 3400, 'High School', 12, { leadership: 20, knowledge: 15 }, 'leadership', 2, 'Respond to incidents, patrol neighborhoods and prepare reports.'),
  role('detective', 'Detective', 'Security & Law Enforcement', 5200, 'High School', 36, { knowledge: 35, communication: 20 }, 'knowledge', 3, 'Investigate cases, interview witnesses and analyze evidence.'),
].map(j => {
  const label = backgroundCheckLabel(j.sector, j.tier);
  return label ? { ...j, requirements: [...j.requirements, { label, check: (c: Career) => passesBackgroundCheck(c, j.sector, j.tier) }] } : j;
});
export function missingJobRequirements(c: Career, job: Job) { return job.requirements.filter(r => !r.check(c)).map(r => r.label); }
export function jobPerformanceMet(c: Career, job: Job) { return Object.entries(job.thresholds).every(([skill, value]) => c.skills[skill as Skill] >= (value ?? 0)); }