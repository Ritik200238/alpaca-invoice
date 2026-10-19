import type { IProgramMappingReader } from './InvoiceRegistryServiceImpl';
import { InvoiceRegistryServiceImpl } from './InvoiceRegistryServiceImpl';
import type { IInvoiceRegistryService } from './IInvoiceRegistryService';

/**
 * Create InvoiceRegistryService from a mapping reader (e.g. AleoProtocolService).
 */
export function createInvoiceRegistryService(reader: IProgramMappingReader): IInvoiceRegistryService {
  return new InvoiceRegistryServiceImpl(reader);
}
