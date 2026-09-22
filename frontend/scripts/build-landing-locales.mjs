import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(path.join(root, 'landing.template.html'), 'utf8');
const marketingCss = await readFile(path.join(root, 'src', 'marketing.css'), 'utf8');
const locales = ['en', 'ru', 'de', 'ja', 'zh'];
const localeNames = { en: 'English', ru: 'Русский', de: 'Deutsch', ja: '日本語', zh: '简体中文' };
const ogLocales = { en: 'en_US', ru: 'ru_RU', de: 'de_DE', ja: 'ja_JP', zh: 'zh_CN' };
const htmlLanguages = { en: 'en', ru: 'ru', de: 'de', ja: 'ja', zh: 'zh-Hans' };
const hreflangs = { en: 'en', ru: 'ru', de: 'de', ja: 'ja', zh: 'zh-Hans' };
const copies = Object.fromEntries(await Promise.all(locales.map(async (locale) => [
  locale,
  JSON.parse(await readFile(path.join(root, 'src', 'locales', `landing.${locale}.json`), 'utf8')),
])));

const escapeAttribute = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

function faqSchema(copy, pageUrl) {
  const entries = Array.from({ length: 5 }, (_, index) => {
    const question = copy[`faq${index + 1}Question`];
    const answer = copy[`faq${index + 1}Answer`].replace(/<[^>]*>/g, '');
    return { '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } };
  });
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${pageUrl}#faq`, mainEntity: entries })
    .replaceAll('<', '\\u003c');
}

function render(locale) {
  const copy = copies[locale];
  const localePath = locale === 'en' ? '/' : `/${locale}/`;
  const pageUrl = `https://plotmio.com${localePath}`;
  const alternateLinks = [
    ...locales.map((code) => `    <link rel="alternate" hreflang="${hreflangs[code]}" href="https://plotmio.com${code === 'en' ? '/' : `/${code}/`}" />`),
    '    <link rel="alternate" hreflang="x-default" href="https://plotmio.com/" />',
  ].join('\n');
  const languageOptions = locales.map((code) => {
    const pathValue = code === 'en' ? '/' : `/${code}/`;
    const selected = locale === code ? ' selected' : '';
    return `<option value="${pathValue}"${selected}>${localeNames[code]}</option>`;
  }).join('\n          ');
  const values = {
    ...copy,
    htmlLang: htmlLanguages[locale],
    pageUrl,
    ogLocale: ogLocales[locale],
    homeHref: localePath,
    alternateLinks,
    languageOptions,
    faqSchema: faqSchema(copy, pageUrl),
  };
  const used = new Set();
  const html = template.replace(/\{\{\{([\w.]+)\}\}\}|\{\{([\w.]+)\}\}/g, (_match, rawKey, escapedKey) => {
    const key = rawKey || escapedKey;
    if (!(key in values)) throw new Error(`Missing ${locale} landing translation: ${key}`);
    used.add(key);
    return rawKey ? String(values[key]) : escapeAttribute(values[key]);
  });
  const leftover = html.match(/\{\{\{?[\w.]+\}\}\}?/);
  if (leftover) throw new Error(`Unresolved landing placeholder: ${leftover[0]}`);
  return { html, used };
}

const english = render('en');
await writeFile(path.join(root, 'index.html'), english.html);
await writeFile(path.join(root, 'public', 'marketing.css'), marketingCss);
for (const locale of locales.filter((code) => code !== 'en')) {
  const localized = render(locale);
  const localizedPath = path.join(root, 'public', locale, 'index.html');
  await mkdir(path.dirname(localizedPath), { recursive: true });
  await writeFile(localizedPath, localized.html);
}
console.log(`Generated SEO landing pages for ${locales.join(', ')} (${english.used.size} fields each)`);
