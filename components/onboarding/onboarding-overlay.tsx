'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TourStep } from './onboarding-config';

interface ViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourOverlayProps {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const PAD = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 210;

function measureElement(selector: string): ViewportRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

export function TourOverlay({ steps, currentStep, onNext, onPrev, onSkip }: TourOverlayProps) {
  const t = useTranslations();
  const [rect, setRect] = useState<ViewportRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const scrollingRef = useRef(false);
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  useEffect(() => setMounted(true), []);

  // Discover & scroll-to target element
  useEffect(() => {
    if (!step || !mounted) return;
    const selector = step.target;
    let found = false;

    const settle = (el: Element) => {
      found = true;
      // Measure immediately so the spotlight appears without a loading flash
      const instant = measureElement(selector);
      if (instant) setRect(instant);

      scrollingRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Re-measure after scroll animation settles for accurate position
      setTimeout(() => {
        const r = measureElement(selector);
        if (r) setRect(r);
        scrollingRef.current = false;
      }, 400);
    };

    // If element already exists on the page, settle instantly (no loading)
    const el = document.querySelector(selector);
    if (el) { settle(el); return; }

    // Cross-page navigation: element not yet in DOM — clear rect
    setRect(null);

    const observer = new MutationObserver(() => {
      if (found) return;
      const e = document.querySelector(selector);
      if (e) { observer.disconnect(); settle(e); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let delay = 100; delay <= 5000; delay += 200) {
      timers.push(setTimeout(() => {
        if (found) return;
        const e = document.querySelector(selector);
        if (e) settle(e);
      }, delay));
    }

    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, [currentStep, step, mounted]);

  // Re-measure on user scroll & window resize
  useEffect(() => {
    if (!step || !rect) return;
    let rafId: number;
    const update = () => {
      if (scrollingRef.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const r = measureElement(step.target);
        if (r) setRect(r);
      });
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [step, rect]);

  if (!mounted || !step) return null;

  // Waiting for cross-page element — just dim the screen, no loading card
  if (!rect) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" style={{ pointerEvents: 'none' }} />,
      document.body,
    );
  }

  const tooltipStyle = computeTooltipStyle(rect, step.placement);

  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      {/* Dark backdrop with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Highlight ring */}
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-accent-400 ring-offset-2"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: '0 0 0 4px rgba(99,102,241,0.18)',
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute z-[10000] w-80 rounded-2xl border border-white/60 bg-white p-5 shadow-2xl"
        style={{ ...tooltipStyle, pointerEvents: 'auto' }}
      >
        <button
          type="button"
          onClick={onSkip}
          className="absolute right-3 top-3 rounded-lg p-1 text-primary-400 hover:bg-primary-100 hover:text-primary-700"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-500">
          {t(step.title)}
        </p>
        <p className="mb-4 text-sm leading-relaxed text-primary-700">{t(step.description)}</p>
        <div className="mb-4 flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep
                  ? 'w-6 bg-accent-500'
                  : i < currentStep
                    ? 'w-1.5 bg-accent-300'
                    : 'w-1.5 bg-primary-200'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-primary-400 hover:text-primary-600"
          >
            {t('onboarding.skip')}
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={onPrev}
                className="flex items-center gap-1 rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50"
              >
                <ChevronLeft className="h-3 w-3" /> {t('common.back')}
              </button>
            )}
            {step.waitForAction ? (
              <span className="rounded-lg bg-primary-100 px-4 py-1.5 text-xs font-medium text-primary-500">
                {t('onboarding.waiting')}
              </span>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="flex items-center gap-1 rounded-lg bg-accent-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-accent-600"
              >
                {isLast ? t('onboarding.done') : t('common.next')} {!isLast && <ChevronRight className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computeTooltipStyle(
  rect: ViewportRect,
  placement: TourStep['placement'],
): CSSProperties {
  const clampX = (x: number) =>
    Math.max(16, Math.min(x, window.innerWidth - TOOLTIP_W - 16));
  const clampY = (y: number) =>
    Math.max(16, Math.min(y, window.innerHeight - TOOLTIP_H_EST - 16));
  const centerX = clampX(rect.left + rect.width / 2 - TOOLTIP_W / 2);

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - (rect.top + rect.height);

  let effective = placement;
  if (placement === 'top' && spaceAbove < TOOLTIP_H_EST + TOOLTIP_GAP + 16) {
    effective = 'bottom';
  } else if (placement === 'bottom' && spaceBelow < TOOLTIP_H_EST + TOOLTIP_GAP + 16) {
    effective = 'top';
  }

  switch (effective) {
    case 'bottom':
      return { top: clampY(rect.top + rect.height + TOOLTIP_GAP), left: centerX };
    case 'top':
      return { top: clampY(rect.top - TOOLTIP_H_EST - TOOLTIP_GAP), left: centerX };
    case 'right':
      return {
        top: clampY(rect.top),
        left: Math.min(rect.left + rect.width + TOOLTIP_GAP, window.innerWidth - TOOLTIP_W - 16),
      };
    case 'left':
      return {
        top: clampY(rect.top),
        right: window.innerWidth - rect.left + TOOLTIP_GAP,
      };
    default:
      return { top: clampY(rect.top + rect.height + TOOLTIP_GAP), left: centerX };
  }
}
