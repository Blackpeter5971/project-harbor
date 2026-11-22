import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { socialOf } from '@/lib/game/social-media';
import { scandalSchema } from '@/lib/game/scandal-schema';
import { crisisSchema } from '@/lib/game/crisis-schema';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { mediaStories } from '@/lib/game/media-outlets';
import { hubInvitations, answerInvitation, declineInvitation, invitationBlock } from '@/lib/game/media-hub';

const make = (): Career => createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);
const ok = (r: { ok: boolean; message: string; career?: Career }) => { if (!r.ok) throw new Error(r.message); return (r as { career: Career }).career; };
const mayor = (c: Career): Career => ({ ...c, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'City of Testville', since: c.date, party: 'Independent', elected: c.date, termEnd: '2032-01-01', margin: 5 }, publicOffice: true });
const bill = (date: string) => ({ id: 'b1', tenure: 't', title: 'Clean Streets Act', kind: 'ordinance', policy: 'services', stage: 'passed', date, cost: 0, history: [{ date, text: 'Signed.' }] }) as unknown as Career['bills'][number];
const withBill = (c: Career, date = c.date): Career => ({ ...c, bills: [bill(date)] });
const later = (c: Career, months: number): Career => { const d = new Date(`${c.date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return { ...c, date: d.toISOString().slice(0, 10), actions: 75 }; };

describe('grounded invitations', () => {
  it('no outlet calls when nothing newsworthy has happened', () => {
    expect(hubInvitations(make())).toEqual([]);
    expect(hubInvitations(mayor(make()))).toEqual([]);
  });
  it('a recently passed bill brings TV, radio and newspaper requests about that bill', () => {
    const inv = hubInvitations(withBill(mayor(make())));
    expect(new Set(inv.map(i => i.channel))).toEqual(new Set(['tv', 'radio', 'newspaper']));
    expect(inv.every(i => i.story.kind === 'bill' && i.story.title.includes('Clean Streets Act'))).toBe(true);
  });
  it('a bill passed more than six months ago is no longer news', () => {
    const c = withBill(mayor(make()));
    expect(hubInvitations(later(c, 6)).length).toBeGreaterThan(0);
    expect(hubInvitations(later(c, 9))).toEqual([]);
  });
  it('an active scandal draws requests; once managed it does not', () => {
    const base = make();
    const scandal = scandalSchema.parse({ id: 's1', tenure: 't', date: base.date, subject: 'Ada', allegation: 'Missing receipts', status: 'alleged', title: 'Missing receipts', phase: 'Active' });
    expect(hubInvitations({ ...base, scandals: [scandal] }).some(i => i.story.kind === 'scandal')).toBe(true);
    expect(hubInvitations({ ...base, scandals: [{ ...scandal, phase: 'Managed' }] })).toEqual([]);
  });
  it('an economic crisis is an economic story and a campaign brings a televised debate', () => {
    const base = mayor(make());
    const crisis = crisisSchema.parse({ id: 'x1', type: 'economic', title: 'Factory closures', description: 'Jobs lost', jurisdiction: 'city', severity: 2, status: 'active', turnCreated: base.date, durationRemaining: 2 });
    expect(mediaStories({ ...base, crises: [crisis] })[0]?.kind).toBe('economy');
    const racing = { ...make(), campaign: { title: 'Mayor', jurisdiction: 'Testville', phase: 'General', opponents: [] } as unknown as Career['campaign'] };
    expect(hubInvitations(racing).find(i => i.channel === 'tv')?.format).toBe('debate');
  });
});

describe('answering invitations', () => {
  it('costs one action, builds communication, shifts groups and cannot be replayed', () => {
    const c = withBill(mayor(make()));
    const inv = hubInvitations(c).find(i => i.channel === 'radio')!;
    const n = ok(answerInvitation(c, inv.id, 'bold'));
    expect(n.actions).toBe(c.actions - 15);
    expect(n.skills.communication).toBeGreaterThan(c.skills.communication);
    expect(supportGroupsOf(n).history[0]?.reason).toContain(inv.outlet.name);
    expect(socialOf(n).broadcastHistory[0]?.kind).toBe('radio');
    expect(answerInvitation(n, inv.id, 'bold').ok).toBe(false);
    expect(hubInvitations(n).some(i => i.id === inv.id)).toBe(false);
  });
  it('changes approval only for officeholders', () => {
    const citizen = withBill(make());
    const inv = hubInvitations(citizen).find(i => i.channel === 'newspaper')!;
    expect(ok(answerInvitation(citizen, inv.id, 'safe')).approval).toEqual(citizen.approval);
    const official = withBill(mayor(make()));
    const inv2 = hubInvitations(official).find(i => i.channel === 'newspaper')!;
    const after = ok(answerInvitation(official, inv2.id, 'risky'));
    expect(after.approval?.history[0]?.reason).toContain(inv2.outlet.name);
    const before = (official.approval ?? { overall: after.approval!.overall - after.approval!.history[0]!.change }).overall;
    expect(Math.abs(after.approval!.overall - before)).toBeLessThanOrEqual(1);
  });
  it('allows one appearance per channel each quarter', () => {
    const scandal = scandalSchema.parse({ id: 's1', tenure: 't', date: make().date, subject: 'Ada', allegation: 'x', status: 'alleged', phase: 'Active' });
    const c = { ...withBill(mayor(make())), scandals: [scandal] };
    const tv = hubInvitations(c).filter(i => i.channel === 'tv');
    expect(tv.length).toBeGreaterThan(1);
    const n = ok(answerInvitation(c, tv[0]!.id, 'safe'));
    expect(invitationBlock(n, tv[1]!)).toMatch(/already/);
    const next = later(n, 3), again = hubInvitations(next).find(i => i.channel === 'tv' && i.story.id === tv[1]!.story.id)!;
    expect(invitationBlock(next, again)).toBeNull();
  });
  it('declining is free and the outlet stops asking about that story', () => {
    const c = withBill(mayor(make()));
    const inv = hubInvitations(c).find(i => i.channel === 'tv')!;
    const n = ok(declineInvitation(c, inv.id));
    expect(n.actions).toBe(c.actions);
    expect(hubInvitations(n).some(i => i.channel === 'tv')).toBe(false);
  });
  it('answered invitations survive save and reload; older saves load without hub fields', () => {
    const c = withBill(mayor(make()));
    const inv = hubInvitations(c).find(i => i.channel === 'newspaper')!;
    const loaded = parseCareer(JSON.stringify(ok(answerInvitation(c, inv.id, 'safe'))))!;
    expect(hubInvitations(loaded).some(i => i.id === inv.id)).toBe(false);
    const raw = JSON.parse(JSON.stringify({ ...c, socialMedia: socialOf(c) }));
    delete raw.socialMedia.hubAnswered; delete raw.socialMedia.hubUsed;
    expect(socialOf(parseCareer(JSON.stringify(raw))!).hubAnswered).toEqual([]);
  });
});

describe('invitation expiry', () => {
  it('unanswered invitations disappear once the quarter ends', async () => {
    const { expireInvitations } = await import('@/lib/game/media-hub');
    const c = withBill(mayor(make()));
    expect(hubInvitations(c).length).toBeGreaterThan(0);
    expect(hubInvitations(expireInvitations(c, later(c, 3)))).toEqual([]);
  });
});

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MediaSpringboard } from '@/components/game/media-springboard';
import { mailTurn, unreadMail, dispatchOf, markRead, replyMail, toggleStar, toggleArchive, magazineTurn, kioskOf, interviewOffer, answerInterview, unseenMagazines, markCoversSeen, eligibleKinds } from '@/lib/game/dispatch';

const board = (c: Career) => render(createElement(MediaSpringboard, { career: c, tab: 's', onTab: () => {}, onUpdate: () => {}, onNotice: () => {}, socialEntry: 'home' }));
const badgeOf = (label: string) => screen.getByRole('button', { name: `Open ${label}` }).querySelector('.app-badge')?.textContent ?? '0';

describe('Dispatch mail', () => {
  const concern = () => { const c = make(); if (!c.life) throw new Error('Missing life'); return { ...c, life: { ...c.life, medicalDebt: 800 } }; };
  it('delivers contextual letters once per turn', () => {
    const c = mailTurn(concern(), '2026-01-01');
    const n = dispatchOf(c).items.length;
    expect(n).toBeGreaterThan(0);
    expect(dispatchOf(mailTurn(c, '2026-01-01')).items.length).toBe(n);
    expect(eligibleKinds(mayor(make()))).toEqual([]);
    expect(eligibleKinds(concern())).toEqual(['personal']);
  });
  it('a reply applies its effect once', () => {
    const c = mailTurn(concern(), '2026-01-01');
    const item = dispatchOf(c).items[0]; if (!item) throw new Error('Missing mail'); const id = item.id;
    const r = replyMail(c, id, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(replyMail(r.career, id, 0).ok).toBe(false);
  });
  it('star and archive move mail between tabs and archived mail is not unread', () => {
    const c = mailTurn(concern(), '2026-01-01');
    const item = dispatchOf(c).items[0]; if (!item) throw new Error('Missing mail'); const id = item.id;
    expect(dispatchOf(toggleStar(c, id)).items[0]?.starred).toBe(true);
    expect(unreadMail(toggleArchive(c, id))).toBe(unreadMail(c) - 1);
  });
  it('unread count syncs with the Mail icon badge', () => {
    const c = mailTurn(concern(), '2026-01-01');
    const { unmount } = board(c);
    expect(badgeOf('Mail')).toBe(String(unreadMail(c)));
    unmount();
    let read = c; for (const m of dispatchOf(c).items) read = markRead(read, m.id);
    board(read);
    expect(badgeOf('Mail')).toBe('0');
  });
});

describe('Magazines', () => {
  it('awards each cover once as reputation grows', () => {
    const c = { ...make(), reputation: 55 };
    const r = magazineTurn(c);
    expect(kioskOf(r.career).covers.map(x => x.id)).toEqual(['rising', 'visionary']);
    expect(magazineTurn(r.career).notices).toEqual([]);
  });
  it('exclusive interviews need 60 reputation, once a year, and boost reputation', () => {
    expect(interviewOffer({ ...make(), reputation: 59 })).toBeNull();
    const c = { ...make(), reputation: 60, actions: 45 };
    const r = answerInterview(c, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.career.reputation).toBe(64);
    expect(r.career.actions).toBe(30);
    expect(interviewOffer(r.career)).toBeNull();
  });
  it('new covers show on the Magazines badge until viewed', () => {
    const c = magazineTurn({ ...make(), reputation: 30 }).career;
    expect(unseenMagazines(c)).toBe(1);
    const { unmount } = board(c);
    expect(badgeOf('Magazines')).toBe('1');
    unmount();
    expect(unseenMagazines(markCoversSeen(c))).toBe(0);
  });
  it('old saves load without mail or magazines', () => {
    const loaded = parseCareer(JSON.stringify(make()))!;
    expect(dispatchOf(loaded).items).toEqual([]);
    expect(kioskOf(loaded).covers).toEqual([]);
  });
});
