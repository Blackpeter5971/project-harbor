import { Button } from '@/components/ui/button';
import { backgroundConfig, type Career } from '@/lib/game/career';
import { positionNames } from '@/lib/game/gameplay';

const scenarioSummary: Record<string, string> = {
  'connected-heir': 'High party standing and family mentorship',
  'party-leadership': 'A seat in party leadership — influence, not elected office',
  'appointed-minister': 'A national appointment',
  'state-commissioner': 'A state executive commission',
};

export function StartingBriefing({ career, onClose }: { career: Career; onClose: () => void }) {
  const cfg = backgroundConfig(career.character.background);
  const s = career.startingScenario;
  return <div className="modal-backdrop"><section className="game-modal briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
    <span className="eyebrow">Starting briefing · {cfg.difficulty}</span>
    <h2 id="briefing-title">{career.character.name}</h2>
    <p>{career.character.background} · {career.character.party} · {career.character.state}</p>
    {s && <p className="briefing-scenario"><b>Assigned: {s.title}</b> — {scenarioSummary[s.id] ?? s.description}</p>}
    <div className="briefing-grid">
      <span>Cash<b>${career.money.toLocaleString('en-US')}</b></span>
      <span>Reputation<b>{career.reputation}</b></span>
      <span>Experience<b>{career.experience}</b></span>
      <span>Connections<b>{career.relationships}</b></span>
    </div>
    <p className="mini-note">Position: {career.office ? career.office.title : positionNames[career.position]} · No public office yet</p>
    <Button variant="game" className="w-full mt-3" autoFocus onClick={onClose}>Begin career</Button>
  </section></div>;
}
