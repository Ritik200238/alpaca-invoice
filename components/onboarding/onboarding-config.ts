export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  route: string;
  /** If true, the user must perform this action before advancing */
  waitForAction?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'wallet',
    target: '[data-tour="wallet-connect"]',
    title: 'onboarding.tour.walletTitle',
    description: 'onboarding.tour.walletDesc',
    placement: 'bottom',
    route: '/dashboard',
    waitForAction: true,
  },
  {
    id: 'dashboard',
    target: '[data-tour="dashboard-stats"]',
    title: 'onboarding.tour.dashboardTitle',
    description: 'onboarding.tour.dashboardDesc',
    placement: 'bottom',
    route: '/dashboard',
  },
  {
    id: 'create',
    target: '[data-tour="invoice-form"]',
    title: 'onboarding.tour.createTitle',
    description: 'onboarding.tour.createDesc',
    placement: 'bottom',
    route: '/invoices/create',
  },
  {
    id: 'invoices',
    target: '[data-tour="invoice-list"]',
    title: 'onboarding.tour.invoicesTitle',
    description: 'onboarding.tour.invoicesDesc',
    placement: 'bottom',
    route: '/invoices',
  },
  {
    id: 'audit',
    target: '[data-tour="audit-center"]',
    title: 'onboarding.tour.auditTitle',
    description: 'onboarding.tour.auditDesc',
    placement: 'top',
    route: '/audit',
  },
];
