/**
 * Signature message used when deriving the master key from the wallet.
 * Must be the same everywhere so that create-invoice encryption and
 * audit/list decryption use the same key.
 */
export const MASTER_KEY_SIGNATURE_MESSAGE = 'Sign to access your private invoices';
