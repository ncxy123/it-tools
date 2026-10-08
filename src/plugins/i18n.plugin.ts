import messages from '@intlify/unplugin-vue-i18n/messages';
import { get } from '@vueuse/core';
import type { Plugin } from 'vue';
import { createI18n } from 'vue-i18n';

export function detectInitialLocale(): string {
  const available = Object.keys(messages as Record<string, unknown>);
  let stored: string | null = null;

  try {
    stored = localStorage.getItem('locale');
  }
  catch {
    stored = null;
  }

  if (stored) {
    const normalized = stored.replace(/^"|"$/g, '');
    if (available.includes(normalized)) {
      return normalized;
    }
  }

  const browser = (typeof navigator === 'undefined' ? '' : navigator.language || '').toLowerCase();
  if (!browser) {
    return 'en';
  }

  return available.find(locale => browser === locale)
    ?? available.find(locale => browser.startsWith(locale))
    ?? 'en';
}

const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  messages,
});

export const i18nPlugin: Plugin = {
  install: (app) => {
    app.use(i18n);
  },
};

export const translate = function (localeKey: string) {
  const hasKey = i18n.global.te(localeKey, get(i18n.global.locale));
  return hasKey ? i18n.global.t(localeKey) : localeKey;
};
