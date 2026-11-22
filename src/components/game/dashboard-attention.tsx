import { useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, HeartPulse, ShieldAlert, Zap, Flag, Briefcase, House, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { socialOf } from '@/lib/game/social-media';
import { officeCrises } from '@/lib/game/crisis-responses';
import { hubInvitations } from '@/lib/game/media-hub';
import { LOW_ENERGY } from '@/lib/game/energy-costs';
import { activeMission, missionOffer, missionProgress } from '@/lib/game/rewards';

export type AttentionDestination = 'rest' | 'health' | 'housing' | 'garage' | 'inbox' | 'notifications' | 'broadcast' | 'campaign' | 'legal' | 'scandals' | 'government' | 'jobs' | 'finance' | 'mission';
type Attention = { id: string; title: string; detail: string; destination: AttentionDestination; urgent?: boolean; icon: typeof Bell };

/** Read-only alerts: opening a destination never consumes time, money or actions. */
export function dashboardAlerts(c: Career): Attention[] {
  if (c.legal?.prison) return [];
  const alerts: Attention[] = [];
  const add = (a: Attention) => alerts.push(a);
  const cases = c.legal?.cases.filter(x => !x.closed && ['inquiry', 'formal', 'grand_jury', 'indicted'].includes(x.stage)) ?? [];
  if (cases.length) add({ id: 'legal', title: 'Legal attention needed', detail: `${cases.length} active case${cases.length === 1 ? '' : 's'} · review counsel and responses`, destination: 'legal', urgent: true, icon: ShieldAlert });
  const crises = officeCrises(c).filter(x => x.status !== 'resolved' && !x.selectedResponseId);
  if (crises.length) add({ id: 'crisis', title: 'Crisis response needed', detail: crises[0]?.title ?? 'Review government crises', destination: 'government', urgent: true, icon: ShieldAlert });
  if (c.campaign?.attack) add({ id: 'attack', title: 'Campaign response needed', detail: 'An opponent’s attack needs your attention', destination: 'campaign', urgent: true, icon: Flag });
  if ((c.health ?? 85) <= 40) add({ id: 'health', title: 'Low health', detail: `Health ${c.health}% · review food and medical care`, destination: 'health', urgent: true, icon: HeartPulse });
  if (c.actions <= LOW_ENERGY) add({ id: 'energy', title: 'Low energy', detail: `Energy ${c.actions}% · buy energy with coins to keep going`, destination: 'rest', urgent: true, icon: Zap });
  if ((c.life?.stress ?? 20) >= 70) add({ id: 'stress', title: 'High stress', detail: `Stress ${c.life?.stress ?? 20}% · take a break`, destination: 'rest', icon: AlertTriangle });
  if ((c.housing?.arrears ?? 0) > 0) add({ id: 'rent', title: 'Rent overdue', detail: `$${Math.round(c.housing?.arrears ?? 0).toLocaleString()} in housing arrears`, destination: 'housing', urgent: true, icon: House });
  if (c.life?.maintenanceOverdue) add({ id: 'transport', title: 'Vehicle upkeep overdue', detail: 'Review transport costs and condition', destination: 'garage', icon: AlertTriangle });
  if (c.scandals.some(x => x.phase !== 'Managed' && !x.response)) add({ id: 'scandal', title: 'Public scrutiny', detail: 'Review scandal coverage and available responses', destination: 'scandals', icon: ShieldAlert });
  const social = socialOf(c);
  const invites = hubInvitations(c), requests = invites.length + (social.broadcast ? 1 : 0);
  if (requests) add({ id: 'broadcast', title: requests === 1 ? 'Media invitation' : `${requests} media invitations`, detail: social.broadcast ? `${social.broadcast.outlet} · ${social.broadcast.show}` : `${invites[0]!.outlet.name} · ${invites[0]!.story.title}`, destination: 'broadcast', icon: Bell });
  if (c.campaign && c.campaign.funds < 1000) add({ id: 'campaign-cash', title: 'Campaign funds running low', detail: `$${Math.round(c.campaign.funds).toLocaleString()} available · review campaign finances`, destination: 'campaign', icon: Wallet });
  if (c.applications.some(x => x.status === 'offered')) add({ id: 'offer', title: 'Job offer available', detail: 'Review your employment offers', destination: 'jobs', icon: Briefcase });
  const m = activeMission(c), offer = missionOffer(c);
  if (m && missionProgress(c, m) >= m.target) add({ id: 'mission-ready', title: 'Mission complete', detail: `${m.title} · claim your reward`, destination: 'mission', urgent: true, icon: Flag });
  else if (offer) add({ id: 'mission-offer', title: 'New mission available', detail: `${offer.title} · accept or leave it`, destination: 'mission', icon: Flag });
  if (c.money < 500) add({ id: 'cash', title: 'Personal savings running low', detail: `$${Math.round(c.money).toLocaleString()} remaining · review income and spending`, destination: 'finance', icon: Wallet });
  return alerts;
}

export function DashboardAttention({ career, onOpen }: { career: Career; onOpen: (destination: AttentionDestination) => void }) {
  const [expanded, setExpanded] = useState(false);
  const alerts = dashboardAlerts(career);
  return <section className="dashboard-attention" aria-label="Needs attention"><div className="attention-heading"><h3><Bell size={14} />Needs attention</h3><span>{alerts.length}</span></div>
    {!alerts.length ? <p className="attention-clear">No urgent alerts.</p> : <><div className="attention-list">{(expanded ? alerts : alerts.slice(0, 3)).map(({ id, title, detail, destination, urgent, icon: Icon }) => <Button key={id} variant="gameQuiet" className={`attention-item${urgent ? ' urgent' : ''}`} onClick={() => onOpen(destination)}><Icon /><span><b>{title}</b><small>{detail}</small></span><ArrowRight /></Button>)}</div>
      {alerts.length > 3 && <Button variant="gameQuiet" size="sm" className="attention-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `View all ${alerts.length} alerts`}</Button>}</>}
  </section>;
}