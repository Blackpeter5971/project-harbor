import { useSyncExternalStore } from 'react';

/** Browser-safe procedural audio. No asset files: every sound is synthesized with Web Audio. */
export const AUDIO_KEY = 'president_game_audio_settings';
export interface AudioSettings { masterVolume: number; sfxVolume: number; musicVolume: number; muted: boolean }
export const DEFAULT_AUDIO: AudioSettings = { masterVolume: 0.8, sfxVolume: 0.8, musicVolume: 0.5, muted: false };
export type SoundId = 'click' | 'chime' | 'turn' | 'gavel' | 'cash' | 'alert' | 'open' | 'close' | 'action' | 'paper'
  | 'pass' | 'fail' | 'stamp' | 'veto' | 'camera' | 'applause'
  | 'klaxon' | 'courtGavel' | 'doom' | 'relief' | 'tally' | 'victory' | 'defeat';

/** Which sound a newly shown / removed modal should make (pure, testable). */
export function modalSound(el: Element, shown: boolean): SoundId | null {
  if (!el.classList?.contains('modal-backdrop')) return null;
  if (!shown) return 'close';
  return el.classList.contains('newspaper-backdrop') ? 'paper' : 'open';
}

export const clampVolume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function parseAudioSettings(raw: string | null | undefined): AudioSettings {
  if (!raw) return { ...DEFAULT_AUDIO };
  try {
    const o = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      masterVolume: clampVolume(o.masterVolume, DEFAULT_AUDIO.masterVolume),
      sfxVolume: clampVolume(o.sfxVolume, DEFAULT_AUDIO.sfxVolume),
      musicVolume: clampVolume(o.musicVolume, DEFAULT_AUDIO.musicVolume),
      muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_AUDIO.muted,
    };
  } catch { return { ...DEFAULT_AUDIO }; }
}

/** Effective gain for sound effects (0 when muted). */
export const sfxGain = (s: AudioSettings) => (s.muted ? 0 : s.masterVolume * s.sfxVolume);

let cache: AudioSettings | null = null;
let cacheRaw: string | null | undefined;
const listeners = new Set<() => void>();

export function readAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(AUDIO_KEY); } catch { /* unavailable */ }
  if (cache && raw === cacheRaw) return cache;
  cacheRaw = raw; cache = parseAudioSettings(raw);
  return cache;
}

export function updateAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const next = parseAudioSettings(JSON.stringify({ ...readAudioSettings(), ...patch }));
  try { window.localStorage.setItem(AUDIO_KEY, JSON.stringify(next)); } catch { /* unavailable */ }
  cache = null;
  listeners.forEach(l => l());
  return next;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribe, readAudioSettings, () => DEFAULT_AUDIO);
}

// ---------- Engine ----------
let ctx: AudioContext | null = null;
const lastPlayed = new Map<SoundId, number>();

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  return ctx;
}
/** Shared context for the music player (null on server / unsupported). */
export const audioContext = () => context();

/** Call from a user gesture or after first interaction; mobile WebViews start suspended. */
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

let installed = false;
/** Installs first-gesture unlock and background suspend. Call once from useEffect. */
export function installAudioLifecycle() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const unlock = () => unlockAudio();
  const vis = () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {}); else void ctx.resume().catch(() => {});
  };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
  window.addEventListener('touchstart', unlock, opts);
  document.addEventListener('visibilitychange', vis);
  const scan = (nodes: NodeList, shown: boolean) => nodes.forEach(n => {
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const target = el.classList.contains('modal-backdrop') ? el : el.querySelector?.('.modal-backdrop');
    const id = target ? modalSound(target, shown) : null;
    if (id) playSound(id);
  });
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(records => {
    for (const r of records) { scan(r.addedNodes, true); scan(r.removedNodes, false); }
  });
  observer?.observe(document.body, { childList: true, subtree: true });
  return () => {
    installed = false;
    observer?.disconnect();
    window.removeEventListener('pointerdown', unlock, opts);
    window.removeEventListener('keydown', unlock, opts);
    window.removeEventListener('touchstart', unlock, opts);
    document.removeEventListener('visibilitychange', vis);
  };
}

function tone(c: AudioContext, out: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, peak: number, endFreq?: number) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out); o.start(start); o.stop(start + dur + 0.02);
}

function noise(c: AudioContext, out: AudioNode, start: number, dur: number, peak: number, cutoff: number) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = c.createGain(); g.gain.value = peak;
  src.connect(f).connect(g).connect(out); src.start(start);
}

const SYNTHS: Record<SoundId, (c: AudioContext, out: AudioNode, t: number) => void> = {
  click: (c, o, t) => tone(c, o, 1400, t, 0.03, 'sine', 0.35, 700),
  chime: (c, o, t) => { tone(c, o, 523.25, t, 0.5, 'sine', 0.4); tone(c, o, 783.99, t + 0.12, 0.6, 'sine', 0.35); },
  turn: (c, o, t) => { tone(c, o, 110, t, 1.1, 'sine', 0.6, 70); tone(c, o, 220, t, 0.8, 'triangle', 0.2, 140); },
  gavel: (c, o, t) => {
    for (const dt of [0, 0.16]) { tone(c, o, 180, t + dt, 0.12, 'sine', 0.7, 60); noise(c, o, t + dt, 0.06, 0.5, 1800); }
  },
  cash: (c, o, t) => { tone(c, o, 1975.5, t, 0.18, 'triangle', 0.3); tone(c, o, 2637, t + 0.08, 0.3, 'triangle', 0.3); },
  open: (c, o, t) => { noise(c, o, t, 0.12, 0.12, 2600); tone(c, o, 520, t, 0.12, 'sine', 0.18, 880); },
  close: (c, o, t) => tone(c, o, 900, t, 0.06, 'sine', 0.18, 450),
  action: (c, o, t) => { tone(c, o, 660, t, 0.07, 'triangle', 0.3); tone(c, o, 990, t + 0.06, 0.1, 'triangle', 0.22); },
  paper: (c, o, t) => { for (const dt of [0, 0.09, 0.2]) noise(c, o, t + dt, 0.14, 0.35, 3800); tone(c, o, 392, t + 0.25, 0.5, 'sine', 0.2); tone(c, o, 523.25, t + 0.35, 0.6, 'sine', 0.18); },
  // Major triad after the gavel lands.
  pass: (c, o, t) => { for (const [f, dt] of [[523.25, 0], [659.25, 0.05], [783.99, 0.1]] as const) tone(c, o, f, t + 0.4 + dt, 0.9, 'sine', 0.22); },
  // Dissonant minor second, low.
  fail: (c, o, t) => { tone(c, o, 220, t + 0.4, 0.9, 'triangle', 0.22, 200); tone(c, o, 233.08, t + 0.4, 0.9, 'triangle', 0.18, 210); },
  // Paper slide then ink stamp thump.
  stamp: (c, o, t) => { noise(c, o, t, 0.18, 0.18, 3200); tone(c, o, 140, t + 0.2, 0.14, 'sine', 0.8, 55); noise(c, o, t + 0.2, 0.05, 0.4, 900); },
  // Hard double stamp, lower and harsher.
  veto: (c, o, t) => { for (const dt of [0, 0.14]) { tone(c, o, 95, t + dt, 0.16, 'square', 0.3, 45); noise(c, o, t + dt, 0.06, 0.55, 700); } },
  // Shutter click + flash whine.
  camera: (c, o, t) => { noise(c, o, t, 0.025, 0.6, 6000); noise(c, o, t + 0.07, 0.03, 0.5, 5000); tone(c, o, 3200, t + 0.1, 0.35, 'sine', 0.05, 5200); },
  // Crowd swell from layered filtered noise bursts.
  applause: (c, o, t) => { for (let i = 0; i < 14; i++) noise(c, o, t + i * 0.07, 0.25, 0.08 + 0.12 * Math.sin((i / 13) * Math.PI), 2400 + (i % 3) * 600); },
  // Urgent alternating teletype/klaxon pulse.
  klaxon: (c, o, t) => { for (let i = 0; i < 6; i++) tone(c, o, i % 2 ? 587.33 : 783.99, t + i * 0.18, 0.15, 'square', 0.12); },
  // Heavy triple gavel.
  courtGavel: (c, o, t) => { for (const dt of [0, 0.32, 0.64]) { tone(c, o, 150, t + dt, 0.18, 'sine', 0.85, 50); noise(c, o, t + dt, 0.07, 0.6, 1500); } },
  // Low descending minor brass, after the gavel.
  doom: (c, o, t) => { const s = t + 1; tone(c, o, 146.83, s, 1.3, 'sawtooth', 0.14, 110); tone(c, o, 174.61, s, 1.3, 'sawtooth', 0.11, 130.81); tone(c, o, 73.42, s, 1.6, 'sine', 0.35, 55); },
  // Rising major sixth, warm.
  relief: (c, o, t) => { const s = t + 1; tone(c, o, 392, s, 0.6, 'sine', 0.28); tone(c, o, 493.88, s + 0.15, 0.6, 'sine', 0.26); tone(c, o, 659.25, s + 0.3, 1, 'sine', 0.26); },
  // Heartbeat while ballots are tallied.
  tally: (c, o, t) => { for (let i = 0; i < 4; i++) { tone(c, o, 60, t + i * 0.42, 0.12, 'sine', 0.8, 40); tone(c, o, 55, t + i * 0.42 + 0.14, 0.12, 'sine', 0.55, 38); } },
  // Brass fanfare after the tally.
  victory: (c, o, t) => { const s = t + 1.8; for (const [f, dt, d] of [[392, 0, 0.18], [523.25, 0.2, 0.18], [659.25, 0.4, 0.18], [783.99, 0.6, 1.1]] as const) { tone(c, o, f, s + dt, d, 'sawtooth', 0.12); tone(c, o, f / 2, s + dt, d, 'triangle', 0.15); } for (const f of [523.25, 659.25, 783.99]) tone(c, o, f, s + 0.6, 1.2, 'sine', 0.12); },
  // Somber falling brass after the tally.
  defeat: (c, o, t) => { const s = t + 1.8; for (const [f, dt] of [[311.13, 0], [261.63, 0.5], [196, 1]] as const) { tone(c, o, f, s + dt, 0.8, 'sawtooth', 0.11); tone(c, o, f / 2, s + dt, 0.9, 'sine', 0.22); } },
  alert: (c, o, t) => { tone(c, o, 196, t, 0.7, 'sawtooth', 0.18); tone(c, o, 233.08, t, 0.7, 'sawtooth', 0.14); tone(c, o, 146.83, t + 0.35, 0.9, 'sawtooth', 0.16); },
};

/** Plays a synthesized effect. Silent when muted, on the server, or without Web Audio. */
export function playSound(id: SoundId) {
  const gain = sfxGain(readAudioSettings());
  if (gain <= 0) return;
  const c = context(); if (!c) return;
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? -Infinity) < 50) return;
  lastPlayed.set(id, now);
  if (c.state === 'suspended') void c.resume().catch(() => {});
  const master = c.createGain(); master.gain.value = gain; master.connect(c.destination);
  try { SYNTHS[id](c, master, c.currentTime + 0.01); } catch { /* ignore */ }
}

export const playClick = () => playSound('click');
export const playChime = () => playSound('chime');
export const playTurnAdvance = () => playSound('turn');
export const playGavel = () => playSound('gavel');
export const playCash = () => playSound('cash');
export const playAlert = () => playSound('alert');
