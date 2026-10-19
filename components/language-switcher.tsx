'use client';

import { useRouter, usePathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { locales, type Locale } from '@/i18n/config';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const localeLabels: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

const localeFlags: Record<Locale, string> = {
  en: 'EN',
  zh: '中',
  ja: 'JA',
};

export default function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const currentLocale = useLocale() as Locale;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) {
      setOpen(false);
      return;
    }

    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
    router.replace(pathname, { locale });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-primary-500 transition-colors hover:bg-primary-100/70 hover:text-primary-700"
      >
        <Globe className="h-4 w-4" />
        <span className="font-medium">{localeFlags[currentLocale]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {locales.map(locale => (
            <button
              key={locale}
              onClick={() => switchLocale(locale)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary-50 ${
                locale === currentLocale ? 'font-semibold text-primary-700' : 'text-slate-600'
              }`}
            >
              <span className="w-6 text-center text-xs font-bold text-slate-400">{localeFlags[locale]}</span>
              {localeLabels[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
