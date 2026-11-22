/** Civil War national ledger (Phase 2): read-only view of the four national meters and decision history. */
import { CIVIL_WAR_SCRIPT, civilWarFaction } from './civil-war-script';

export type LedgerStanding = 'Strong' | 'Steady' | 'Weak' | 'Critical';
export const ledgerStanding = (v: number): LedgerStanding => v >= 70 ? 'Strong' : v >= 45 ? 'Steady' : v >= 25 ? 'Weak' : 'Critical';

export interface LedgerSession { meters: Record<string, number>; flags: readonly string[]; history: { label: string; deltas: Record<string, number> }[] }

export function nationalLedger(s: LedgerSession) {
  const faction = civilWarFaction(s.flags);
  const rows = CIVIL_WAR_SCRIPT.meters.map(m => {
    const value = s.meters[m.id] ?? m.value;
    const change = s.history.reduce((a, h) => a + (h.deltas[m.id] ?? 0), 0);
    return { id: m.id, label: m.label, icon: m.icon, value, change, standing: ledgerStanding(value) };
  });
  const entries = s.history.map(h => ({ label: h.label, changes: Object.entries(h.deltas).filter(([, d]) => d !== 0) }));
  return { faction, government: faction === 'union' ? 'United States Government' : faction === 'confederacy' ? 'Confederate Provisional Government' : 'Undecided', rows, entries };
}
