'use client';

import type { CreditGradeLetter } from '@/lib/types';

interface CreditScoreRingProps {
  score: number;
  grade: CreditGradeLetter;
  size?: number;
}

const GRADE_COLORS: Record<CreditGradeLetter, { stroke: string; text: string; bg: string }> = {
  'A+': { stroke: '#10b981', text: 'text-emerald-600', bg: 'from-emerald-50 to-green-50' },
  'A':  { stroke: '#22c55e', text: 'text-green-600',   bg: 'from-green-50 to-emerald-50' },
  'B':  { stroke: '#f59e0b', text: 'text-amber-600',   bg: 'from-amber-50 to-yellow-50' },
  'C':  { stroke: '#f97316', text: 'text-orange-600',  bg: 'from-orange-50 to-amber-50' },
  'D':  { stroke: '#ef4444', text: 'text-red-600',     bg: 'from-red-50 to-orange-50' },
};

export default function CreditScoreRing({ score, grade, size = 180 }: CreditScoreRingProps) {
  const colors = GRADE_COLORS[grade];
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const dashOffset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#e7e5e4"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-black ${colors.text}`}>{grade}</span>
        <span className="text-sm font-medium text-primary-500">{score}/100</span>
      </div>
    </div>
  );
}
