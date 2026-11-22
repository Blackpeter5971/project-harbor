import { describe, it, expect } from 'vitest';
import { clampPortrait, formatStoryText, portraitsForSex } from '@/lib/game/story-text';
describe('story portraits', () => {
  it('filters by identity', () => {
    expect(portraitsForSex('Male')).toEqual([0, 1, 2]);
    expect(portraitsForSex('Female')).toEqual([3, 4, 5]);
    expect(portraitsForSex('Custom')).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('clamps on toggle', () => {
    expect(clampPortrait('Female', 1)).toBe(3);
    expect(clampPortrait('Male', 4)).toBe(0);
    expect(clampPortrait('Custom', 4)).toBe(4);
  });
});
describe('formatStoryText', () => {
  const c = (name: string) => ({ name, sex: 'Female' as const });
  it('fills full, first and last names', () => {
    expect(formatStoryText('{title} {lastName}, {firstName} / {name}', c('ada mary lovelace'))).toBe('Senator Lovelace, Ada / Ada Mary Lovelace');
  });
  it('single word name', () => { expect(formatStoryText('{firstName} {lastName}', c('Cher'))).toBe('Cher Cher'); });
  it('hyphenated', () => { expect(formatStoryText('{lastName}', c('jo smith-jones'))).toBe('Smith-Jones'); });
});
