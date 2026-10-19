'use client';

import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  getOnboardingState,
  resetOnboarding,
  setOnboardingCompleted,
} from '@/lib/onboarding-storage';
import { useUserStore } from '@/stores/User/useUserStore';
import { TOUR_STEPS } from './onboarding-config';
import { TourOverlay } from './onboarding-overlay';

interface OnboardingCtx {
  active: boolean;
  restart: () => void;
}

const defaultCtx: OnboardingCtx = { active: false, restart: () => {} };

const OnboardingContext = createContext<OnboardingCtx>(defaultCtx);
export const useOnboarding = () => useContext(OnboardingContext);

interface Props { children: ReactNode }

export function OnboardingProvider({ children }: Props) {
  const { publicKey } = useUserStore();
  const wallet = useWallet();
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const initializedRef = useRef(false);

  // Auto-start tour for new users
  useEffect(() => {
    if (initializedRef.current) return;
    const persisted = getOnboardingState(publicKey);
    if (!persisted.completed) {
      const timer = setTimeout(() => {
        initializedRef.current = true;
        setStep(0);
        setActive(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [publicKey]);

  const currentStep = TOUR_STEPS[step];

  // Navigate to the correct route when step changes
  useEffect(() => {
    if (!active || !currentStep) return;
    if (pathname !== currentStep.route) {
      router.push(currentStep.route);
    }
  }, [active, step, currentStep, pathname, router]);

  // Step 1 (wallet): auto-advance when wallet connects
  useEffect(() => {
    if (!active) return;
    if (currentStep?.id === 'wallet' && wallet.connected && publicKey) {
      const timer = setTimeout(() => setStep((s) => s + 1), 600);
      return () => clearTimeout(timer);
    }
  }, [active, currentStep, wallet.connected, publicKey]);

  const finish = useCallback(() => {
    setActive(false);
    initializedRef.current = false;
    setOnboardingCompleted(publicKey);
  }, [publicKey]);

  const restart = useCallback(() => {
    resetOnboarding(publicKey);
    initializedRef.current = true;
    setStep(0);
    setActive(true);
    if (pathname !== '/dashboard') {
      router.push('/dashboard');
    }
  }, [publicKey, pathname, router]);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, finish]);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const ctx = useMemo<OnboardingCtx>(() => ({ active, restart }), [active, restart]);

  return (
    <OnboardingContext.Provider value={ctx}>
      {children}
      {active && (
        <TourOverlay
          steps={TOUR_STEPS}
          currentStep={step}
          onNext={next}
          onPrev={prev}
          onSkip={finish}
        />
      )}
    </OnboardingContext.Provider>
  );
}
