import type { ICreditService } from './ICreditService';
import type {
  AleoField,
  Invoice,
  PaymentReceipt,
  CreditMetrics,
  CreditGrade,
  CreditGradeLetter,
  CreditDimensionScores,
} from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { CREDIT_PROGRAM_ID, CREDIT_MAPPINGS } from '@/lib/contract';

export class CreditService implements ICreditService {
  private protocolService: AleoProtocolService;

  constructor() {
    this.protocolService = new AleoProtocolService();
  }

  collectMetrics(records: Invoice[], payments: PaymentReceipt[]): CreditMetrics {
    const allInvoices = records.filter(r =>
      r.status === InvoiceStatus.PAID ||
      r.status === InvoiceStatus.CANCELLED ||
      r.status === InvoiceStatus.PENDING
    );

    let paidOnTime = 0;
    let totalPaidAmount = BigInt(0);
    let firstInvoiceDate = Infinity;
    let disputeCount = 0;

    for (const inv of records) {
      const createdTs = inv.createdAt.getTime() / 1000;
      if (createdTs < firstInvoiceDate) {
        firstInvoiceDate = createdTs;
      }
      if (
        inv.status === InvoiceStatus.DISPUTED ||
        inv.status === InvoiceStatus.RESOLVED_CANCELLED ||
        inv.status === InvoiceStatus.RESOLVED_PAID
      ) {
        disputeCount++;
      }
    }

    for (const payment of payments) {
      totalPaidAmount += payment.amount;
      const invoice = records.find(r => r.id === payment.invoiceId);
      if (invoice && payment.paidAt <= invoice.dueDate) {
        paidOnTime++;
      }
    }

    const totalInvoices = allInvoices.length;
    const onTimeRate = totalInvoices > 0 ? (paidOnTime / totalInvoices) * 100 : 0;

    return {
      totalInvoices,
      paidOnTime,
      onTimeRate,
      totalPaidAmount,
      firstInvoiceDate: firstInvoiceDate === Infinity ? 0 : Math.floor(firstInvoiceDate),
      disputeCount,
    };
  }

  computeGrade(metrics: CreditMetrics): CreditGrade {
    const dims = this.computeDimensionScores(metrics);
    const score = Math.round(
      dims.onTimeRate * 0.35 +
      dims.volume * 0.15 +
      dims.amount * 0.15 +
      dims.accountAge * 0.15 +
      dims.disputeResistance * 0.20
    );
    let letter: CreditGradeLetter;
    if (score >= 90) letter = 'A+';
    else if (score >= 75) letter = 'A';
    else if (score >= 60) letter = 'B';
    else if (score >= 40) letter = 'C';
    else letter = 'D';
    return { letter, score, dimensions: dims };
  }

  private computeDimensionScores(m: CreditMetrics): CreditDimensionScores {
    const onTimeRate = Math.min(100, m.onTimeRate);

    let volume: number;
    if (m.totalInvoices === 0) volume = 0;
    else if (m.totalInvoices <= 5) volume = 40;
    else if (m.totalInvoices <= 20) volume = 70;
    else volume = 100;

    const paidCredits = Number(m.totalPaidAmount) / 1_000_000;
    let amount: number;
    if (paidCredits === 0) amount = 0;
    else if (paidCredits < 10) amount = 30;
    else if (paidCredits < 100) amount = 60;
    else if (paidCredits < 1000) amount = 85;
    else amount = 100;

    let accountAge: number;
    if (m.firstInvoiceDate === 0) {
      accountAge = 0;
    } else {
      const ageDays = (Date.now() / 1000 - m.firstInvoiceDate) / 86400;
      if (ageDays < 7) accountAge = 20;
      else if (ageDays < 30) accountAge = 50;
      else if (ageDays < 90) accountAge = 75;
      else accountAge = 100;
    }

    const disputeRate = m.totalInvoices > 0
      ? (m.disputeCount / m.totalInvoices) * 100
      : 0;
    const disputeResistance = Math.max(0, Math.min(100, 100 - disputeRate * 5));

    return { onTimeRate, volume, amount, accountAge, disputeResistance };
  }

  async getProofFromChain(proofId: AleoField): Promise<AleoField | null> {
    const result = await this.protocolService.getProgramMappingValue(
      CREDIT_PROGRAM_ID,
      CREDIT_MAPPINGS.credit_proofs,
      proofId
    );
    if (!result) return null;
    const cleaned = result.replace(/"/g, '').trim();
    if (cleaned === '0field') return null;
    return cleaned as AleoField;
  }
}
