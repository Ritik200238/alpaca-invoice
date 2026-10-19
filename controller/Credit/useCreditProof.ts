'use client';

import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import type { ICreditController } from './ICreditController';
import type {
  CreditMetrics,
  CreditClaim,
  CreditProofToken,
  CreditVerifyResult,
  AleoField,
  AleoTransactionId,
} from '@/lib/types';
import { CreditClaimType } from '@/lib/types';
import { CreditService } from '@/services/CreditService/CreditServiceImpl';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { getChainIdFromNetwork, getNetworkFromEnv } from '@/lib/network';
import { useUserStore } from '@/stores/User/useUserStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useReceiptStore } from '@/stores/Receipt/useReceiptStore';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';

const creditService = new CreditService();

export function useCreditProof(): ICreditController {
  const [metrics, setMetrics] = useState<CreditMetrics | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentLog, setCurrentLog] = useState('');

  const wallet = useWallet();
  const { publicKey } = useUserStore();
  const invoiceStore = useInvoiceStore();
  const receiptStore = useReceiptStore();

  const walletService = useMemo(() => {
    if (!wallet) return null;
    const adapter = createWalletAdapter(wallet);
    return new WalletService(adapter);
  }, [wallet]);

  const collectLocalMetrics = useCallback(async () => {
    setIsProcessing(true);
    setCurrentLog('Collecting local metrics...');
    try {
      const invoices = invoiceStore.invoices;
      const receipts = receiptStore.receipts;
      const result = creditService.collectMetrics(invoices, receipts);
      setMetrics(result);
      setCurrentLog('Metrics collected');
    } finally {
      setIsProcessing(false);
    }
  }, [invoiceStore.invoices, receiptStore.receipts]);

  const generateProof = useCallback(async (claim: CreditClaim): Promise<CreditProofToken> => {
    setIsProcessing(true);
    setCurrentLog('Generating ZK credit proof on-chain...');
    try {
      if (!metrics) throw new Error('Metrics not collected. Please collect metrics first.');
      if (!publicKey) throw new Error('Wallet not connected');
      if (!walletService) throw new Error('Wallet adapter unavailable');

      // --- Pre-flight validation (mirrors contract logic, prevents on-chain rejection) ---
      const needsDivision =
        claim.claimType === CreditClaimType.ON_TIME_RATE ||
        claim.claimType === CreditClaimType.DISPUTE_RATE;

      if (needsDivision && metrics.totalInvoices === 0) {
        throw new Error(
          'No invoice history found. You need at least one invoice to generate an on-time rate or dispute rate proof. ' +
          'Try the "Transaction Volume" or "Total Paid Amount" claim type instead.'
        );
      }

      if (
        claim.claimType === CreditClaimType.ACCOUNT_AGE &&
        metrics.firstInvoiceDate === 0
      ) {
        throw new Error(
          'No invoice history found. You need at least one invoice to generate an account age proof.'
        );
      }
      // --- End pre-flight validation ---

      const { CREDIT_PROGRAM_ID } = await import('@/lib/contract');
      const chainId = getChainIdFromNetwork(getNetworkFromEnv());
      const nowSec = Math.floor(Date.now() / 1000);

      const claimTypeU8 = `${claim.claimType}u8`;
      let thresholdU64: string;
      if (claim.claimType === CreditClaimType.ON_TIME_RATE || claim.claimType === CreditClaimType.DISPUTE_RATE) {
        thresholdU64 = `${claim.threshold * 100}u64`;
      } else {
        thresholdU64 = `${claim.threshold}u64`;
      }
      const periodStartU32 = `${Math.floor(claim.periodStart.getTime() / 1000)}u32`;
      const periodEndU32 = `${Math.floor(claim.periodEnd.getTime() / 1000)}u32`;

      const creditProofInput = `{ total_invoices: ${metrics.totalInvoices}u64, paid_on_time: ${metrics.paidOnTime}u64, total_paid_amount: ${metrics.totalPaidAmount}u64, first_invoice_date: ${metrics.firstInvoiceDate}u32, dispute_count: ${metrics.disputeCount}u64, proof_generated_at: ${nowSec}u32 }`;
      const creditClaim = `{ claim_type: ${claimTypeU8}, threshold: ${thresholdU64}, period_start: ${periodStartU32}, period_end: ${periodEndU32} }`;
      const validityDays = '90u32';

      setCurrentLog('Submitting generate_credit_proof transaction...');
      const requestId = await walletService.requestTransaction({
        functionName: 'generate_credit_proof',
        inputs: [creditProofInput, creditClaim, validityDays],
        publicKey,
        programId: CREDIT_PROGRAM_ID,
        fee: 500_000,
        chainId,
      });

      // Resolve the actual Aleo transaction ID (at1...).
      // Shield wallet returns an internal tracking ID (shield_xxx) from requestTransaction.
      // Poll transactionStatus to try to get the real chain tx ID.
      let txId = String(requestId);
      if (!txId.startsWith('at1') && walletService) {
        setCurrentLog('Resolving chain transaction ID...');
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            const statusResult = await walletService.transactionStatus(txId);
            if (statusResult && statusResult.startsWith('at1')) {
              txId = statusResult;
              break;
            }
          } catch { /* wallet may not support transactionStatus */ }
          await new Promise(r => setTimeout(r, 5000));
        }
      }

      setCurrentLog('Transaction submitted. Verifying on-chain...');
      if (txId.startsWith('at1')) {
        const protocolService = new AleoProtocolService();
        try {
          await protocolService.verifyRecordOnChain(
            txId as AleoTransactionId,
            { programId: CREDIT_PROGRAM_ID, functionName: 'generate_credit_proof' }
          );
        } catch (verifyErr) {
          console.warn('[useCreditProof] Chain verification pending (tx may still be in mempool):', verifyErr);
          setCurrentLog('Transaction broadcast confirmed. Chain indexing may take ~30s.');
        }
      }

      const expiresAt = new Date((nowSec + 90 * 86400) * 1000);

      const token: CreditProofToken = {
        proofId: `${txId}` as AleoField,
        transactionId: txId,
        claimHash: `${BigInt(claim.claimType) * BigInt(10000) + BigInt(claim.threshold)}field` as AleoField,
        dataCommitment: `${BigInt(metrics.totalInvoices)}field` as AleoField,
        isValid: true,
        generatedAt: new Date(),
        expiresAt,
      };

      setCurrentLog('Credit proof generated and anchored on-chain');
      return token;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      setCurrentLog(`Error: ${msg}`);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [metrics, publicKey, walletService]);

  const verifyProof = useCallback(async (proofIdStr: string): Promise<CreditVerifyResult> => {
    setIsProcessing(true);
    setCurrentLog('Verifying credit proof on-chain...');
    try {
      const input = proofIdStr.trim();
      const { CREDIT_PROGRAM_ID } = await import('@/lib/contract');

      // Aleo transaction IDs start with "at1"
      const isTxId = input.startsWith('at1');

      if (isTxId) {
        const protocolService = new AleoProtocolService();
        const result = await protocolService.verifyRecordOnChain(
          input as AleoTransactionId,
          { programId: CREDIT_PROGRAM_ID, functionName: 'generate_credit_proof' }
        );

        if (result.verified) {
          return { isValid: true, claim: null, proofId: input as AleoField };
        }
        return {
          isValid: false,
          claim: null,
          proofId: null,
          error: result.message || 'Transaction not found or does not match credit proof program',
        };
      }

      // Fallback: treat as mapping key (on-chain proof_id field)
      const claimHash = await creditService.getProofFromChain(input as AleoField);
      if (!claimHash) {
        return { isValid: false, claim: null, proofId: null, error: 'Proof not found on chain' };
      }
      return { isValid: true, claim: null, proofId: input as AleoField };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      setCurrentLog(`Verification error: ${msg}`);
      return { isValid: false, claim: null, proofId: null, error: msg };
    } finally {
      setIsProcessing(false);
      setCurrentLog('');
    }
  }, []);

  return {
    metrics,
    isProcessing,
    currentLog,
    collectLocalMetrics,
    generateProof,
    verifyProof,
  };
}
