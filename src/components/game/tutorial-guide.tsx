import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';

export const TUTORIAL_KEY = 'president-tutorial';

type Props = { career: Career; onJobs: () => void; onActivities: () => void };

const STEPS = [
  { title: 'Step 1 · Find a job', text: 'Every politician needs an income. Open Career & Business → Job Listings and apply for an entry-level job.', cta: 'Show me jobs' },
  { title: 'Step 2 · Do a political activity', text: 'Activities build your reputation, experience and party connections. Open Politics → Political Activities and try one.', cta: 'Show me activities' },
  { title: 'You are ready to rise!', text: 'Press Next Turn to move 3 months ahead. Your pay is settled and your energy refills each turn.', cta: 'Finish' },
];

/** Small, skippable first-career guide. Progress lives in device storage only, never in the career save. */
export function TutorialGuide({ career, onJobs, onActivities }: Props) {
  const [step, setStep] = useState<number | null>(null);
  const startEnergy = useRef<number | null>(null);

  useEffect(() => {
    try { const v = localStorage.getItem(TUTORIAL_KEY); if (v !== null && v !== 'done') setStep(Number(v) || 0); } catch { /* storage unavailable */ }
  }, []);

  const save = (v: number | 'done') => { try { localStorage.setItem(TUTORIAL_KEY, String(v)); } catch { /* ignore */ } setStep(v === 'done' ? null : v); };

  useEffect(() => {
    if (step === 0 && career.job) save(1);
    if (step === 1) {
      if (startEnergy.current === null) startEnergy.current = career.actions;
      else if (career.actions < startEnergy.current) save(2);
    }
  }, [step, career.job, career.actions]);

  if (step === null) return null;
  const s = STEPS[step] ?? STEPS[2]!;
  const act = () => { if (step === 0) onJobs(); else if (step === 1) { startEnergy.current = career.actions; onActivities(); } else save('done'); };

  return <aside className="tutorial-guide" role="dialog" aria-label="Tutorial">
    <span className="eyebrow">Tutorial {Math.min(step + 1, 3)}/3</span>
    <h3>{s.title}</h3>
    <p>{s.text}</p>
    <div className="tutorial-actions">
      <Button variant="game" size="sm" onClick={act}>{s.cta}</Button>
      {step < 2 && <Button variant="gameQuiet" size="sm" onClick={() => save('done')}>Skip tutorial</Button>}
    </div>
  </aside>;
}
