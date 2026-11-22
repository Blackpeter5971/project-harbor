import type { Career } from './career';
import { latestPoll, type Campaign } from './campaign';
import { handleOf } from './social-media';
import { weakSpots } from './rival-pressure';

/**
 * Rival candidates as live social accounts. Everything here is derived from the saved
 * campaign state (polls, endorsements, attack ads, support and momentum) plus a
 * deterministic hash of the turn date, so no extra save fields are needed and a
 * save/load cycle reproduces the exact same feed. Pure and browser-safe.
 */
const hash = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const pick = <T,>(list: readonly T[], seed: string): T => list[Math.floor(hash(seed) * list.length) % list.length]!;
const tag = (name: string) => '@' + name.replace(/[^a-z]/gi, '').toLowerCase();

export interface RivalPost {
  id: string; date: string; author: string; handle: string; verified: boolean;
  text: string; likes: number; reposts: number; replies: number; views: number; portrait: number;
}

export const activeRivals = (camp: Campaign) => camp.opponents.filter(o => !o.out && (camp.phase === 'primary' ? o.primary : !o.primary));

/** Posts the rivals published this turn, tied to the real state of the race. */
export function rivalFeedItems(c: Career): RivalPost[] {
  const camp = c.campaign;
  if (!camp) return [];
  const me = c.character.name, h = handleOf(c), poll = latestPoll(camp);
  const myShare = poll?.shares[me] ?? 0;
  const raceTag = camp.title.replace(/[^a-z]/gi, '');
  const out: RivalPost[] = [];
  activeRivals(camp).slice(0, 3).forEach((x, i) => {
    const seed = `${me}|${c.date}|${x.name}`;
    const their = poll?.shares[x.name] ?? 0;
    const leading = their > myShare;
    const leak = camp.rivalPressure?.lastLeak;
    const spot = weakSpots(c)[0];
    const text = leak && leak.rival === x.name && leak.date === c.date
      ? pick([`What ${h} doesn't want you to see: ${leak.charge}. The documents are public now. #${raceTag}`, `We did the research. ${h}'s record includes ${leak.charge}. ${camp.jurisdiction} deserves better. #${raceTag}`], seed)
      : camp.attack === x.name
      ? spot
        ? pick([`${h} wants to lead ${camp.jurisdiction} after ${spot.charge}? Our new ad lays it out. #${raceTag}`, `Ask ${h} about ${spot.charge}. Then watch them change the subject. #${raceTag}`], seed)
        : pick([`Voters deserve the truth about ${h}. Our new ad lays out the record. Watch and share. #${raceTag}`, `${h} hopes you won't look too closely at their record. We did. #${raceTag}`], seed)
      : myShare > their && hash(seed + 'heat') < 0.6
        ? pick([`Polls don't vote. ${h} has been coasting on slogans — the debate will show who has a plan. #${raceTag}`, `${h}'s lead is a mile wide and an inch deep. We're just getting started. #${raceTag}`], seed)
      : leading
        ? pick([`Latest poll has us ahead in the ${camp.title} race. ${camp.jurisdiction} is ready for real leadership. Onward! 🚀`, `Momentum is with us. ${their}% and climbing — thank you, ${camp.jurisdiction}!`], seed)
        : pick([`We're closing the gap in the ${camp.title} race. ${myShare > their ? `${myShare}% won't hold.` : 'Every door matters.'} Join us Saturday. #${raceTag}`, `My plan: "${x.policy}". ${h} offers slogans. ${camp.jurisdiction} deserves substance.`], seed);
    const likes = Math.round((60 + Math.max(0, x.support) * 30 + Math.max(0, x.momentum) * 20) * (0.7 + hash(seed + 'l') * 0.6));
    out.push({ id: `rv-${c.date}-${i}`, date: c.date, author: x.name, handle: tag(x.name), verified: true, text, likes, reposts: Math.round(likes * 0.22), replies: Math.round(likes * 0.14), views: likes * (24 + Math.round(hash(seed + 'v') * 30)), portrait: x.portrait ?? 0 });
  });
  // An endorsement lands as a celebratory rival post the same turn.
  const fresh = camp.endorsements.filter(e => e.candidate !== me).slice(-1)[0];
  const endorsee = fresh && activeRivals(camp).find(x => x.name === fresh.candidate);
  if (fresh && endorsee) {
    const seed = `${me}|${c.date}|endorse`;
    const likes = Math.round(150 + hash(seed) * 600);
    out.push({ id: `rv-${c.date}-end`, date: c.date, author: endorsee.name, handle: tag(endorsee.name), verified: true, text: `Honored to be endorsed by ${fresh.group.replace(/-/g, ' ')}. Together we will win the ${camp.title} race. #${raceTag}`, likes, reposts: Math.round(likes * 0.3), replies: Math.round(likes * 0.1), views: likes * 30, portrait: endorsee.portrait ?? 0 });
  }
  return out;
}

export interface ProfileInfo {
  name: string; handle: string; verified: boolean; bio: string; location: string;
  followers: number; following: number; portrait: number | null; posts: RivalPost[];
}

/** Public profile for any feed author. Rivals get their real campaign identity. */
export function profileFor(c: Career, name: string): ProfileInfo {
  const camp = c.campaign;
  const rival = camp?.opponents.find(o => o.name === name);
  if (rival && camp) {
    return {
      name, handle: tag(name), verified: true,
      bio: `${rival.bio} · ${rival.party} candidate for ${camp.title}. “${rival.policy}.”`,
      location: camp.jurisdiction,
      followers: Math.round(2_000 + Math.max(0, rival.support) * 900 + rival.quality * 300),
      following: 400 + Math.round(rival.quality * 10),
      portrait: rival.portrait ?? null,
      posts: rivalFeedItems(c).filter(p => p.author === name),
    };
  }
  const seed = `${c.character.name}|${name}`;
  const press = /tribune|report|watch|news|post|times/i.test(name);
  return {
    name, handle: tag(name), verified: press,
    bio: press ? `News from ${c.character.state} and beyond.` : `${c.character.state} resident. Opinions my own.`,
    location: c.character.state,
    followers: Math.round(200 + hash(seed + 'f') * (press ? 40_000 : 4_000)),
    following: Math.round(100 + hash(seed + 'g') * 900),
    portrait: null,
    posts: [],
  };
}
