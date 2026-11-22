/** Civil War war room (Phase 4): read-only theater/general/naval status derived from saved session flags. */
export type FrontStatus = 'Advancing' | 'Holding' | 'Retreating' | 'Quiet';
const has = (f: readonly string[], k: string) => f.includes(k);

const GENERALS: Record<string, string> = {
  'gen-mcdowell': 'Irvin McDowell', 'gen-mcclellan': 'George McClellan', 'gen-lee-offer': 'Winfield Scott (Lee declined)',
  'gen-lee': 'Robert E. Lee', 'gen-johnston': 'Joseph E. Johnston', 'gen-beauregard': 'P. G. T. Beauregard',
};
const NAVY: Record<string, string> = {
  'blockade-full': 'Full blockade of Southern ports', 'west-river': 'River fleet on the Mississippi',
  'navy-ironclad': 'Ironclad CSS Virginia', 'navy-runners': 'Blockade runners', 'navy-raiders': 'Commerce raiders',
};

export function warRoom(flags: readonly string[]) {
  const general = Object.keys(GENERALS).find(k => has(flags, k));
  const navy = Object.keys(NAVY).filter(k => has(flags, k)).map(k => NAVY[k]);
  const east: FrontStatus = has(flags, 'east-victory') ? 'Advancing' : has(flags, 'east-defeat') ? 'Retreating' : has(flags, 'east-hold') ? 'Holding' : 'Quiet';
  const west: FrontStatus = has(flags, 'west-advance') ? 'Advancing' : has(flags, 'west-hold') ? 'Holding' : 'Quiet';
  return {
    general: general ? GENERALS[general] : 'Not yet appointed',
    theaters: [{ id: 'east', name: 'Eastern Theater', area: 'Virginia & Maryland', status: east }, { id: 'west', name: 'Western Theater', area: 'Kentucky, Tennessee & Missouri', status: west }],
    navy: navy.length ? navy : ['No naval orders yet'],
  };
}
