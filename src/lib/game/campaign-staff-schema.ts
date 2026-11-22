import { z } from 'zod';
export const directorRoles = ['field', 'communications', 'research', 'finance'] as const;
export type DirectorRole = typeof directorRoles[number];
export const directorSchema = z.object({ id: z.string(), role: z.enum(directorRoles), name: z.string(), portrait: z.number().int().min(0).max(5), competence: z.number().min(0).max(100), loyalty: z.number().min(0).max(100), salary: z.number().finite().nonnegative(), hired: z.string(), legacy: z.boolean().optional() });
export type Director = z.infer<typeof directorSchema>;

/** No campaign imports: career parsing and media can use this without import cycles. */
type StaffCampaign = { office: string; startDate: string; staff: number; manager: string | null; directors?: Director[] | undefined; legacyAides?: number | undefined };
const scales: Record<string, number> = { council: 1, mayor: 4, stateLeg: 2, house: 10, governor: 40, senate: 45, president: 400 };
export function staffRoster(camp: StaffCampaign): Director[] {
  if (camp.directors) return camp.directors;
  return directorRoles.slice(0, Math.max(0, Math.min(4, Math.floor(camp.staff)))).map((role, i) => ({ id: `legacy-${role}`, role, name: i === 0 && camp.manager ? camp.manager : ['Jordan Ellis', 'Morgan Reed', 'Casey Brooks', 'Taylor Grant'][i] ?? 'Campaign director', portrait: i, competence: 50, loyalty: 70, salary: 200 * (scales[camp.office] ?? 1), hired: camp.startDate, legacy: true }));
}
export const staffAides = (camp: StaffCampaign) => camp.legacyAides ?? (camp.directors ? Math.max(0, camp.staff - camp.directors.length) : Math.max(0, camp.staff - 4));
export function normalizeCampaignStaff<T extends StaffCampaign>(camp: T): T {
  if (camp.directors) return camp;
  return { ...camp, directors: staffRoster(camp), legacyAides: staffAides(camp) };
}
export const hasDirector = (camp: StaffCampaign | null | undefined, role: DirectorRole) => !!camp && staffRoster(camp).some(d => d.role === role && d.loyalty > 0);
export const directorStrength = (camp: StaffCampaign | null | undefined, role: DirectorRole) => {
  const d = camp ? staffRoster(camp).find(d => d.role === role && d.loyalty > 0) : undefined;
  return d ? (0.5 + d.competence / 200) * (0.5 + d.loyalty / 200) : 0;
};
export const communicationsGain = (camp: StaffCampaign | null | undefined) => 1 + 0.25 * directorStrength(camp, 'communications');
export const communicationsSeverity = (camp: StaffCampaign | null | undefined) => 1 - 0.3 * directorStrength(camp, 'communications');