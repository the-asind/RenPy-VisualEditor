import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const loadLocale = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../locales/${code}.json`, import.meta.url), 'utf-8'));

const locales = Object.fromEntries(
  ['en', 'ru', 'de', 'ja', 'zh'].map((code) => [code, loadLocale(code)]),
);

const visibleLandingKeys = [
  'landing.demoAria',
  'landing.demoLoading',
  'landing.demoUnavailable',
  'landing.hero.description',
  'landing.hero.title',
  'landing.legal',
  'landing.login',
  'landing.storyTags.fullProject',
  'landing.storyTags.realtime',
  'mainMenu.language.change',
];

describe('landing locale copy', () => {
  it('keeps the one-canvas promise in every supported language', () => {
    expect(locales.en['landing.hero.title']).toBe('Your whole story, held on one canvas.');
    expect(locales.ru['landing.hero.title']).toBe('Вся история на одном холсте.');
    expect(locales.de['landing.hero.title']).toBe('Deine ganze Geschichte auf einer Leinwand.');
    expect(locales.ja['landing.hero.title']).toBe('物語のすべてを、ひとつのキャンバスに。');
    expect(locales.zh['landing.hero.title']).toBe('整个故事，尽在一张画布。');
  });

  it('does not leave visible German, Japanese, or Chinese landing copy as English fallback text', () => {
    for (const code of ['de', 'ja', 'zh']) {
      for (const key of visibleLandingKeys) {
        expect(locales[code][key], `${code}: ${key}`).toBeTruthy();
        expect(locales[code][key], `${code}: ${key}`).not.toBe(locales.en[key]);
      }
    }
  });

  it('does not use English fallback copy elsewhere in German, Japanese, or Chinese UI', () => {
    const intentionalSharedKeys = new Set([
      'app.title',
      'language.english',
      'language.russian',
      'language.japanese',
      'language.chinese',
      'language.german',
      'editor.nodeEditor.authorChipPrefix',
      'landing.hero.tag',
    ]);

    for (const code of ['de', 'ja', 'zh']) {
      const fallbackKeys = Object.keys(locales.en).filter(
        (key) => locales[code][key] === locales.en[key] && !intentionalSharedKeys.has(key),
      );
      expect(fallbackKeys, `${code} English fallback keys`).toEqual([]);
    }
  });
});
