import { useState } from 'react';
import { Clapperboard, ShieldCheck, Scale, Swords, TriangleAlert, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { adTypes, adBudgets, adBlocker, adPreview, adRequest, adRivals, adTrust, groups, usd, type AdKind, type AdBudget, type AdRequest } from '@/lib/game/campaign';
import studioImage from '@/assets/ad-studio.jpg';

export function AdStudio({ career, onRequest }: { career: Career; onRequest: (request: AdRequest) => void }) {
  const [kind, setKind] = useState<AdKind>('positive');
  const [budget, setBudget] = useState<AdBudget>('standard');
  const [audience, setAudience] = useState('seniors');
  const [rivalName, setRivalName] = useState('');
  const camp = career.campaign;
  if (!camp) return null;
  const rivals = adRivals(camp);
  const rival = rivals.find(r => r.name === rivalName) ?? rivals[0];
  const target = kind === 'positive' ? 'all' : kind === 'attack' ? 'independent' : audience;
  const preview = adPreview(career, kind, budget, target);
  if (!preview) return null;
  const blocker = adBlocker(career);
  const trust = adTrust(career);
  const icons = { positive: ShieldCheck, contrast: Scale, attack: Swords };
  return <div role="tabpanel" className="ad-studio">
    <img className="ad-studio-image" src={studioImage} alt="Campaign camera and advertising storyboards" loading="lazy" width={1280} height={640} />
    <div className="panel-row"><h3 className="section-label"><Clapperboard /> Ad Studio</h3><span className="mini-note">1 flight per turn · 15% energy</span></div>
    {camp.attack && <div className="ad-warning" role="status"><TriangleAlert /><span><b>{camp.attack} is attacking you.</b> A rebuttal is available in Campaign Actions.</span></div>}
    <div className="ad-types" role="radiogroup" aria-label="Ad type">{adTypes.map(a => { const Icon = icons[a.id]; return <Button key={a.id} role="radio" aria-checked={kind === a.id} variant="gameChoice" className={kind === a.id ? 'selected' : ''} onClick={() => setKind(a.id)}><Icon /><span><b>{a.label}</b><small>{a.description}</small></span></Button>; })}</div>
    <label className="field"><span className="field-label">Target audience</span><select className="game-input" aria-label="Target audience" value={target} disabled={kind !== 'contrast'} onChange={e => setAudience(e.target.value)}>{kind === 'positive' ? <option value="all">General electorate</option> : kind === 'attack' ? <option value="independent">Independent / swing voters</option> : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    {kind !== 'positive' && <label className="field"><span className="field-label">Rival</span><select className="game-input" aria-label="Rival" value={rival?.name ?? ''} onChange={e => setRivalName(e.target.value)}>{rivals.length ? rivals.map(r => <option key={r.name} value={r.name}>{r.name}</option>) : <option value="">No active rivals</option>}</select></label>}
    <h3 className="section-label">Budget tier</h3><div className="ad-budgets" role="radiogroup" aria-label="Budget tier">{adBudgets.map(t => <Button key={t.id} role="radio" aria-checked={budget === t.id} variant="gameOutline" className={budget === t.id ? 'selected' : ''} onClick={() => setBudget(t.id)}><span>{t.label}<small>{usd(adPreview(career, kind, t.id, target)?.cost ?? 0)}</small></span></Button>)}</div>
    <div className="ad-metrics" aria-label="Ad risk and reward">
      <div><span>Campaign cost</span><b>{usd(preview.cost)}</b></div>
      <div><span>{kind === 'attack' ? 'Rival poll drop¹' : 'Support gain'}</span><b>{kind === 'attack' ? `−${preview.rivalDrop} pts` : `+${preview.support}`}</b></div>
      <div><span>{kind === 'contrast' ? 'Target favorability' : kind === 'positive' ? 'Name recognition' : 'Independent loss if backlash'}</span><b>{kind === 'attack' ? `−${preview.independentLoss} pts` : `+${kind === 'positive' ? preview.recognition : preview.conversion}`}</b></div>
      <div><span>{kind === 'contrast' ? 'Counter-ad risk²' : 'Backlash risk'}</span><b className={kind === 'attack' ? 'ad-risk' : ''}>{Math.round((kind === 'contrast' ? preview.responseRisk : preview.backlashRisk) * 100)}%</b></div>
    </div>
    {kind === 'attack' && <p className="mini-note">Approval {Math.round(trust.approval)} · Integrity proxy {Math.round(trust.integrity)} (reputation and proven record). ¹Near-zero rivals cannot fall below the polling floor.</p>}
    {kind === 'contrast' && <p className="mini-note">²A counter-ad requires the rival to afford its production cost.</p>}
    {blocker && <p className="mini-note">{blocker}</p>}
    {!blocker && camp.funds < preview.cost && <p className="mini-note ad-risk">Campaign funds short by {usd(preview.cost - camp.funds)}.</p>}
    <Button variant="game" className="w-full mt-3" disabled={!!blocker || camp.funds < preview.cost || (kind !== 'positive' && !rival)} onClick={() => onRequest(adRequest(career, kind, budget, target, kind === 'positive' ? null : rival?.name ?? null))}><Radio />Air ad campaign · {usd(preview.cost)}</Button>
    {camp.lastAd && <div className="ad-result"><h3 className="section-label">Last ad flight · {camp.lastAd.date}</h3><p>{camp.lastAd.message}</p></div>}
  </div>;
}