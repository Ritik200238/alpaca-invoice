'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  Receipt,
  ShieldCheck,
  BookOpen,
  HelpCircle,
  AlertTriangle,
  Award,
  X,
} from 'lucide-react';
import { useSidebar } from '@/components/sidebar-context';
import { useOnboarding } from '@/components/onboarding/onboarding-provider';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { DisputeStatus } from '@/lib/types';

const navItems = [
  { titleKey: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
  { titleKey: 'invoices' as const, href: '/invoices', icon: FileText },
  { titleKey: 'createInvoice' as const, href: '/invoices/create', icon: FilePlus },
  { titleKey: 'receipts' as const, href: '/receipts', icon: Receipt },
  { titleKey: 'disputes' as const, href: '/disputes', icon: AlertTriangle },
  { titleKey: 'creditCenter' as const, href: '/credit', icon: Award },
  { titleKey: 'auditCenter' as const, href: '/audit', icon: ShieldCheck },
  { titleKey: 'documentation' as const, href: '/docs', icon: BookOpen },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, close } = useSidebar();
  const { restart: restartGuide } = useOnboarding();
  const [helpVisible, setHelpVisible] = useState(true);
  const t = useTranslations('nav');
  const publicKey = useUserStore((s) => s.publicKey);
  const pendingArbitrationCount = useDisputeStore((s) =>
    s.disputes.filter(
      (d) => d.arbiter === publicKey && d.status === DisputeStatus.OPEN
    ).length
  );
  const handleRestartGuide = () => {
    restartGuide();
    close();
    if (pathname !== '/dashboard') {
      router.push('/dashboard');
    }
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r border-white/5 bg-gradient-to-b from-primary-950 via-primary-900 to-primary-950 transition-transform duration-300 ease-in-out',
          // Desktop: always visible; Mobile: slide in/out
          'md:z-40 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo - Click to go to homepage */}
          <NextLink
            href="/"
            className="flex h-16 items-center gap-3 border-b border-white/5 px-6 transition-colors hover:bg-white/5 cursor-pointer"
          >
            {/* Mobile close button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                close();
              }}
              className="absolute right-3 top-4 rounded-lg p-1 text-primary-400 hover:text-white md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
            <Image
              src="/images/mascot/mascot-shield.png"
              alt="Alpaca logo"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          <div>
            <span className="text-lg font-bold text-white">Alpaca</span>
            <span className="text-lg font-light text-primary-400"> Invoice</span>
          </div>
        </NextLink>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-6">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-primary-500">
            Menu
          </div>
          {navItems.map((item) => {
            const isActive = (() => {
              const p = pathname;
              if (item.href === '/invoices') {
                return p === '/invoices' ||
                  (p.startsWith('/invoices/') && p !== '/invoices/create') ||
                  (p.startsWith('/invoice/') && p !== '/invoice/create');
              }
              if (item.href === '/invoices/create') {
                return p === '/invoices/create' || p === '/invoice/create';
              }
              if (item.href === '/disputes') return p === '/disputes' || p.startsWith('/disputes/');
              if (item.href === '/credit') return p === '/credit' || p.startsWith('/credit/');
              if (item.href === '/audit') return p === '/audit' || p.startsWith('/audit/');
              if (item.href === '/docs') return p.startsWith('/docs');
              return p === item.href;
            })();
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all cursor-pointer',
                  isActive
                    ? 'bg-gradient-to-r from-accent-500/90 to-accent-400/80 text-white shadow-lg shadow-accent-500/25'
                    : 'text-primary-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{t(item.titleKey)}</span>
                {item.href === '/disputes' && pendingArbitrationCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {pendingArbitrationCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Help Card */}
        {helpVisible && (
          <div className="p-4">
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_12px_24px_-16px_rgba(15,23,42,0.5)] backdrop-blur">
              <button
                type="button"
                onClick={() => setHelpVisible(false)}
                className="absolute right-2 top-2 rounded-lg p-1 text-primary-500 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/15 ring-1 ring-accent-500/20">
                  <HelpCircle className="h-5 w-5 text-accent-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{t('helpTitle')}</p>
                  <p className="text-xs text-primary-400">{t('helpDescription')}</p>
                </div>
              </div>
              <Link
                href="/docs"
                className="block w-full cursor-pointer rounded-lg bg-white/10 py-2 text-center text-xs font-medium text-primary-200 transition-colors hover:bg-white/20 hover:text-white"
              >
                {t('documentation')}
              </Link>
              <button
                type="button"
                onClick={handleRestartGuide}
                className="mt-2 block w-full cursor-pointer rounded-lg border border-white/15 bg-transparent py-2 text-center text-xs font-medium text-primary-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                {t('restartGuide')}
              </button>
            </div>
          </div>
        )}

        {/* Footer with mascot */}
        <div className="border-t border-white/5 p-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/mascot/mascot-happy.png"
              alt="Paca"
              width={36}
              height={36}
              className="rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">Paca</p>
              <p className="text-xs text-primary-400">Your invoice assistant</p>
            </div>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
