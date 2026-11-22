import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { playSound, updateAudioSettings, useAudioSettings, type AudioSettings, type SoundId } from '@/lib/game/audio';

const SLIDERS: { key: 'masterVolume' | 'sfxVolume' | 'musicVolume'; label: string }[] = [
  { key: 'masterVolume', label: 'Master volume' },
  { key: 'sfxVolume', label: 'Sound effects' },
  { key: 'musicVolume', label: 'Music' },
];
const TESTS: { id: SoundId; label: string }[] = [
  { id: 'click', label: 'Click' }, { id: 'chime', label: 'Chime' }, { id: 'turn', label: 'Next turn' },
  { id: 'gavel', label: 'Gavel' }, { id: 'cash', label: 'Cash' }, { id: 'alert', label: 'Alert' },
  { id: 'stamp', label: 'Sign' }, { id: 'veto', label: 'Veto' }, { id: 'camera', label: 'Camera' },
  { id: 'applause', label: 'Applause' }, { id: 'pass', label: 'Bill passes' }, { id: 'fail', label: 'Bill fails' },
  { id: 'klaxon', label: 'Crisis' }, { id: 'courtGavel', label: 'Verdict' }, { id: 'doom', label: 'Convicted' },
  { id: 'relief', label: 'Cleared' }, { id: 'victory', label: 'Victory' }, { id: 'defeat', label: 'Defeat' },
];

/** Audio & Sound preferences, saved on this device. */
export function AudioSettingsModal({ onClose }: { onClose: () => void }) {
  const s = useAudioSettings();
  const set = (patch: Partial<AudioSettings>) => updateAudioSettings(patch);
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="audio-title" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2 id="audio-title">Audio &amp; Sound</h2></div>
      <div className="flex flex-col gap-5 py-2">
        <label className="flex items-center justify-between gap-3">
          <span>Mute all sound</span>
          <Switch checked={s.muted} onCheckedChange={muted => { set({ muted }); if (!muted) playSound('chime'); }} aria-label="Mute all sound" />
        </label>
        {SLIDERS.map(({ key, label }) => <div key={key} className="flex flex-col gap-2">
          <div className="flex justify-between text-sm"><span>{label}</span><span className="text-muted-foreground">{Math.round(s[key] * 100)}%</span></div>
          <Slider aria-label={label} min={0} max={100} step={5} value={[Math.round(s[key] * 100)]} disabled={s.muted}
            onValueChange={([v]) => set({ [key]: (v ?? 0) / 100 })} onValueCommit={() => key !== 'musicVolume' && playSound('click')} />
        </div>)}
        <p className="text-xs text-muted-foreground">Music arrives in a later update.</p>
        <div>
          <p className="mb-2 text-sm">Test sounds</p>
          <div className="grid grid-cols-3 gap-2">
            {TESTS.map(t => <Button key={t.id} variant="gameOutline" size="sm" disabled={s.muted} onClick={() => playSound(t.id)}>{t.label}</Button>)}
          </div>
        </div>
      </div>
      <div className="modal-actions"><Button variant="gameOutline" onClick={onClose}>Close</Button></div>
    </section>
  </div>;
}
