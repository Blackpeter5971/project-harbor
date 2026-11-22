import { describe, it, expect } from 'vitest';
import { pushLoc, popLoc, type NavLoc } from '@/lib/game/nav-stack';
const at = (section: string, extra: Partial<NavLoc> = {}): NavLoc => ({ section, sub: 'menu', politicsPanel: 'menu', jobId: null, lifePanel: 'menu', socialEntry: 'home', ...extra });
describe('back navigation stack', () => {
  it('steps back one screen at a time through submenus', () => {
    let s: NavLoc[] = [];
    s = pushLoc(s, at('Home'));
    s = pushLoc(s, at('Career & Business'));
    s = pushLoc(s, at('Career & Business', { sub: 'jobs' }));
    let r = popLoc(s); expect(r.to).toEqual(at('Career & Business', { sub: 'jobs' }));
    r = popLoc(r.stack); expect(r.to).toEqual(at('Career & Business'));
    r = popLoc(r.stack); expect(r.to).toEqual(at('Home'));
    expect(popLoc(r.stack).to).toBeNull();
  });
  it('ignores duplicate pushes from one click', () => {
    expect(pushLoc(pushLoc([], at('Life')), at('Life'))).toHaveLength(1);
  });
});
