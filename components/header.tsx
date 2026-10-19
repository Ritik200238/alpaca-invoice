'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import WalletConnectButtonV2 from '@/components/wallet-connect-button-v2';
import LanguageSwitcher from '@/components/language-switcher';
import { Bell, Menu } from 'lucide-react';
import { useSidebar } from '@/components/sidebar-context';
import { locales, type Locale } from '@/i18n/config';

function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/');
  if (segments.length > 1 && locales.includes(segments[1] as Locale)) {
    return '/' + segments.slice(2).join('/') || '/';
  }
  return pathname;
}

type PageTitleKeys = {
  titleKey: string;
  subtitleKey?: string;
};

const pageTitleKeys: Record<string, PageTitleKeys> = {
  '/': { titleKey: 'dashboard.welcome' },
  '/dashboard': { titleKey: 'dashboard.title' },
  '/invoices': { titleKey: 'invoice.list.title' },
  '/invoices/create': { titleKey: 'invoice.create.title' },
  '/invoice/create': { titleKey: 'invoice.create.title' },
  '/receipts': { titleKey: 'receipt.title' },
  '/audit': { titleKey: 'audit.center.title' },
  '/audit/verify': { titleKey: 'audit.verify.title' },
  '/disputes': { titleKey: 'dispute.title' },
  '/settings': { titleKey: 'settings.title' },
  '/docs': { titleKey: 'nav.documentation' },
};

function resolvePageTitleKeys(pathname: string): PageTitleKeys {
  if (pageTitleKeys[pathname]) return pageTitleKeys[pathname];
  if (
    (pathname.startsWith('/invoices/') && pathname !== '/invoices/create') ||
    (pathname.startsWith('/invoice/') && pathname !== '/invoice/create')
  ) {
    return { titleKey: 'invoice.detail.title' };
  }
  if (pathname.startsWith('/disputes/')) {
    return { titleKey: 'dispute.title' };
  }
  return { titleKey: 'dashboard.title' };
}

export default function Header() {
  const pathname = usePathname();
  const cleanPath = stripLocalePrefix(pathname);
  const keys = resolvePageTitleKeys(cleanPath);
  const { toggle } = useSidebar();

  const t = useTranslations();
  const title = t(keys.titleKey);

  return (
    <header className="sticky top-4 z-30 flex h-14 items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl md:top-6 md:h-16 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="rounded-lg p-1.5 text-primary-500 transition-colors hover:bg-primary-100/70 hover:text-primary-700 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-primary-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />

        <button className="relative cursor-pointer rounded-lg p-2 text-primary-500 transition-colors hover:bg-primary-100/70 hover:text-primary-700">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500" />
        </button>

        <WalletConnectButtonV2 />
      </div>
    </header>
  );
}
