import type { Career } from './career';

/** Political Dynasty starting scenarios. Rolled once in createCareer and saved; never rerolled. */
export type ScenarioId = 'appointed-minister' | 'state-commissioner' | 'party-leadership' | 'connected-heir';
export interface StartingScenario { id: ScenarioId; title: string; description: string; perks: string[] }

export const DYNASTY_SCENARIOS: Record<ScenarioId, StartingScenario> = {
  'appointed-minister': { id: 'appointed-minister', title: 'Appointed Minister', description: 'The family name secured you a national appointment.', perks: ['Federal appointed office'] },
  'state-commissioner': { id: 'state-commissioner', title: 'State Commissioner', description: 'You were handed an executive commission in state government.', perks: ['State agency commission'] },
  'party-leadership': { id: 'party-leadership', title: 'Party Leadership', description: 'You inherit a seat on the county party committee — influence, not an elected office.', perks: ['County committee seat', '+5 relationships'] },
  'connected-heir': { id: 'connected-heir', title: 'Connected Political Heir', description: 'A powerful family network and a devoted mentor, but no office yet.', perks: ['+15 mentor affinity', 'Precinct captain access (party members)'] },
};

/**
 * Player-held appointed offices (ministers, commissioners) are not modelled — appointments are NPC
 * officials filled by officeholders — so those scenarios resolve to the Connected Heir fallback.
 */
export const PLAYER_APPOINTMENTS_SUPPORTED = { federal: false, state: false };

export function resolveScenario(id: ScenarioId, c: Pick<Career, 'character'>): ScenarioId {
  if (id === 'appointed-minister' && !PLAYER_APPOINTMENTS_SUPPORTED.federal) return 'connected-heir';
  if (id === 'state-commissioner' && !PLAYER_APPOINTMENTS_SUPPORTED.state) return 'connected-heir';
  if (id === 'party-leadership' && c.character.party === 'Independent') return 'connected-heir';
  return id;
}

export function validScenarios(c: Pick<Career, 'character'>): ScenarioId[] {
  return [...new Set((Object.keys(DYNASTY_SCENARIOS) as ScenarioId[]).map(id => resolveScenario(id, c)))];
}

export function applyScenarioPerks(c: Career, id: ScenarioId): Career {
  const n: Career = { ...c, startingScenario: DYNASTY_SCENARIOS[id] };
  if (id === 'party-leadership') return { ...n, position: 'committee', relationships: n.relationships + 5 };
  if (id === 'connected-heir') {
    const social = n.life?.social;
    const life = social && n.life ? { ...n.life, social: { ...social, contacts: social.contacts.map(p => p.archetypeId === 'mentor' ? { ...p, affinity: Math.min(100, p.affinity + 15) } : p) } } : n.life;
    return { ...n, life, position: n.character.party === 'Independent' ? 'none' : 'captain' };
  }
  return n;
}

export function rollStartingScenario(c: Career, rng: () => number = Math.random): Career {
  if (c.character.background !== 'Political Dynasty') return { ...c, startingScenario: null };
  const pool = validScenarios(c);
  return applyScenarioPerks(c, pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? 'connected-heir');
}
