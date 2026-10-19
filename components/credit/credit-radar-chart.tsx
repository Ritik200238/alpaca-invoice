'use client';

import { useTranslations } from 'next-intl';
import type { CreditDimensionScores } from '@/lib/types';

interface CreditRadarChartProps {
  dimensions: CreditDimensionScores;
  size?: number;
}

const AXES = [
  { key: 'onTimeRate' as const, angle: -90 },
  { key: 'volume' as const, angle: -18 },
  { key: 'disputeResistance' as const, angle: 54 },
  { key: 'amount' as const, angle: 126 },
  { key: 'accountAge' as const, angle: 198 },
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default function CreditRadarChart({ dimensions, size = 240 }: CreditRadarChartProps) {
  const t = useTranslations('credit');
  const center = size / 2;
  const maxR = size / 2 - 30;

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const dataPoints = AXES.map((axis) => {
    const value = dimensions[axis.key] / 100;
    return polarToCartesian(center, center, maxR * value, axis.angle);
  });

  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const labelMap: Record<string, string> = {
    onTimeRate: t('radarOnTime'),
    volume: t('radarVolume'),
    disputeResistance: t('radarDispute'),
    amount: t('radarAmount'),
    accountAge: t('radarAge'),
  };

  return (
    <div className="relative">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {gridLevels.map((level) => {
          const pts = AXES.map((a) =>
            polarToCartesian(center, center, maxR * level, a.angle)
          );
          return (
            <polygon
              key={level}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#e7e5e4"
              strokeWidth={1}
            />
          );
        })}

        {AXES.map((axis) => {
          const end = polarToCartesian(center, center, maxR, axis.angle);
          return (
            <line
              key={axis.key}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="#e7e5e4"
              strokeWidth={1}
            />
          );
        })}

        <polygon
          points={polygonPoints}
          fill="rgba(245, 158, 11, 0.15)"
          stroke="#F59E0B"
          strokeWidth={2}
        />

        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#D97706" />
        ))}

        {AXES.map((axis) => {
          const labelR = maxR + 18;
          const pos = polarToCartesian(center, center, labelR, axis.angle);
          return (
            <text
              key={axis.key}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-primary-600 text-[10px] font-medium"
            >
              {labelMap[axis.key]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
