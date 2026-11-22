import { audioContext, readAudioSettings, type AudioSettings } from './audio';

/** Procedural background music: no files, works fully offline on web/Android/iOS. */
export type MusicMood = 'menu' | 'office' | 'tense' | 'silent';

export const musicGain = (s: AudioSettings) => (s.muted ? 0 : s.masterVolume * s.musicVolume);

/** Pure: which mood fits the current screen. */
export function moodFor(screen: string, career: { crises?: { status: string }[]; mode?: string } | null): MusicMood {
  if (screen !== 'career' || !career) return 'menu';
  if ((career.crises ?? []).some(c => c.status !== 'resolved')) return 'tense';
  return 'office';
}

interface MoodDef { bar: number; chords: number[][]; type: OscillatorType; pulse: boolean }
const n = (semis: number) => 220 * Math.pow(2, semis / 12); // A3 based
export const MOODS: Record<Exclude<MusicMood, 'silent'>, MoodDef> = {
  // Stately anthem-like I–V–vi–IV in C
  menu: { bar: 2.6, type: 'triangle', pulse: false, chords: [[3, 7, 10, 15], [-2, 2, 5, 10], [0, 3, 7, 12], [-4, 0, 3, 8]] },
  // Calm ambient Am–F–C–G pads
  office: { bar: 4, type: 'sine', pulse: false, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
  // Low minor drone with a heartbeat pulse
  tense: { bar: 2, type: 'sawtooth', pulse: true, chords: [[-12, -5, 0], [-12, -6, 1], [-12, -5, 0], [-11, -5, 1]] },
};

let master: GainNode | null = null;
let moodGain: GainNode | null = null;
let current: MusicMood = 'silent';
let timer: ReturnType<typeof setInterval> | null = null;
let nextBar = 0; let barIdx = 0;

function schedule() {
  const c = audioContext(); if (!c || !moodGain || current === 'silent' || c.state !== 'running') return;
  const def = MOODS[current];
  while (nextBar < c.currentTime + 0.5) {
    const t = Math.max(nextBar, c.currentTime + 0.02);
    const chord = def.chords[barIdx % def.chords.length] ?? [];
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = current === 'tense' ? 500 : 1400; filter.connect(moodGain);
    for (const s of chord) {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = def.type; o.frequency.value = n(s);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6 / chord.length, t + def.bar * 0.3);
      g.gain.linearRampToValueAtTime(0, t + def.bar * 1.05);
      o.connect(g); g.connect(filter); o.start(t); o.stop(t + def.bar * 1.1);
    }
    if (def.pulse) for (const off of [0, 0.25]) {
      const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t + off); o.frequency.exponentialRampToValueAtTime(40, t + off + 0.2);
      g.gain.setValueAtTime(0.25, t + off); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.25);
      o.connect(g); g.connect(moodGain); o.start(t + off); o.stop(t + off + 0.3);
    }
    nextBar = t + def.bar; barIdx++;
  }
}

/** Apply current volume settings to the music bus. */
export function refreshMusicVolume() {
  const c = audioContext(); if (!c || !master) return;
  master.gain.setTargetAtTime(musicGain(readAudioSettings()), c.currentTime, 0.2);
}

/** Crossfade to a mood (≈1.5s). Safe to call repeatedly. */
export function setMusicMood(mood: MusicMood) {
  if (mood === current) return;
  const c = audioContext(); if (!c) return;
  try {
    if (!master) { master = c.createGain(); master.gain.value = musicGain(readAudioSettings()); master.connect(c.destination); }
    if (moodGain) { const old = moodGain; old.gain.setTargetAtTime(0, c.currentTime, 0.5); setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, 3000); }
    current = mood; barIdx = 0; nextBar = c.currentTime + 0.1;
    if (mood === 'silent') { moodGain = null; return; }
    moodGain = c.createGain(); moodGain.gain.setValueAtTime(0, c.currentTime); moodGain.gain.setTargetAtTime(1, c.currentTime, 0.5); moodGain.connect(master);
    if (!timer) timer = setInterval(schedule, 200);
  } catch { /* music is optional */ }
}

export function stopMusic() { setMusicMood('silent'); if (timer) { clearInterval(timer); timer = null; } }
