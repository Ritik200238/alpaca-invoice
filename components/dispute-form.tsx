'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Invoice, AleoField, AleoAddress } from '@/lib/types';
import WalletOperationProgress from '@/components/wallet-operation-progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface DisputeFormProps {
  invoice: Invoice;
  arbiter?: AleoAddress;
  onSubmit: (params: {
    reasonHash: AleoField;
    evidenceHash: AleoField;
    arbiter?: AleoAddress;
    resolutionDeadlineDays: number;
    reasonText?: string;
  }) => Promise<void>;
  onCancel: () => void;
  txProgress?: number;
  txLog?: string;
}

export default function DisputeForm({ invoice, arbiter, onSubmit, onCancel, txProgress = 0, txLog = '' }: DisputeFormProps) {
  const t = useTranslations();
  const [reason, setReason] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const encoder = new TextEncoder();
      const reasonBytes = encoder.encode(reason);
      const reasonDigest = await crypto.subtle.digest('SHA-256', reasonBytes);
      const reasonHex = Array.from(new Uint8Array(reasonDigest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const reasonHash = `${BigInt('0x' + reasonHex.slice(0, 16))}field` as AleoField;

      await onSubmit({
        reasonHash,
        evidenceHash: '0field' as AleoField,
        arbiter,
        resolutionDeadlineDays: deadlineDays,
        reasonText: reason.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-800">
          {t('dispute.confirmRaise')}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">{t('dispute.reason')}</label>
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('dispute.reasonPlaceholder')}
          rows={3}
          required
          className="mt-1"
        />
      </div>

      {arbiter && (
        <div>
          <label className="block text-sm font-medium text-slate-700">
            {t('dispute.arbiter')}
          </label>
          <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 break-all">
            {arbiter}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{t('dispute.arbiterFromEscrow')}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">
          {t('dispute.deadline')}
        </label>
        <Select value={String(deadlineDays)} onValueChange={(v) => setDeadlineDays(Number(v))}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t('dispute.deadlineDays', { days: 7 })}</SelectItem>
            <SelectItem value="14">{t('dispute.deadlineDays', { days: 14 })}</SelectItem>
            <SelectItem value="30">{t('dispute.deadlineDays', { days: 30 })}</SelectItem>
            <SelectItem value="60">{t('dispute.deadlineDays', { days: 60 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isSubmitting && (
        <WalletOperationProgress
          isProving={isSubmitting}
          txProgress={txProgress}
          txLog={txLog}
          isConfirming={false}
          pollLog=""
          operationLabel={t('walletProgress.raisingDispute')}
        />
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !reason.trim()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isSubmitting ? t('dispute.submitting') : t('dispute.raiseDispute')}
        </button>
      </div>
    </form>
  );
}
