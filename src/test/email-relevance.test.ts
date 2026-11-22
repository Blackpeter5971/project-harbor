import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { mailTurn, dispatchOf, deleteMail, replyMail } from '@/lib/game/dispatch';
import { socialOf } from '@/lib/game/social-media';
const base = () => createCareer({ ...defaultDraft, name: 'Email Player', party: 'Democrat' });
describe('Relevant email only', () => {
  it('sends no filler to civilians, party members or officeholders without a real trigger', () => {
    const c = base();
    expect(dispatchOf(mailTurn(c, c.date)).items).toHaveLength(0);
    expect(dispatchOf(mailTurn({ ...c, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'City', since: c.date, party: 'Democrat', elected: c.date, termEnd: '2030-01-01', margin: 5 } }, c.date)).items).toHaveLength(0);
  });
  it('removes old family and generic mail from saved inboxes and badges', () => {
    const c = base();
    const old = { ...c, socialMedia: { ...socialOf(c), dispatch: { lastTurn: '', sent: [], items: [{ id: 'old-family', date: c.date, kind: 'personal' as const, from: 'Mom', subject: 'Proud of you', body: 'Dinner?', tag: 'Personal' as const, read: false, starred: true, archived: false, replied: null, template: 0 }] } } };
    expect(dispatchOf(old).items).toHaveLength(0);
    expect(replyMail(old, 'old-family', 0).ok).toBe(false);
  });
  it('grounds financial mail in a real balance and never resends it after deletion or reload', () => {
    const c = base(); if (!c.life) throw new Error('Missing life');
    const input = { ...c, life: { ...c.life, medicalDebt: 1200 } };
    const delivered = mailTurn(input, c.date), item = dispatchOf(delivered).items[0];
    if (!item) throw new Error('Missing contextual mail');
    expect(item.context?.type).toBe('health'); expect(item.body).toContain('1,200');
    const deleted = deleteMail(delivered, [item.id]);
    const reloaded = parseCareer(JSON.stringify(deleted)); if (!reloaded) throw new Error('Save invalid');
    expect(dispatchOf(mailTurn({ ...reloaded, date: '2026-04-01' }, '2026-04-01')).items).toHaveLength(0);
  });
});