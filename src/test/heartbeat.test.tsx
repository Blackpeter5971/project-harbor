import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { DatingApp } from '@/components/game/dating-app';
import { MediaSpringboard } from '@/components/game/media-springboard';
import {
  browseHeartBeat, emptyHeartBeat, evaluateMatch, heartBeatAction, heartBeatDateBlock, heartbeatCharm, heartbeatMatch, heartbeatOf, heartbeatProfile,
  type HeartBeatInput, type HeartBeatRequest,
} from '@/lib/game/heartbeat';
import { heartbeatSchema } from '@/lib/game/heartbeat-schema';
import { contactId } from '@/lib/game/social-events';
import { beginDating, socialOf } from '@/lib/game/relationships';

const rawMake = (over: Partial<Career> = {}): Career => ({ ...createCareer({ ...defaultDraft, name: 'Ada', background: 'Self-Made' }, () => 0), money: 50_000, ...over });
const withPref = (c: Career, preference: 'straight' | 'homosexual'): Career => ({ ...c, socialMedia: { ...c.socialMedia!, heartbeat: { ...heartbeatOf(c), preference } } });
const make = (over: Partial<Career> = {}): Career => withPref(rawMake(over), 'straight');
const ok = (r: { ok: boolean; message: string; career?: Career }) => { if (!r.ok) throw new Error(r.message); return r.career!; };
const act = (c: Career, request: HeartBeatInput) => heartBeatAction(c, { ...request, revision: heartbeatOf(c).revision });
const cid = (personId: string) => contactId(heartbeatProfile(personId)!);
const firstMatch = (c: Career) => {
  for (const p of [...browseHeartBeat(c)]) {
    const r = act(c, { type: 'decide', personId: p.id, choice: 'like' });
    if (r.ok && heartbeatOf(r.career!).matches.length) return { career: r.career!, personId: p.id };
  }
  throw new Error('Expected at least one deterministic match');
};

afterEach(cleanup);

describe('HeartBeat matching and save safety', () => {
  it('has six adult profiles with distinct details', () => {
    const all = [...browseHeartBeat(make()), ...browseHeartBeat(withPref(rawMake(), 'homosexual'))];
    expect(all).toHaveLength(6);
    expect(new Set(all.map(p => p.name)).size).toBe(6);
    expect(all.every(p => p.age >= 18 && p.interests.length >= 3 && p.traits.length >= 3)).toBe(true);
  });
  it('derives charm from communication and relationships, bounded at 100', () => {
    const c = make();
    expect(heartbeatCharm({ ...c, skills: { ...c.skills, communication: 60 }, relationships: 10 })).toBeGreaterThan(heartbeatCharm(c));
    expect(heartbeatCharm({ ...c, skills: { ...c.skills, communication: 500 }, relationships: 500 })).toBe(100);
  });
  it('matching uses age, traits and charm and cannot reroll after saving', () => {
    const c = make();
    const p = browseHeartBeat(c)[0]!;
    const before = evaluateMatch(c, p.id)!;
    expect(before.ageGap).toBe(Math.abs(c.age - p.age));
    const boosted = evaluateMatch({ ...c, skills: { ...c.skills, communication: 100 }, relationships: 30 }, p.id)!;
    expect(boosted.score).toBeGreaterThanOrEqual(before.score);
    const liked = ok(act(c, { type: 'decide', personId: p.id, choice: 'like' }));
    const saved = parseCareer(JSON.stringify(liked))!;
    expect(heartbeatOf(saved)).toEqual(heartbeatOf(liked));
    expect(act(saved, { type: 'decide', personId: p.id, choice: 'like' }).ok).toBe(false);
    expect(act({ ...saved, age: 80 }, { type: 'decide', personId: p.id, choice: 'like' }).ok).toBe(false);
  });
  it('passes persist and stale revisions cannot replay a decision', () => {
    const c = make(), p = browseHeartBeat(c)[0]!;
    const passed = ok(act(c, { type: 'decide', personId: p.id, choice: 'pass' }));
    expect(browseHeartBeat(passed).some(x => x.id === p.id)).toBe(false);
    expect(heartBeatAction(passed, { type: 'decide', personId: browseHeartBeat(passed)[0]!.id, choice: 'like', revision: 0 }).ok).toBe(false);
    expect(heartbeatOf(passed).revision).toBe(1);
  });
  it('old saves without HeartBeat load safely and null-life careers can date', () => {
    const raw = rawMake();
    expect(heartbeatOf(parseCareer(JSON.stringify(raw))!)).toEqual(emptyHeartBeat());
    expect(browseHeartBeat(raw)).toEqual([]);
    const c = make();
    expect(heartbeatSchema.parse({})).toEqual(emptyHeartBeat());
    const matched = firstMatch({ ...c, life: null });
    const dated = ok(act(matched.career, { type: 'ask-date', personId: matched.personId }));
    expect(dated.life).toBeTruthy();
  });
});

describe('HeartBeat orientation preference', () => {
  const female = (over: Partial<Career> = {}): Career => ({ ...createCareer({ ...defaultDraft, name: 'Bea', sex: 'Female', background: 'Self-Made' }, () => 0), money: 50_000, ...over });
  const genders = (c: Career) => [...new Set(browseHeartBeat(c).map(p => p.gender))];
  it('shows no profiles until a preference is chosen', () => {
    expect(browseHeartBeat(rawMake())).toEqual([]);
  });
  it('male straight and female homosexual see only women', () => {
    expect(genders(withPref(rawMake(), 'straight'))).toEqual(['female']);
    expect(genders(withPref(female(), 'homosexual'))).toEqual(['female']);
  });
  it('female straight and male homosexual see only men', () => {
    expect(genders(withPref(female(), 'straight'))).toEqual(['male']);
    expect(genders(withPref(rawMake(), 'homosexual'))).toEqual(['male']);
  });
  it('set-preference is a revision-guarded action that survives saving', () => {
    const c = rawMake();
    const r = ok(heartBeatAction(c, { type: 'set-preference', preference: 'homosexual', revision: heartbeatOf(c).revision }));
    expect(heartbeatOf(parseCareer(JSON.stringify(r))!).preference).toBe('homosexual');
    expect(heartBeatAction(r, { type: 'set-preference', preference: 'straight', revision: 0 }).ok).toBe(false);
  });
});

describe('HeartBeat chat and Circle & Family integration', () => {
  it('chat requires a match and one request sends one message plus one reply', () => {
    const c = make(), p = browseHeartBeat(c)[0]!;
    expect(act(c, { type: 'chat', personId: p.id, text: 'Hello' }).ok).toBe(false);
    const matched = firstMatch(c), before = heartbeatMatch(matched.career, matched.personId)!.messages.length;
    const chatted = ok(act(matched.career, { type: 'chat', personId: matched.personId, text: 'Hello there' }));
    expect(heartbeatMatch(chatted, matched.personId)!.messages).toHaveLength(before + 2);
    const stale = heartBeatAction(chatted, { type: 'chat', personId: matched.personId, text: 'Again', revision: 0 });
    expect(stale.ok).toBe(false);
  });
  it('Ask on a Date adds one contact and uses the existing $250 dinner mechanics', () => {
    const matched = firstMatch(make()), before = matched.career;
    const dated = ok(act(before, { type: 'ask-date', personId: matched.personId }));
    const id = cid(heartbeatOf(dated).matches.find(m => m.personId === matched.personId)!.personId);
    const contact = socialOf(dated).contacts.find(x => x.id === id)!;
    expect(contact.name).toBeTruthy();
    expect(contact.affinity).toBe(67);
    expect(dated.money).toBe(before.money - 250);
    expect(dated.actions).toBe(before.actions - 15);
    expect(dated.ledger[0]!.label).toContain('Romantic Date');
    expect(dated.life!.stress).toBe(Math.max(0, before.life!.stress - 15));
    expect(socialOf(dated).contacts.filter(x => x.id === id)).toHaveLength(1);
    expect(act(dated, { type: 'ask-date', personId: matched.personId }).ok).toBe(false);
  });
  it('an unaffordable first date is atomic', () => {
    const matched = firstMatch(make({ money: 100 })), before = matched.career;
    expect(heartBeatDateBlock(before, matched.personId)).toContain('$150');
    const failed = act(before, { type: 'ask-date', personId: matched.personId });
    expect(failed.ok).toBe(false);
    expect(before.money).toBe(100);
    expect(socialOf(before).contacts.some(x => x.id === cid(heartbeatOf(before).matches[0]!.personId))).toBe(false);
  });
  it('matched partners progress through beginDating without touching children or family state', () => {
    const matched = firstMatch(make()), personId = matched.personId, id = cid(heartbeatOf(matched.career).matches[0]!.personId);
    const child = { id: 'child-1', name: 'Ava', age: 7, supportCost: 0 };
    let c: Career = { ...matched.career, life: { ...matched.career.life!, social: { ...socialOf(matched.career), dependents: [child], familyImage: 'stable' as const } } };
    c = ok(act(c, { type: 'ask-date', personId }));
    c = { ...c, date: '2026-04-01' };
    c = ok(act(c, { type: 'ask-date', personId }));
    expect(socialOf(c).contacts.find(x => x.id === id)!.affinity).toBe(79);
    c = ok(act(c, { type: 'begin-dating', personId }));
    expect(socialOf(c).maritalStatus).toBe('dating');
    expect(socialOf(c).partner!.id).toBe(id);
    expect(socialOf(c).dependents).toEqual([child]);
    expect(socialOf(c).familyImage).toBe('stable');
    expect(socialOf(c).contacts.some(x => x.id === id)).toBe(false);
    expect(parseCareer(JSON.stringify(c))!.life!.social).toEqual(c.life!.social);
    c = { ...c, date: '2026-07-01' };
    expect(act(c, { type: 'ask-date', personId }).ok).toBe(true);
  });
  it('cannot pursue a match while committed to someone else', () => {
    const matched = firstMatch(make()), other = make();
    const romantic = { id: 'contact-romantic', archetypeId: 'romantic' as const, name: 'Existing Partner', role: 'Partner', affinity: 90, status: 'close' as const, portrait: '/images/characters/romantic.jpg' };
    const withContact = { ...other, life: { ...other.life!, social: { ...socialOf(other), contacts: [romantic] } } };
    const dating = ok(beginDating(withContact, romantic.id));
    const c = { ...matched.career, life: dating.life };
    expect(heartBeatDateBlock(c, matched.personId)).toBe('You are already in a relationship.');
    expect(act(c, { type: 'ask-date', personId: matched.personId }).ok).toBe(false);
    expect(socialOf(c).partner!.name).toBe('Existing Partner');
  });
});

describe('HeartBeat phone UI', () => {
  it('opens from Media, likes a profile and opens its direct chat', () => {
    const c = make();
    const requests: HeartBeatRequest[] = [];
    const view = render(<MediaSpringboard career={c} tab="s" onTab={() => {}} onUpdate={() => {}} onNotice={() => {}} socialEntry="home" onHeartBeatRequest={r => requests.push(r)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open HeartBeat' }));
    expect(screen.getByRole('article')).toBeTruthy();
    const name = browseHeartBeat(c)[0]!.name;
    fireEvent.click(screen.getByRole('button', { name: `Like ${name}` }));
    expect(requests[0]).toMatchObject({ type: 'decide', personId: browseHeartBeat(c)[0]!.id, choice: 'like', revision: 0 });
    const matched = ok(act(c, { type: 'decide', personId: browseHeartBeat(c)[0]!.id, choice: 'like' }));
    view.rerender(<MediaSpringboard career={matched} tab="s" onTab={() => {}} onUpdate={() => {}} onNotice={() => {}} socialEntry="home" onHeartBeatRequest={r => requests.push(r)} />);
    if (heartbeatOf(matched).matches.length) expect(screen.getByRole('region', { name: `Chat with ${name}` })).toBeTruthy();
  });
  it('shows photo, age, profession, bio, interests and personality tags', () => {
    const c = make(), p = browseHeartBeat(c)[0]!;
    render(<DatingApp career={c} onRequest={() => {}} />);
    expect(screen.getByRole('img', { name: `${p.name}, ${p.role}` })).toBeTruthy();
    expect(screen.getByRole('heading', { name: `${p.name}, ${p.age}` })).toBeTruthy();
    expect(screen.getByText(p.bio)).toBeTruthy();
    for (const tag of [...p.interests, ...p.traits]) expect(screen.getByText(tag)).toBeTruthy();
  });
  it('sends a revisioned chat request from the conversation', () => {
    const matched = firstMatch(make()), p = heartbeatOf(matched.career).matches[0]!.personId;
    const c = { ...matched.career, socialMedia: { ...matched.career.socialMedia!, heartbeat: { ...heartbeatOf(matched.career), decisions: heartbeatOf(matched.career).decisions.filter(d => d.personId !== p) } } };
    const onRequest = vi.fn();
    render(<DatingApp career={c} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('tab', { name: /Matches/ }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Open chat with`) }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Would you like to meet?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(onRequest).toHaveBeenCalledWith({ type: 'chat', personId: p, text: 'Would you like to meet?', revision: heartbeatOf(c).revision });
  });
});
