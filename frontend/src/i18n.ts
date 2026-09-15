import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import de from './locales/de.json';
import { editorTranslations } from './locales/editorTranslations';

const savedLanguage = typeof localStorage === 'undefined' ? 'en' : localStorage.getItem('language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, ...editorTranslations.en } },
      ru: { translation: { ...ru, ...editorTranslations.ru } },
      ja: { translation: { ...ja, ...editorTranslations.ja } },
      zh: { translation: { ...zh, ...editorTranslations.zh } },
      de: { translation: { ...de, ...editorTranslations.de } },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('language', lng);
  }
});

export default i18n;
