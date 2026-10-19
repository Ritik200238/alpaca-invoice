import { AleoField, AuditKey } from "@/lib/types";

export interface IAuditController {
  /** * Logic:
   * 1. Get decrypted details from StorageService
   * 2. Call WalletService.signMessage to sign the hash
   * 3. Export a JSON file containing the AuditKey structure
   */
  generateAuditPackage(invoiceId: AleoField): Promise<AuditKey>;

  /** Logic: Validate whether a third-party audit package is authentic and valid */
  validatePackage(pkg: AuditKey): Promise<boolean>;
}
