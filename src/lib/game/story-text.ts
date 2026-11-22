/** Pure Story Mode text helpers: gender-filtered portraits and player-name tokens. */
export type StorySex = 'Male' | 'Female' | 'Custom';

const MALE = [0, 1, 2] as const;
const FEMALE = [3, 4, 5] as const;
const ALL = [0, 1, 2, 3, 4, 5] as const;

export function portraitsForSex(sex: StorySex): readonly number[] {
  return sex === 'Male' ? MALE : sex === 'Female' ? FEMALE : ALL;
}

/** Keeps the current portrait if allowed, otherwise the first valid one for that identity. */
export function clampPortrait(sex: StorySex, portrait: number): number {
  const list = portraitsForSex(sex);
  return list.includes(portrait) ? portrait : list[0]!;
}

const cap = (w: string) => w.split('-').map(p => p ? p[0]!.toUpperCase() + p.slice(1) : p).join('-');

export function formatStoryText(text: string, character: { name: string; sex: StorySex }, title = 'Senator'): string {
  if (!text || !text.includes('{')) return text;
  const words = character.name.trim().split(/\s+/).filter(Boolean).map(cap);
  const full = words.join(' ') || 'Senator';
  const first = words[0] ?? full;
  const last = words.length > 1 ? words[words.length - 1]! : first;
  return text.replace(/\{(name|fullName|firstName|lastName|title)\}/g, (_, k: string) =>
    k === 'firstName' ? first : k === 'lastName' ? last : k === 'title' ? title : full);
}
