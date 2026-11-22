import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { crisisSchema } from '@/lib/game/crisis-schema';
import { ensureTreasury } from '@/lib/game/budget';
import { ensureApproval } from '@/lib/game/approval';
import { tenureKey } from '@/lib/game/support';
import { launchCampaign } from '@/lib/game/campaign';

export function crisisCareer(id = 'mayor', type: Career['crises'][number]['type'] = 'utility_failure'): Career {
  const launched = launchCampaign({ ...createCareer({ ...defaultDraft, name: 'Crisis Player' }), date: '2027-07-01', money: 50000, experience: 100, reputation: 40, skills: { communication: 30, leadership: 30, knowledge: 30 } }, 'council', 'Together', 'grassroots');
  if (!launched.ok) throw new Error(launched.message);
  const c = ensureApproval(ensureTreasury({ ...launched.career, date: '2028-04-01', experience: 0, money: 5000, warChest: 1234, relationships: 10, publicOffice: true, actions: 75,
    office: { id, title: id, jurisdiction: 'California', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Independent', margin: 10 } }));
  return { ...c, crises: [crisisSchema.parse({ id: 'test-crisis', type, title: 'Water supply disruption', description: 'Residents face disrupted services.', jurisdiction: ['mayor', 'council'].includes(id) ? 'city' : ['governor', 'stateLeg'].includes(id) ? 'state' : 'federal', severity: 2, status: 'active', turnCreated: c.date, durationRemaining: 3, tenure: tenureKey(c) })] };
}