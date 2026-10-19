'use client';

import { CheckCircle, AlertCircle, Clock, FileText, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DisputeStatus } from '@/lib/types';
import type { DisputeRecord } from '@/lib/types';

interface TimelineEvent {
  label: string;
  date: Date;
  icon: React.ReactNode;
  status: 'completed' | 'active' | 'pending';
  description?: string;
}

interface DisputeTimelineProps {
  dispute: DisputeRecord;
}

export default function DisputeTimeline({ dispute }: DisputeTimelineProps) {
  const t = useTranslations();
  const events: TimelineEvent[] = [
    {
      label: t('dispute.raised'),
      date: dispute.createdAt,
      icon: <AlertCircle className="h-4 w-4" />,
      status: 'completed',
      description: `${t('dispute.by')} ${dispute.disputant.slice(0, 12)}...`,
    },
    {
      label: t('dispute.evidenceSubmitted'),
      date: dispute.createdAt,
      icon: <FileText className="h-4 w-4" />,
      status: dispute.evidenceHash !== '0field' ? 'completed' : 'pending',
    },
    {
      label: t('dispute.resolution'),
      date: dispute.resolutionDeadline,
      icon: <Scale className="h-4 w-4" />,
      status: dispute.status !== DisputeStatus.OPEN ? 'completed' : 'active',
      description:
        dispute.status === DisputeStatus.RESOLVED_CANCEL
          ? t('dispute.dismissedCancelled')
          : dispute.status === DisputeStatus.RESOLVED_PAY
          ? t('dispute.upheldPaid')
          : `${t('dispute.deadlineLabel')}: ${dispute.resolutionDeadline.toLocaleDateString()}`,
    },
  ];

  return (
    <div className="space-y-0">
      {events.map((event, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                event.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-600'
                  : event.status === 'active'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {event.icon}
            </div>
            {idx < events.length - 1 && (
              <div
                className={`h-8 w-0.5 ${
                  event.status === 'completed' ? 'bg-emerald-200' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
          <div className="pb-6">
            <p className="text-sm font-medium text-slate-800">{event.label}</p>
            <p className="text-xs text-slate-500">
              {event.date.toLocaleDateString()} {event.date.toLocaleTimeString()}
            </p>
            {event.description && (
              <p className="mt-0.5 text-xs text-slate-600">{event.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
