import type {
  AleoTransactionId,
  EscrowPaymentParams,
  ConfirmDeliveryParams,
  TimeoutRefundParams,
  ArbiterResolveParams,
} from '@/lib/types';

export interface IEscrowController {
  isProcessing: boolean;
  currentLog: string;

  executeEscrowPayment(params: EscrowPaymentParams): Promise<AleoTransactionId>;
  executeConfirmDelivery(params: ConfirmDeliveryParams): Promise<AleoTransactionId>;
  executeTimeoutRefund(params: TimeoutRefundParams): Promise<AleoTransactionId>;
  executeArbiterResolve(params: ArbiterResolveParams): Promise<AleoTransactionId>;
}
