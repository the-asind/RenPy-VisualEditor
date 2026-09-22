import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import de from './locales/de.json';
import { editorTranslations } from './locales/editorTranslations';
import landingEn from './locales/landing.en.json';
import landingRu from './locales/landing.ru.json';
import landingDe from './locales/landing.de.json';
import landingJa from './locales/landing.ja.json';
import landingZh from './locales/landing.zh.json';

const supportedLanguages = ['en', 'ru', 'ja', 'zh', 'de'];
const routeLanguage = typeof window === 'undefined' ? null : (
  window.location.pathname.match(/^\/(en|ru|ja|zh|de)(?:\/|$)/)?.[1]
  || (window.location.pathname === '/' ? 'en' : null)
);
const savedLanguage = typeof localStorage === 'undefined' ? null : localStorage.getItem('language');
const browserLanguages = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
const browserLanguage = browserLanguages.map((language) => language.split('-')[0]).find((language) => supportedLanguages.includes(language));
const initialLanguage = routeLanguage || (savedLanguage && supportedLanguages.includes(savedLanguage) ? savedLanguage : browserLanguage || 'en');

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, ...editorTranslations.en, ...landingEn } },
      ru: { translation: { ...ru, ...editorTranslations.ru, ...landingRu } },
      ja: { translation: { ...ja, ...editorTranslations.ja, ...landingJa } },
      zh: { translation: { ...zh, ...editorTranslations.zh, ...landingZh } },
      de: { translation: { ...de, ...editorTranslations.de, ...landingDe } },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('language', lng);
  }
});

export default i18n;
