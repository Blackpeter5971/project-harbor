import type { Career } from './career';
import { shiftApproval } from './approval';
import type { CareerEffect } from './story-engine';

/**
 * Story career effects (Phase 3 election integration).
 * Applies the real-game consequences declared on story choices through the
 * existing approval/campaign systems, so previews match actual gains and the
 * story engine itself stays cycle-free. Called once per resolved choice by
 * the UI, guarded by applyStoryChoice's queued-event replay guard.
 */

const clampRep = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function applyStoryCareerEffects(career: Career, fx: CareerEffect): Career {
  let c = career;
  if (fx.reputation) c = { ...c, reputation: clampRep(c.reputation + fx.reputation) };
  if (fx.approval) c = shiftApproval(c, fx.approval, 'Story decision');
  if (fx.momentum && c.campaign) {
    c = { ...c, campaign: { ...c.campaign, momentum: r1(c.campaign.momentum + fx.momentum) } };
  }
  return c;
}
