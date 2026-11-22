import { describe, it, expect } from 'vitest';
import { translate, readLocale, LOCALE_KEY, DICTIONARIES } from '@/lib/game/i18n';
describe('i18n', () => {
  it('stores locale under president_game_locale', () => expect(LOCALE_KEY).toBe('president_game_locale'));
  it('first launch has no locale', () => expect(readLocale({ getItem: () => null })).toBeNull());
  it('reads a saved locale and rejects unknown ones', () => {
    expect(readLocale({ getItem: () => 'fr' })).toBe('fr');
    expect(readLocale({ getItem: () => 'de' })).toBeNull();
  });
  it('translates nav tabs', () => {
    expect(translate('es', 'nav.Home')).toBe('Inicio');
    expect(translate('fr', 'nav.More')).toBe('Plus');
  });
  it('every language has every key', () => {
    for (const k of Object.keys(DICTIONARIES.en)) { expect(DICTIONARIES.es).toHaveProperty(k); expect(DICTIONARIES.fr).toHaveProperty(k); }
  });
});
