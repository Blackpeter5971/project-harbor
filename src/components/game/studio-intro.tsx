import { useEffect, useState } from 'react';
import logo from '@/assets/intro/studio-logo.png';
import disclaimerBg from '@/assets/intro/disclaimer-bg.jpg';
import bg1 from '@/assets/capitol.jpg';
import bg2 from '@/assets/government-senate.jpg';
import bg3 from '@/assets/docket-press-conference.jpg';
import bg4 from '@/assets/debate-town-hall.jpg';
import bg5 from '@/assets/government-house.jpg';
import bg6 from '@/assets/street-night.jpg';
const LOAD_BGS = [bg1, bg2, bg3, bg4, bg5, bg6];

const TIPS = [
  'Tip: Approval and momentum rise faster when your actions match your traits.',
  'Tip: Keep campaign funds and personal money separate — scandals love a mixed ledger.',
  'Tip: Read the newspaper each turn; rivals often reveal their next move.',
  'Tip: Story Mode saves separately, so your sandbox career is always safe.',
];

// Stage timings (ms): logo 4s, disclaimer 4s + support 5s, credits 5s.
const STAGES = [4000, 9000, 7000];

export function StudioIntro({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);
  const [support, setSupport] = useState(false);
  const [bg] = useState(() => LOAD_BGS[Math.floor(Math.random() * LOAD_BGS.length)]);
  const [tip] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    if (stage >= STAGES.length) { onDone(); return; }
    const t = setTimeout(() => setStage((s) => s + 1), STAGES[stage]);
    const s = stage === 1 ? setTimeout(() => setSupport(true), 4000) : undefined;
    return () => { clearTimeout(t); if (s) clearTimeout(s); };
  }, [stage, onDone]);

  return <div className="studio-intro" role="presentation">
    {stage === 0 && <div key="logo" className="intro-slide intro-logo-slide">
      <div className="intro-logo-wrap"><img src={logo} alt="Crossian Games" className="intro-logo" /><span className="intro-shine" /></div>
      <p className="intro-dedication">Crosian Game Production</p>
    </div>}
    {stage === 1 && <div key="disc" className="intro-slide intro-bg-slide" style={{ backgroundImage: `url(${disclaimerBg})` }}>
      <div className="intro-text-box">
        <h2>Disclaimer</h2>
        <p>President: Rise to Power is a work of fiction made for entertainment only. Any resemblance to real persons, parties or events is coincidental.</p>
        {support && <p className="intro-support">Support the project by reporting bugs you find and sharing your suggestions to help improve the game.</p>}
      </div>
    </div>}
    {stage === 2 && <div key="cred" className="intro-slide intro-bg-slide" style={{ backgroundImage: `url(${bg})` }}>
      <div className="intro-loader"><p>{TIPS[tip]}</p><div className="intro-bar"><span /></div></div>
    </div>}
  </div>;
}
