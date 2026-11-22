import { describe, it, expect } from 'vitest';
import { ENEMY_ACROSS_THE_AISLE_SCENES as S } from '@/lib/game/scenarios/enemy-across-the-aisle';
describe('Act I screenplay', () => {
  it('every Act I scene has a time/location and narration', () => {
    const a1 = S.filter(s => s.act === 1);
    expect(a1).toHaveLength(18);
    for (const s of a1) { expect(s.setting?.location).toBeTruthy(); expect(s.narration).toBeTruthy(); }
  });
  it('keeps choice ids and effects', () => {
    const sc = S.find(s => s.id === 'act1_ch1_sc1')!;
    expect(sc.choices!.map(c => c.id)).toEqual(['spar', 'concede', 'snub']);
    expect(sc.choices![0]!.effects).toEqual({ affinity: 10, momentum: 5 });
  });
});
