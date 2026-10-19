'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BookOpen, Layers, GitBranch, Lightbulb, ArrowRight } from 'lucide-react';

export default function DocsPage() {
  const t = useTranslations();

  const docCards = [
    {
      title: t('docs.architecture'),
      description: t('docs.architectureDesc'),
      href: '/docs/architecture',
      icon: Layers,
      iconBg: 'bg-info-100',
      iconColor: 'text-info-600',
    },
    {
      title: t('docs.businessFlow'),
      description: t('docs.businessFlowDesc'),
      href: '/docs/business-flow',
      icon: GitBranch,
      iconBg: 'bg-success-100',
      iconColor: 'text-success-600',
    },
    {
      title: t('docs.handbook'),
      description: t('docs.handbookDesc'),
      href: '/docs/handbook',
      icon: Lightbulb,
      iconBg: 'bg-warning-100',
      iconColor: 'text-warning-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100">
              <BookOpen className="h-5 w-5 text-accent-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-primary-900">{t('docs.title')}</h1>
              <p className="text-sm text-primary-500">
                {t('docs.description')}
              </p>
            </div>
          </div>
        </div>
        <div className="relative hidden h-20 w-20 md:block">
          <Image
            src="/images/mascot/mascot-thinking.png"
            alt="Documentation"
            fill
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {docCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="surface-card card-hover group flex flex-col p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <h2 className="text-lg font-semibold text-primary-900">{card.title}</h2>
              </div>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-primary-500">
                {card.description}
              </p>
              <div className="flex items-center gap-1.5 text-sm font-medium text-accent-600 transition-colors group-hover:text-accent-700">
                {t('docs.view')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
