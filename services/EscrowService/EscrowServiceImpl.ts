import type { IEscrowService, ChainEscrowData } from './IEscrowService';
import type { AleoField, EscrowRecord } from '@/lib/types';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { PROGRAM_ID_V4, MAPPINGS_V4 } from '@/lib/contract';
import { cleanAleoNumber } from '@/lib/utils';

export class EscrowService implements IEscrowService {
  private protocolService: AleoProtocolService;

  constructor() {
    this.protocolService = new AleoProtocolService();
  }

  async getEscrowByInvoiceId(invoiceId: AleoField): Promise<AleoField | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.escrow_registry,
      invoiceId
    );
    if (!result) return null;
    return result.replace(/"/g, '').trim() as AleoField;
  }

  async getEscrowStatus(escrowId: AleoField): Promise<number | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.escrow_status,
      escrowId
    );
    if (!result) return null;
    return Number(cleanAleoNumber(result.replace(/"/g, '').trim()));
  }

  async getEscrowBalance(escrowId: AleoField): Promise<bigint | null> {
    const result = await this.protocolService.getProgramMappingValue(
      PROGRAM_ID_V4,
      MAPPINGS_V4.escrow_balances,
      escrowId
    );
    if (!result) return null;
    return BigInt(cleanAleoNumber(result.replace(/"/g, '').trim()));
  }

  async getChainEscrowData(invoiceId: AleoField): Promise<ChainEscrowData | null> {
    const escrowId = await this.getEscrowByInvoiceId(invoiceId);
    if (!escrowId) return null;

    const [status, balance] = await Promise.all([
      this.getEscrowStatus(escrowId),
      this.getEscrowBalance(escrowId),
    ]);

    if (status === null) return null;

    return {
      escrowId,
      invoiceId,
      status,
      balance: balance ?? 0n,
    };
  }

  isDeliveryExpired(escrowRecord: EscrowRecord): boolean {
    return new Date() > escrowRecord.deliveryDeadline;
  }
}
