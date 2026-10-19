interface OnboardingPersistState {
  completed: boolean;
}

const VERSION = 'v2';

function storageKey(publicKey: string | null): string {
  return `alpaca-onboarding:${publicKey ?? 'guest'}:${VERSION}`;
}

function safeRead(publicKey: string | null): OnboardingPersistState {
  if (typeof window === 'undefined') return { completed: false };
  try {
    const raw = window.localStorage.getItem(storageKey(publicKey));
    if (!raw) return { completed: false };
    return { completed: Boolean(JSON.parse(raw).completed) };
  } catch {
    return { completed: false };
  }
}

function safeWrite(publicKey: string | null, value: OnboardingPersistState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(publicKey), JSON.stringify(value));
}

export function getOnboardingState(publicKey: string | null): OnboardingPersistState {
  return safeRead(publicKey);
}

export function setOnboardingCompleted(publicKey: string | null): void {
  safeWrite(publicKey, { completed: true });
}

export function resetOnboarding(publicKey: string | null): void {
  safeWrite(publicKey, { completed: false });
}
