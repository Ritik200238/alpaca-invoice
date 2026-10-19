import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export function useCreateInvoicePage() {
  const t = useTranslations();
  return useMemo(() => ({
    title: t('invoice.create.title'),
    description: t('invoice.create.pageDescription'),
    mascotSrc: '/images/mascot/mascot-writing.png',
    mascotAlt: t('invoice.create.mascotAlt')
  }), [t]);
}
