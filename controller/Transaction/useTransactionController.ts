import { useCallback, useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { ITxController } from './ITxController';
import { useTransactionStore } from '@/stores/Transaction/useTransactionStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { getChainIdFromNetwork, getNetworkFromEnv } from '@/lib/network';
import { CreateInvoiceParams, AleoTransactionId, AleoField, AleoAddress, Invoice, CurrencyFlag, InvoiceStatus } from '@/lib/types';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { WalletServiceError, WalletError } from '@/services/WalletService/IWalletService';
import { useInvoiceChainScan } from '@/controller/Invoice/useInvoiceChainScan';
import { PROGRAM_ID, USDCX_PROGRAM_ID, ZERO_FIELD } from '@/lib/contract';
import { cleanAleoNumber } from '@/lib/utils';
import { MASTER_KEY_SIGNATURE_MESSAGE } from '@/lib/auth-constants';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { useReceiptStore } from '@/stores/Receipt/useReceiptStore';
import { toRecordInputString } from '@/lib/recordParser';

const cryptoService = new CryptoService();

/**
 * Extract a field value from an Aleo record returned by requestRecords.
 * Handles both structured-data shapes (r.data.field_name) and
 * plaintext string shapes (r.plaintext / r.recordPlaintext).
 *
 * Aleo plaintext looks like:
 *   "{ owner: aleo1..., invoice_id: 123field.private, ... }"
 * Field values have a type suffix (.private / .public) that we strip.
 */
function extractRecordField(record: any, fieldName: string): string | undefined {
  // 1. Structured data (most wallets after parsing)
  const fromData =
    record?.data?.[fieldName] ??
    record?.[fieldName];
  if (fromData !== undefined && fromData !== null) {
    // Strip type suffixes like ".private" or ".public"
    return String(fromData).replace(/\.(private|public)$/, '').trim();
  }

  // 2. Plaintext string (Shield returns raw Aleo record plaintext)
  const plaintext: string | undefined =
    record?.plaintext ?? record?.recordPlaintext ?? record?.record_plaintext;
  if (typeof plaintext === 'string') {
    // Matches:  field_name: <value>(.<suffix>)?
    const re = new RegExp(`\\b${fieldName}\\s*:\\s*([^,}\\s]+)`);
    const m = plaintext.match(re);
    if (m) return m[1].replace(/\.(private|public)$/, '').trim();
  }

  return undefined;
}

/**
 * Find the first unspent EscrowRecord in a wallet record list that belongs to
 * the given invoice.  Matches on invoice_id (always known) rather than
 * escrow_id (which is computed on-chain and not stored locally).
 */
function findEscrowRecordByInvoice(records: any[], invoiceId: string): any | undefined {
  return records?.find((r: any) => {
    if (r?.spent === true || r?.spent === 'true') return false;
    const rid = extractRecordField(r, 'invoice_id');
    return rid === invoiceId;
  });
}

/**
 * Transaction Controller Hook
 * Implements the full invoice creation flow, executing in three phases per the architecture diagram
 */
export function useTransactionController(): ITxController {
  const wallet = useWallet();
  const { isProcessing, progress, logs, startTx, updateProgress, completeTx } = useTransactionStore();
  const { publicKey, masterKey, setMasterKey, tryRestoreMasterKey } = useUserStore();
  const invoiceStore = useInvoiceStore();
  const receiptStore = useReceiptStore();
  const { scanInvoiceRecord } = useInvoiceChainScan(); // Use scan hook to fetch record

  // Create WalletService instance via adapter (aligned with useWalletController)
  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);
  const protocolService = useMemo(() => new AleoProtocolService(), []);

  /**
   * Execute the full create-invoice flow
   * 1) permission & data prep
   * 2) proof generation & chain broadcast
   * 3) local archival & status sync
   */
  const executeCreateInvoice = useCallback(
    async (params: CreateInvoiceParams): Promise<{ invoiceHash: AleoField; invoiceId: AleoField }> => {
      try {
        // Phase 1: permission & data prep
        // Ensure wallet is connected
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        // Validate buyer address (frontend already checks; this is a safeguard)
        const buyerAddress = params.buyer.trim() as AleoAddress;
        const ALEO_ADDR_REGEX = /^aleo1[0-9a-z]{58}$/;
        if (!ALEO_ADDR_REGEX.test(buyerAddress)) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Invalid buyer address format. It must start with aleo1 and be 63 characters long.'
          );
        }
        if (buyerAddress === publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Buyer address cannot be the same as seller address.'
          );
        }

        // Check if walletService is initialized
        if (!walletService) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet service not initialized. Please ensure wallet is available.',
            { hint: 'Visit https://leo.app to download Leo Wallet' }
          );
        }

        // Do not auto-reconnect during tx submission:
        // browser popup policies can block extension prompts in async flows.
        // Require explicit connection from the wallet button first.
        if (!wallet?.connected || !wallet?.address) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please click Connect Wallet first, then retry.',
            { hint: 'Use the top-right Connect Wallet button to establish a session.' }
          );
        }

        // Trigger identity authorization on demand (if masterKey does not exist)
        let currentMasterKey = masterKey;
        if (!currentMasterKey) {
          updateProgress(0, 'AUTHORIZING - Restoring or requesting signature...');
          try {
            // Try restore from device first (no re-sign; same masterKey as before)
            const restored = await tryRestoreMasterKey();
            if (restored) {
              currentMasterKey = useUserStore.getState().masterKey;
              updateProgress(5, '✓ Master key restored');
            }
            if (!currentMasterKey) {
              updateProgress(0, 'AUTHORIZING - Requesting signature authorization...');
              const signature = await walletService.signMessage(
                MASTER_KEY_SIGNATURE_MESSAGE,
                publicKey
              );

              if (!signature) {
                throw new WalletServiceError(
                  WalletError.USER_REJECTED,
                  'Failed to obtain signature for master key generation'
                );
              }

              currentMasterKey = await cryptoService.deriveMasterKey(signature);
              setMasterKey(currentMasterKey);
              updateProgress(5, '✓ Master key generated');
            }
          } catch (error: any) {
            if (error instanceof WalletServiceError && error.code === WalletError.USER_REJECTED) {
              throw error;
            }
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Failed to generate master key',
              { originalError: error }
            );
          }
        }

        // Begin HASHING phase
        startTx('HASHING');
        updateProgress(10, 'HASHING - Computing invoice hash (fast path via worker)...');

        // Prepare on-chain parameters
        updateProgress(20, 'PREPARING - Preparing transaction parameters...');
        const dueTimestamp = Math.floor(params.dueDate.getTime() / 1000);

        // Generate random nonce (hashObjectToField usage for create_invoice)
        const nonceField = await cryptoService.hashObjectToField(
          `NONCE-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(16))).join('')}`
        );

        // Derive supporting fields from details (all in microcredits). JCT: use details.taxAmount (per-line sum).
        const taxAmountMicro = params.details.taxAmount != null
          ? BigInt(Math.floor(params.details.taxAmount * 1_000_000))
          : (params.amount * BigInt(cryptoService.calculateTaxBps(params.details.taxRate ?? 0))) / 10000n;
        const expectedTotal = params.amount + taxAmountMicro;
        const taxRateBps = params.amount > 0n ? Number((taxAmountMicro * 10000n) / params.amount) : 0;
        const lineItemsSum = params.details.lineItems.reduce<bigint>((acc, item) => {
          const amt = item.amount ?? Math.round((item.quantity ?? 0) * (item.unitPrice ?? 0));
          return acc + BigInt(Math.round(amt * 1_000_000));
        }, 0n);
        const orderIdField = await cryptoService.hashObjectToField(
          params.details.orderId ?? params.details.invoiceNumber
        );
        const currencyField = await cryptoService.hashObjectToField(params.details.currency);
        const itemsHashField = await cryptoService.hashObjectToField(params.details.lineItems);
        const memoHashField = await cryptoService.hashObjectToField(params.details.notes ?? '');

        // Compute invoice hash via contract helper for parity
        let invoiceHash: AleoField;
        try {
          invoiceHash = await protocolService.computeInvoiceHashOffline({
            seller: publicKey as AleoAddress,
            buyer: buyerAddress,
            amount: params.amount,
            taxAmount: taxAmountMicro,
            dueDate: dueTimestamp,
            nonce: nonceField,
            orderId: orderIdField,
            currency: currencyField,
            itemsHash: itemsHashField,
            memoHash: memoHashField
          });
        } catch (err: any) {
          console.error('computeInvoiceHashOffline failed', err);
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Local compute is unavailable. Please retry in a modern browser or reload.'
          );
        }

        // Debug log: record original data and computed hash
        console.log('🔍 [CREATE] Original details:', JSON.stringify(params.details, null, 2));
        console.log('🔍 [CREATE] Canonical JSON:', JSON.stringify(params.details, Object.keys(params.details).sort()));
        console.log('🔍 [CREATE] Computed hash:', invoiceHash);

        updateProgress(15, `✓ Invoice hash: ${invoiceHash.slice(0, 20)}...`);
        const amountStr = `${params.amount.toString()}u64`;
        const orderId = orderIdField;
        const taxAmount = `${taxAmountMicro.toString()}u64`;
        const currentTime = `${cryptoService.nowToU32()}u32`;

        updateProgress(25, '✓ Transaction parameters prepared');

        // Wave 3 JCT-only: params.taxGroups, params.tNumber, params.currencyFlag are required
        const currencyFlagU8 = params.currencyFlag;
        updateProgress(26, 'Computing tax_tag and jct_registration...');
        const taxTagField = await cryptoService.hashTaxGroups(params.taxGroups);
        const jctRegField = await cryptoService.hashTNumber(params.tNumber);
        const totalAmountU64 =
          params.taxGroups.group_a.net_sum +
          params.taxGroups.group_a.tax_sum +
          params.taxGroups.group_b.net_sum +
          params.taxGroups.group_b.tax_sum;
        const taxGroupsStr = cryptoService.serializeTaxGroupsForContract(params.taxGroups);
        const jctStruct = `{tax_groups: ${taxGroupsStr}, tax_tag: ${taxTagField}, total_amount: ${totalAmountU64}u64, jct_registration: ${jctRegField}, currency_flag: ${currencyFlagU8}u8}`;

        // ==================== Phase 2: Submit transaction request (async task submission) ====================

        startTx('REQUESTING');
        updateProgress(30, 'REQUESTING - Submitting transaction request...');

        const chainId = getChainIdFromNetwork(getNetworkFromEnv());
        let computedInvoiceId: AleoField | null = null;
        try {
          computedInvoiceId = await protocolService.computeInvoiceIdOffline({
            seller: publicKey as AleoAddress,
            buyer: buyerAddress,
            amount: params.amount,
            dueDate: dueTimestamp,
            nonce: nonceField
          });
          updateProgress(28, `✓ Invoice ID computed: ${computedInvoiceId.slice(0, 12)}...`);
        } catch (e) {
          console.warn('computeInvoiceIdOffline failed, will fall back to hash as ID', e);
        }

        let provingTimer: ReturnType<typeof setInterval> | null = null;
        const provingStartedAt = Date.now();
        provingTimer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - provingStartedAt) / 1000);
          updateProgress(
            40,
            `Wallet is generating proof... ${elapsed}s elapsed (testnet can take a few minutes)`
          );
        }, 5000);

        const arbiterAddress = (params.details as any)?.arbiter?.trim() || publicKey;

        let requestId: string | null = null;
        try {
          requestId = await walletService.requestTransaction({
            functionName: 'create_invoice',
            inputs: [
              buyerAddress,
              amountStr,
              taxAmount,
              `${dueTimestamp}u32`,
              invoiceHash,
              nonceField,
              currentTime,
              orderId,
              currencyField,
              itemsHashField,
              memoHashField,
              `${lineItemsSum}u64`,
              `${expectedTotal}u64`,
              `${taxRateBps}u64`,
              jctStruct,
              arbiterAddress
            ],
            publicKey: publicKey,
            programId: PROGRAM_ID,
            fee: 1000000,
            chainId: chainId
          });
          console.log('[TransactionController] requestTransaction result', requestId);
        } finally {
          if (provingTimer) clearInterval(provingTimer);
        }
        updateProgress(50, '✓ Proof generated by wallet');
        updateProgress(50, '✓ Proof generated by wallet');

        if (!requestId) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Transaction failed - no response from wallet'
          );
        }

        // Note: requestTransaction returns requestId after proof generation
        updateProgress(60, `✓ Transaction request submitted (requestId: ${requestId.slice(0, 20)}...)`);

        const invoiceId = (computedInvoiceId ?? invoiceHash) as AleoField;

        // ==================== Phase 3: Local encrypted archival & instant redirect ====================

        startTx('ARCHIVING');
        updateProgress(90, 'ARCHIVING - Encrypting and storing invoice details...');

        // Ensure currentMasterKey exists
        if (!currentMasterKey) {
          console.error('❌ [TransactionController] Master key is missing:', {
            masterKeyFromStore: masterKey,
            currentMasterKey,
            publicKey
          });
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Master key is missing. Cannot encrypt invoice details.',
            { hint: 'Please try creating the invoice again' }
          );
        }

        // Add debug log
        console.log('🔍 [TransactionController] Preparing encrypted storage:', {
          currentMasterKey: currentMasterKey ? `${currentMasterKey.slice(0, 10)}...` : 'null',
          masterKeyLength: currentMasterKey?.length,
          invoiceHash,
          hasDetails: !!params.details,
          detailsKeys: params.details ? Object.keys(params.details) : []
        });

        try {
          // Encrypt invoice details
          const encryptedPayload = await cryptoService.encryptPayload(
            params.details,
            currentMasterKey
          );
          updateProgress(92, '✓ Invoice details encrypted');
          console.log('✅ [TransactionController] Invoice details encrypted successfully:', {
            payloadSize: JSON.stringify(encryptedPayload).length,
            hasCiphertext: !!encryptedPayload.ciphertext,
            hasIv: !!encryptedPayload.iv
          });

          // No longer saving to IndexedDB separately; addInvoice handles full persistence
          updateProgress(95, '✓ Invoice details encrypted');
          console.log('✅ [TransactionController] Invoice details encrypted successfully');
        } catch (error: any) {
          // Log detailed error information
          console.error('❌ [TransactionController] Encryption failed:', {
            error,
            errorType: error?.constructor?.name,
            errorMessage: error?.message,
            masterKeyExists: !!currentMasterKey,
            invoiceHash,
            hasDetails: !!params.details
          });

          // If encryption failed
          if (error?.message?.includes('encrypt') ||
              error?.message?.includes('Encryption') ||
              error?.message?.includes('deriveEncryptionKey')) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'Failed to encrypt invoice details',
              {
                originalError: error,
                hint: 'Master key may be invalid or missing. Please try again.'
              }
            );
          }

          // Re-throw other errors directly
          throw error;
        }

        // Update Invoice Store (using the new persistence method, which automatically saves full invoice to IndexedDB)
        if (invoiceStore?.addInvoice) {
          const invoicePayload: any = {
            id: invoiceId,
            seller: publicKey,
            buyer: buyerAddress,
            amount: params.amount,
            invoiceHash: invoiceHash,
            dueDate: params.dueDate,
            createdAt: new Date(),
            status: 0,
            nonce: nonceField,
            auditKey: params.audit?.auditKey,
            details: params.details,
            metadata: {
              confirmationStatus: 'SENDING',
              lastUpdated: new Date(),
              dataSource: 'local',
              action: 'create'
            }
          };
          console.log('🔍 [DEBUG-ARBITER] addInvoice payload:', {
            invoiceId,
            invoiceHash: invoiceHash?.slice(0, 30),
            hasDetails: !!params.details,
            arbiter: (params.details as any)?.arbiter ?? 'NOT SET',
            detailKeys: params.details ? Object.keys(params.details) : [],
          });
          invoicePayload.taxTag = taxTagField;
          invoicePayload.jctRegistration = jctRegField;
          invoicePayload.totalAmount = totalAmountU64;
          invoicePayload.currencyFlag = currencyFlagU8;
          invoicePayload.taxGroups = params.taxGroups;
          invoicePayload.tNumber = params.tNumber;
          // Persist immediately to IndexedDB so details (including arbiter) survive
          // page reloads / HMR. Status stays SENDING; AutoPoller updates to CONFIRMED later.
          await invoiceStore.addInvoice(invoicePayload, {
            masterKey: currentMasterKey,
            persistFull: true
          });
          updateProgress(97, '✓ Saved locally in memory (status: SENDING)');
          console.log('✅ [TransactionController] Invoice saved to Store memory as SENDING:', invoiceHash);
        }

        updateProgress(98, '✓ Status synced');
        updateProgress(100, '✓ Invoice created successfully!');

        // Complete transaction
        completeTx();

        // Return invoiceHash and invoiceId (invoiceId needed by caller for executeSetAuditAuthorization)
        // Note: Per the sequence diagram, redirect to /invoices/:hash after archival succeeds
        return { invoiceHash, invoiceId };
      } catch (error: any) {
        // Reset state
        completeTx();
        // Re-throw error for View layer to handle
        throw error;
      }
    },
    [publicKey, masterKey, setMasterKey, tryRestoreMasterKey, startTx, updateProgress, completeTx, invoiceStore, walletService, wallet]
  );

  /**
   * Execute invoice payment.
   * Wave 3.1: Credits → pay_invoice_credits_private (single-step private transfer + settlement commitment)
   *           USDCx   → currently unsupported until stablecoin program ID is finalized.
   */
  const executePay = useCallback(
    async (invoice: Invoice): Promise<AleoTransactionId> => {
      try {
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        if (!walletService) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet service not initialized.'
          );
        }

        const rawFlag = invoice.currencyFlag;
        const currencyFlag: CurrencyFlag =
          rawFlag == null
            ? CurrencyFlag.CREDITS
            : typeof rawFlag === 'number' && !isNaN(rawFlag)
              ? rawFlag
              : Number(cleanAleoNumber(String(rawFlag))) || CurrencyFlag.CREDITS;
        const payAmount = invoice.totalAmount ?? invoice.amount;

        startTx('REQUESTING');
        updateProgress(10, 'Fetching invoice record from chain...');

        const { rawRecord } = await scanInvoiceRecord(invoice.invoiceHash, invoice.id);

        if (!rawRecord) {
          throw new Error('Invoice record not found on chain. Please wait for chain confirmation.');
        }

        const invoiceRecord = rawRecord;
        updateProgress(30, 'Invoice record found. Selecting credits record...');

        const chainId = getChainIdFromNetwork(getNetworkFromEnv());

        if (currencyFlag === CurrencyFlag.USDCX) {
          if (!USDCX_PROGRAM_ID) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'USDCx payment requires NEXT_PUBLIC_USDCX_PROGRAM_ID to be set.'
            );
          }

          // USDCx public path: wallet signs directly (no Token record / MerkleProof input).
          updateProgress(36, 'Preparing USDCx payment...');
          const usdcxInvoiceRecordStr = toRecordInputString(invoiceRecord);

          // --- Payment nonce & paid_at ---
          const usdcxNowSec = Math.floor(Date.now() / 1000);
          const usdcxDueDateSec = Math.floor(invoice.dueDate.getTime() / 1000);
          const usdcxPaidAtSec = Math.min(usdcxNowSec, usdcxDueDateSec);
          const usdcxPaidAt = `${usdcxPaidAtSec}u32`;
          const usdcxPaymentNonce = await cryptoService.hashObjectToField(`PAY-${Date.now()}-${Math.random()}`);

          // --- Submit transaction ---
          updateProgress(50, 'Submitting pay_invoice_usdcx...');
          const usdcxRequestId = await walletService.requestTransaction({
            functionName: 'pay_invoice_usdcx',
            inputs: [usdcxInvoiceRecordStr, usdcxPaymentNonce, usdcxPaidAt],
            publicKey,
            programId: PROGRAM_ID,
            fee: 1_000_000,
            chainId,
          });

          if (!usdcxRequestId) {
            throw new WalletServiceError(
              WalletError.UNAUTHORIZED,
              'USDCx payment transaction failed - no response from wallet'
            );
          }

          // --- Local receipt & settlement anchor (async, mirrors Credits path) ---
          try {
            void receiptStore.addReceipt({
              paymentId: usdcxRequestId as AleoField,
              invoiceId: invoice.id,
              payer: invoice.buyer,
              payee: invoice.seller,
              amount: payAmount,
              paidAt: new Date(usdcxPaidAtSec * 1000),
              txId: usdcxRequestId as AleoTransactionId
            });
            protocolService.computeSettlementAnchorOffline({
              invoiceId: invoice.id,
              amount: payAmount,
              nonce: usdcxPaymentNonce
            }).then((anchor) => {
              void receiptStore.updateReceipt(invoice.id, { settlementAnchor: anchor });
            }).catch((err) => {
              console.warn('⚠️ [executePay/usdcx] Failed to compute settlement_anchor locally:', err);
            });
          } catch (err) {
            console.warn('⚠️ [executePay/usdcx] Failed to add receipt locally:', err);
          }

          // --- Update invoice metadata to SENDING (let AutoPoller confirm) ---
          if (invoiceStore?.updateInvoice && masterKey) {
            try {
              await invoiceStore.updateInvoice(invoice.id, {
                metadata: {
                  confirmationStatus: 'SENDING',
                  dataSource: 'local',
                  action: 'pay'
                }
              } as any, {
                masterKey: masterKey,
                persistFull: true
              });
              console.log('✅ [executePay/usdcx] Updated invoice metadata to SENDING:', invoice.id);
            } catch (error) {
              console.error('❌ [executePay/usdcx] Failed to update invoice metadata:', error);
            }
          }

          updateProgress(90, 'USDCx payment transaction submitted successfully');
          updateProgress(100, '✓ USDCx payment completed!');
          completeTx();
          return usdcxRequestId as AleoTransactionId;
        }

        // Credits path: use getFeeRecords to select optimal credits record(s); pay_invoice_credits_private accepts a single record
        const recordStrings = await walletService.getFeeRecords(payAmount, publicKey);
        if (recordStrings.length === 0) {
          throw new WalletServiceError(
            WalletError.INSUFFICIENT_FEE,
            'No credits record available in wallet. Please ensure you have private credits (e.g. receive or transfer privately first).'
          );
        }
        if (recordStrings.length > 1) {
          throw new WalletServiceError(
            WalletError.INSUFFICIENT_FEE,
            'Payment requires a single credits record covering the amount. Your balance is split across multiple records; consider consolidating.'
          );
        }
        // Wallet/Shield expect inputs as strings; passing objects causes "Invalid transaction payload"
        const payRecordStr = recordStrings[0];
        const invoiceRecordStr = toRecordInputString(invoiceRecord);

        // Generate payment nonce and paid_at.
        // Contract asserts paid_at <= invoice.due_date; use min(now, due_date) so overdue invoices can still be paid.
        const nowSec = Math.floor(Date.now() / 1000);
        const dueDateSec = Math.floor(invoice.dueDate.getTime() / 1000);
        const paidAtSec = Math.min(nowSec, dueDateSec);
        const paidAt = `${paidAtSec}u32`;

        const paymentNonce = await cryptoService.hashObjectToField(`PAY-${Date.now()}-${Math.random()}`);

        updateProgress(50, 'Submitting pay_invoice_credits_private...');
        const requestId = await walletService.requestTransaction({
          functionName: 'pay_invoice_credits_private',
          inputs: [payRecordStr, invoiceRecordStr, paymentNonce, paidAt],
          publicKey: publicKey,
          programId: PROGRAM_ID,
          fee: 1_000_000,
          chainId: chainId
        });

        if (!requestId) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Payment transaction failed - no response from wallet'
          );
        }

        try {
          void receiptStore.addReceipt({
            paymentId: requestId as AleoField,
            invoiceId: invoice.id,
            payer: invoice.buyer,
            payee: invoice.seller,
            amount: payAmount,
            paidAt: new Date(Number(paidAt.replace(/u32$/, '')) * 1000),
            txId: requestId as AleoTransactionId
          });
          // Wave 3: immediately compute and store settlement_anchor locally so audit Step 2
          // is available without waiting for the PaymentRecord to be scanned from chain.
          protocolService.computeSettlementAnchorOffline({
            invoiceId: invoice.id,
            amount: payAmount,
            nonce: paymentNonce
          }).then((anchor) => {
            void receiptStore.updateReceipt(invoice.id, { settlementAnchor: anchor });
          }).catch((err) => {
            console.warn('⚠️ [executePay] Failed to compute settlement_anchor locally:', err);
          });
        } catch (err) {
          console.warn('⚠️ [executePay] Failed to add receipt locally:', err);
        }

        // Update invoice metadata, change confirmationStatus to SENDING, and set action to 'pay'
        if (invoiceStore?.updateInvoice && masterKey) {
          try {
            await invoiceStore.updateInvoice(invoice.id, {
              metadata: {
                confirmationStatus: 'SENDING',
                dataSource: 'local',
                action: 'pay' // Identifies this as a payment operation
              }
            } as any, {
              masterKey: masterKey,
              persistFull: true
            });
            console.log('✅ [executePay] Updated invoice metadata to SENDING with action=pay:', invoice.id);
          } catch (error) {
            console.error('❌ [executePay] Failed to update invoice metadata:', error);
            // Do not throw error since the transaction was already submitted successfully
          }
        }

        updateProgress(90, 'Payment transaction submitted successfully');
        updateProgress(100, '✓ Payment completed!');

        completeTx();

        // Return requestId as transactionId
        return requestId as AleoTransactionId;
      } catch (error: any) {
        completeTx();
        throw error;
      }
    },
    [publicKey, walletService, protocolService, scanInvoiceRecord, cryptoService, startTx, updateProgress, completeTx, invoiceStore, masterKey, receiptStore]
  );

  /**
   * Execute invoice cancellation (cancel_invoice)
   */
  const executeCancel = useCallback(
    async (invoice: Invoice): Promise<AleoTransactionId> => {
      try {
        // Check wallet connection
        if (!publicKey) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Wallet not connected. Please connect your wallet first.'
          );
        }

        if (!walletService) {
          throw new WalletServiceError(
            WalletError.NOT_INSTALLED,
            'Wallet service not initialized.'
          );
        }

        startTx('REQUESTING');
        updateProgress(10, 'Fetching invoice record from chain...');

        // Scan chain to get invoice record
        const { rawRecord } = await scanInvoiceRecord(invoice.invoiceHash, invoice.id);

        if (!rawRecord) {
          throw new Error('Invoice record not found on chain. Please wait for chain confirmation.');
        }

        // Use raw record; wallet expects string inputs (Shield rejects objects → "Invalid transaction payload")
        const invoiceRecordStr = toRecordInputString(rawRecord);

        updateProgress(40, 'Invoice record found. Preparing cancellation...');

        // 2. Call cancel_invoice transition
        const chainId = getChainIdFromNetwork(getNetworkFromEnv());
        const requestId = await walletService.requestTransaction({
          functionName: 'cancel_invoice',
          inputs: [invoiceRecordStr],
          publicKey: publicKey,
          programId: PROGRAM_ID,
          fee: 1000000,
          chainId: chainId
        });
        if (!requestId) {
          throw new WalletServiceError(
            WalletError.UNAUTHORIZED,
            'Cancellation transaction failed - no response from wallet'
          );
        }

        // Update invoice metadata, change confirmationStatus to SENDING, and set action to 'cancel'
        if (invoiceStore?.updateInvoice && masterKey) {
          try {
            await invoiceStore.updateInvoice(invoice.id, {
              metadata: {
                confirmationStatus: 'SENDING',
                dataSource: 'local',
                action: 'cancel' // Identifies this as a cancel operation
              }
            } as any, {
              masterKey: masterKey,
              persistFull: true
            });
            console.log('✅ [executeCancel] Updated invoice metadata to SENDING with action=cancel:', invoice.id);
          } catch (error) {
            console.error('❌ [executeCancel] Failed to update invoice metadata:', error);
            // Do not throw error since the transaction was already submitted successfully
          }
        }

        updateProgress(90, 'Cancellation transaction submitted successfully');
        updateProgress(100, '✓ Invoice cancelled!');

        completeTx();

        // Return requestId as transactionId
        return requestId as AleoTransactionId;
      } catch (error: any) {
        completeTx();
        throw error;
      }
    },
    [publicKey, walletService, scanInvoiceRecord, startTx, updateProgress, completeTx, invoiceStore, masterKey]
  );

  return {
    isProcessing,
    currentProgress: progress,
    currentLog: logs[logs.length - 1] || '',
    executeCreateInvoice,
    executePay,
    executeCancel,
    executeSetAuditAuthorization: async (
      invoice: Invoice,
      auditKeyHash: string,
      scopesBitmask: bigint,
      expiresAt: number
    ): Promise<AleoTransactionId> => {
      if (!publicKey) {
        throw new WalletServiceError(
          WalletError.UNAUTHORIZED,
          'Wallet not connected. Please connect your wallet first.'
        );
      }
      if (!walletService) {
        throw new WalletServiceError(
          WalletError.NOT_INSTALLED,
          'Wallet service not initialized.'
        );
      }
      if (invoice.seller !== publicKey) {
        throw new WalletServiceError(
          WalletError.UNAUTHORIZED,
          'Only the seller can set audit authorization for this invoice.'
        );
      }

      startTx('REQUESTING');
      updateProgress(10, 'Fetching invoice record from chain...');

      const { rawRecord } = await scanInvoiceRecord(invoice.invoiceHash, invoice.id);
      if (!rawRecord) {
        completeTx();
        throw new Error('Invoice record not found on chain. Please sync and try again.');
      }
      if (rawRecord.spent === true || rawRecord.spent === 'true') {
        completeTx();
        throw new Error('Invoice record is already spent. Cannot set audit authorization on spent record.');
      }

      const rawRecordStr = toRecordInputString(rawRecord);
      const currentTime = `${Math.floor(Date.now() / 1000)}u32`;
      const requestId = await walletService.requestTransaction({
        functionName: 'set_audit_authorization',
        inputs: [
          rawRecordStr,
          auditKeyHash as AleoField,
          `${scopesBitmask.toString()}u64`,
          `${expiresAt}u32`,
          currentTime
        ],
        publicKey,
        programId: PROGRAM_ID,
        fee: 1000000,
        chainId: getChainIdFromNetwork(getNetworkFromEnv())
      });

      if (!requestId) {
        completeTx();
        throw new WalletServiceError(
          WalletError.UNAUTHORIZED,
          'Audit authorization transaction failed - no response from wallet'
        );
      }

      updateProgress(100, '✓ Audit authorization submitted');
      completeTx();
      return requestId as AleoTransactionId;
    },

    // Wave 4: Dispute methods
    executeRaiseDispute: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const nowSec = Math.floor(Date.now() / 1000);
      const deadlineSec = nowSec + params.resolutionDeadlineDays * 86400;

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Validating dispute parameters...');

        const arbiter = params.arbiter ?? params.invoice.details?.arbiter;
        if (!arbiter) {
          throw new Error('Arbiter address is required for raising a dispute.');
        }
        updateProgress(50, 'Submitting raise_dispute...');
        const requestId = await walletService.requestTransaction({
          functionName: 'raise_dispute',
          inputs: [
            params.invoice.id,
            `${InvoiceStatus.ESCROWED}u8`,
            params.invoice.buyer,
            params.invoice.seller,
            arbiter,
            params.reasonHash,
            params.evidenceHash,
            `${nowSec}u32`,
            `${deadlineSec}u32`,
          ],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Dispute raised');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },

    executeResolveDispute: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const resolutionHash = await cryptoService.hashObjectToField(`RESOLVE-${Date.now()}`);

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Fetching dispute record...');
        const { records: disputeRecords } = await walletService.requestRecords(PROGRAM_ID_V4);
        // Match by invoice_id for the same reason as escrow: the local disputeId is a
        // placeholder, not the on-chain BHP256 hash.
        const disputeRecord = disputeRecords?.find((r: any) => {
          if (r?.spent === true || r?.spent === 'true') return false;
          const rid = extractRecordField(r, 'invoice_id');
          return rid === params.invoice.id;
        });
        if (!disputeRecord) {
          throw new Error(
            `Dispute record not found in wallet for invoice ${params.invoice?.id}. ` +
            'Ensure you are the arbiter and the dispute transaction is confirmed on-chain.'
          );
        }
        const disputeRecordStr = toRecordInputString(disputeRecord);

        updateProgress(50, 'Submitting resolve_dispute...');
        const requestId = await walletService.requestTransaction({
          functionName: 'resolve_dispute',
          inputs: [disputeRecordStr, `${params.resolution}u8`, resolutionHash],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Dispute resolved');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },

    executeSubmitEvidence: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Fetching dispute record...');
        const { records: disputeRecords } = await walletService.requestRecords(PROGRAM_ID_V4);
        const disputeRecord = disputeRecords?.find((r: any) => {
          if (r?.spent === true || r?.spent === 'true') return false;
          const rid = extractRecordField(r, 'invoice_id');
          return rid === params.invoice?.id;
        });
        if (!disputeRecord) {
          throw new Error(
            `Dispute record not found in wallet for invoice ${params.invoice?.id}. ` +
            'Ensure the dispute transaction is confirmed on-chain.'
          );
        }
        const disputeRecordStr = toRecordInputString(disputeRecord);

        updateProgress(50, 'Submitting evidence...');
        const requestId = await walletService.requestTransaction({
          functionName: 'submit_evidence',
          inputs: [disputeRecordStr, params.newEvidenceHash],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Evidence submitted');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },

    // Wave 4: Escrow methods
    executeEscrowPayment: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const payAmount = params.invoice.totalAmount ?? params.invoice.amount;
      const nowSec = Math.floor(Date.now() / 1000);
      const deadlineSec = Math.floor(params.escrowConfig.deliveryDeadline.getTime() / 1000);
      const arbiter = params.escrowConfig.arbiter ?? params.invoice.details?.arbiter;
      if (!arbiter) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Arbiter address is required for escrow payment. The seller must set an arbiter when creating the invoice.');
      }

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Selecting payment record...');

        const recordStrings = await walletService.getFeeRecords(payAmount, publicKey);
        if (recordStrings.length === 0) {
          throw new WalletServiceError(WalletError.INSUFFICIENT_FEE, 'No credits record available.');
        }
        const payRecordStr = recordStrings[0];

        updateProgress(50, 'Submitting escrow_payment_credits...');
        const requestId = await walletService.requestTransaction({
          functionName: 'escrow_payment_credits',
          inputs: [
            payRecordStr,
            params.invoice.id,
            params.invoice.seller,
            `${payAmount.toString()}u64`,
            `${deadlineSec}u32`,
            arbiter,
            `${nowSec}u32`,
          ],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Payment locked in escrow');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },

    executeConfirmDelivery: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const nowSec = Math.floor(Date.now() / 1000);
      const paymentNonce = await cryptoService.hashObjectToField(`DELIVERY-${Date.now()}-${Math.random()}`);

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Fetching escrow record...');
        const { records: escrowRecords } = await walletService.requestRecords(PROGRAM_ID_V4);
        // Match by invoice_id (always reliable). The local escrowId is a placeholder
        // derived from the tx request ID, not the on-chain BHP256 hash.
        const escrowRecord = findEscrowRecordByInvoice(escrowRecords, params.invoice.id);
        if (!escrowRecord) {
          throw new Error(
            `Escrow record not found in wallet for invoice ${params.invoice.id}. ` +
            'Ensure you are the payer and the escrow transaction is confirmed on-chain.'
          );
        }
        const escrowRecordStr = toRecordInputString(escrowRecord);

        updateProgress(50, 'Submitting confirm_delivery...');
        const requestId = await walletService.requestTransaction({
          functionName: 'confirm_delivery',
          inputs: [escrowRecordStr, paymentNonce, `${nowSec}u32`],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Delivery confirmed, funds released');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },

    executeTimeoutRefund: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const nowSec = Math.floor(Date.now() / 1000);

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Fetching escrow record...');
        const { records: escrowRecords } = await walletService.requestRecords(PROGRAM_ID_V4);
        const escrowRecord = findEscrowRecordByInvoice(escrowRecords, params.invoice.id);
        if (!escrowRecord) {
          throw new Error(
            `Escrow record not found in wallet for invoice ${params.invoice.id}. ` +
            'Ensure you are the payer and the escrow transaction is confirmed on-chain.'
          );
        }
        const escrowRecordStr = toRecordInputString(escrowRecord);

        updateProgress(50, 'Submitting timeout_refund...');
        const requestId = await walletService.requestTransaction({
          functionName: 'timeout_refund',
          inputs: [escrowRecordStr, `${nowSec}u32`],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Refund processed');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },

    executeArbiterResolve: async (params: any): Promise<AleoTransactionId> => {
      if (!publicKey || !walletService) {
        throw new WalletServiceError(WalletError.UNAUTHORIZED, 'Wallet not connected.');
      }
      const { PROGRAM_ID_V4 } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const nowSec = Math.floor(Date.now() / 1000);
      const decisionU8 = params.decision === 'release' ? 1 : 2;
      const resolutionNonce = await cryptoService.hashObjectToField(`ARBITER-${Date.now()}-${Math.random()}`);

      startTx('REQUESTING');
      try {
        updateProgress(10, 'Fetching escrow record...');
        const { records: escrowRecords } = await walletService.requestRecords(PROGRAM_ID_V4);
        const escrowRecord = findEscrowRecordByInvoice(escrowRecords, params.invoice.id);
        if (!escrowRecord) {
          throw new Error(
            `Escrow record not found in wallet for invoice ${params.invoice.id}. ` +
            'Ensure you are the arbiter and the escrow transaction is confirmed on-chain.'
          );
        }
        const escrowRecordStr = toRecordInputString(escrowRecord);

        updateProgress(50, 'Submitting arbiter_resolve...');
        const requestId = await walletService.requestTransaction({
          functionName: 'arbiter_resolve',
          inputs: [escrowRecordStr, `${decisionU8}u8`, resolutionNonce, `${nowSec}u32`],
          publicKey,
          programId: PROGRAM_ID_V4,
          fee: 1000000,
          chainId,
        });
        updateProgress(100, '✓ Arbiter resolution submitted');
        completeTx();
        return requestId as AleoTransactionId;
      } catch (error) {
        completeTx();
        throw error;
      }
    },
  };
}
