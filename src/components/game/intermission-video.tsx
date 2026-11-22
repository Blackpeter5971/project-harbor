import { useState } from 'react';

/** Short public-domain U.S. Government loops (Wikimedia Commons), trimmed and bundled in public/videos so they play offline. */
const ACT_CLIPS: Record<number, string> = {
  1: '/videos/story-act1.mp4', // Capitol dome
  2: '/videos/story-act2.mp4', // Rotunda time-lapse
  3: '/videos/story-act3.mp4', // White House press conference
  4: '/videos/story-act4.mp4', // Election night
};

/** Plays the bundled atmospheric loop behind the intermission; falls back silently to the still backdrop on error. */
export function IntermissionVideo({ act }: { act: number }) {
  const [state, setState] = useState<'loading' | 'playing' | 'failed'>('loading');
  const src = ACT_CLIPS[act] ?? ACT_CLIPS[1]!;
  if (state === 'failed') return null;
  return (
    <video key={act} className={`intermission-video ${state === 'playing' ? 'is-playing' : ''}`} src={src}
      autoPlay muted loop playsInline preload="auto" aria-hidden
      onPlaying={() => setState('playing')} onError={() => setState('failed')} />
  );
}
