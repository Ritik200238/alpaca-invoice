import {
  CreateInvoiceParams,
  AleoTransactionId,
  AleoField,
  Invoice,
  EscrowPaymentParams,
  ConfirmDeliveryParams,
  TimeoutRefundParams,
  ArbiterResolveParams,
  RaiseDisputeParams,
  ResolveDisputeParams,
  SubmitEvidenceParams,
} from '@/lib/types'

export interface ITxController {
  // --- State exposure ---
  isProcessing: boolean;
  currentProgress: number;  // 0-100
  currentLog: string;

  // --- Core invoice methods ---

  executeCreateInvoice(params: CreateInvoiceParams): Promise<{ invoiceHash: AleoField; invoiceId: AleoField }>;

  /**
   * Pay an invoice. Automatically routes to Credits or USDCx path
   * based on invoice.currencyFlag.
   */
  executePay(invoice: Invoice): Promise<AleoTransactionId>;

  executeCancel(invoice: Invoice): Promise<AleoTransactionId>;

  executeSetAuditAuthorization(
    invoice: Invoice,
    auditKeyHash: string,
    scopesBitmask: bigint,
    expiresAt: number
  ): Promise<AleoTransactionId>;

  // --- Wave 4: Dispute methods ---

  executeRaiseDispute(params: RaiseDisputeParams): Promise<AleoTransactionId>;
  executeResolveDispute(params: ResolveDisputeParams): Promise<AleoTransactionId>;
  executeSubmitEvidence(params: SubmitEvidenceParams): Promise<AleoTransactionId>;

  // --- Wave 4: Escrow methods ---

  executeEscrowPayment(params: EscrowPaymentParams): Promise<AleoTransactionId>;
  executeConfirmDelivery(params: ConfirmDeliveryParams): Promise<AleoTransactionId>;
  executeTimeoutRefund(params: TimeoutRefundParams): Promise<AleoTransactionId>;
  executeArbiterResolve(params: ArbiterResolveParams): Promise<AleoTransactionId>;
}
