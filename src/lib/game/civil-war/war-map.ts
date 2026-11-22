/** Civil War allegiance map (Sub-Phase 3): pure tile-grid data + allegiance derived from the saved session. */
export type Allegiance = 'union' | 'border' | 'confederate' | 'territory';
export interface MapState { id: string; name: string; col: number; row: number; base: Allegiance; group?: 'deep-south' | 'upper-south' }

const S = (id: string, name: string, col: number, row: number, base: Allegiance, group?: MapState['group']): MapState => ({ id, name, col, row, base, ...(group ? { group } : {}) });
export const MAP_STATES: MapState[] = [
  S('WA', 'Washington Terr.', 0, 0, 'territory'), S('DK', 'Dakota Terr.', 3, 0, 'territory'), S('MN', 'Minnesota', 4, 0, 'union'), S('WI', 'Wisconsin', 5, 0, 'union'), S('MI', 'Michigan', 6, 0, 'union'), S('VT', 'Vermont', 9, 0, 'union'), S('NH', 'New Hampshire', 10, 0, 'union'), S('ME', 'Maine', 11, 0, 'union'),
  S('OR', 'Oregon', 0, 1, 'union'), S('NE', 'Nebraska Terr.', 3, 1, 'territory'), S('IA', 'Iowa', 4, 1, 'union'), S('IL', 'Illinois', 5, 1, 'union'), S('IN', 'Indiana', 6, 1, 'union'), S('OH', 'Ohio', 7, 1, 'union'), S('PA', 'Pennsylvania', 8, 1, 'union'), S('NY', 'New York', 9, 1, 'union'), S('MA', 'Massachusetts', 10, 1, 'union'),
  S('CA', 'California', 0, 2, 'union'), S('UT', 'Utah Terr.', 1, 2, 'territory'), S('KS', 'Kansas', 3, 2, 'union'), S('MO', 'Missouri', 4, 2, 'border'), S('KY', 'Kentucky', 5, 2, 'border'), S('VA', 'Virginia', 7, 2, 'union', 'upper-south'), S('MD', 'Maryland', 8, 2, 'border'), S('NJ', 'New Jersey', 9, 2, 'union'), S('CT', 'Connecticut', 10, 2, 'union'), S('RI', 'Rhode Island', 11, 2, 'union'),
  S('NM', 'New Mexico Terr.', 2, 3, 'territory'), S('IT', 'Indian Terr.', 3, 3, 'territory'), S('AR', 'Arkansas', 4, 3, 'union', 'upper-south'), S('TN', 'Tennessee', 5, 3, 'union', 'upper-south'), S('NC', 'North Carolina', 6, 3, 'union', 'upper-south'), S('SC', 'South Carolina', 7, 3, 'union', 'deep-south'), S('DE', 'Delaware', 9, 3, 'border'),
  S('TX', 'Texas', 3, 4, 'union', 'deep-south'), S('LA', 'Louisiana', 4, 4, 'union', 'deep-south'), S('MS', 'Mississippi', 5, 4, 'union', 'deep-south'), S('AL', 'Alabama', 6, 4, 'union', 'deep-south'), S('GA', 'Georgia', 7, 4, 'union', 'deep-south'),
  S('FL', 'Florida', 7, 5, 'union', 'deep-south'),
];

export interface MapSession { meters: Record<string, number>; visited: readonly string[] }
export type BorderLean = 'union' | 'contested' | 'confederate';

/** Border states lean with Border State Loyalty (≥60 Union, ≤35 Confederate). */
export const borderLean = (loyalty: number): BorderLean => loyalty >= 60 ? 'union' : loyalty <= 35 ? 'confederate' : 'contested';

/** Secession follows story progress: South Carolina first (Dec 1860), then the Deep South (Feb 1861). */
export function warMap(s: MapSession) {
  const v = new Set(s.visited);
  const deepSouth = v.has('cw_c_2') || v.has('cw_end');
  const carolina = deepSouth || v.has('cw_u_2') || v.has('cw_c_1');
  const lean = borderLean(s.meters['borderLoyalty'] ?? 50);
  const states = MAP_STATES.map(st => {
    let allegiance: Allegiance = st.base;
    if (st.id === 'SC' && carolina) allegiance = 'confederate';
    else if (st.group === 'deep-south' && deepSouth) allegiance = 'confederate';
    return { ...st, allegiance, lean: allegiance === 'border' ? lean : null };
  });
  const count = (a: Allegiance) => states.filter(x => x.allegiance === a).length;
  return { states, lean, counts: { union: count('union'), border: count('border'), confederate: count('confederate'), territory: count('territory') } };
}
