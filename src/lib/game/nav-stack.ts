/** Browser-safe back-navigation history for the career screen. Never saved, so old saves are unaffected. */
export type NavLoc = { section: string; sub: string; politicsPanel: string; jobId: string | null; businessId?: string | null; lifePanel: string; socialEntry: string; mediaTab?: string };
export const NAV_LIMIT = 50;
export const sameLoc = (a: NavLoc, b: NavLoc) => a.section === b.section && a.sub === b.sub && a.politicsPanel === b.politicsPanel && a.jobId === b.jobId && (a.businessId ?? null) === (b.businessId ?? null) && a.lifePanel === b.lifePanel && a.socialEntry === b.socialEntry && (a.mediaTab ?? '') === (b.mediaTab ?? '');
/** Record the screen being left. Repeat pushes within one click (same screen) are ignored. */
export function pushLoc(stack: NavLoc[], from: NavLoc): NavLoc[] {
  const top = stack[stack.length - 1];
  if (top && sameLoc(top, from)) return stack;
  return [...stack, from].slice(-NAV_LIMIT);
}
/** Previous screen, or null when the player is at the root and back should open the main menu. */
export function popLoc(stack: NavLoc[]): { stack: NavLoc[]; to: NavLoc | null } {
  if (!stack.length) return { stack, to: null };
  return { stack: stack.slice(0, -1), to: stack[stack.length - 1]! };
}
