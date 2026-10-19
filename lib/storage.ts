'use client';

import { openDB, DBSchema as IDBDBSchema } from 'idb';
import type { AuditKey, EncryptedPayload } from './types';

const DB_NAME = 'zk-invoice-db';
const DB_VERSION = 1;

interface InvoiceDBSchema extends IDBDBSchema {
  encryptedInvoices: {
    key: string;
    value: {
      invoiceId: string;
      ciphertext: string;
      iv: string;
      createdAt: number;
    };
    indexes: { byCreatedAt: number };
  };
  transactionHistory: {
    key: string;
    value: {
      txId: string;
      type: 'create' | 'pay' | 'cancel';
      invoiceId: string;
      status: 'pending' | 'confirmed' | 'failed';
      timestamp: number;
    };
    indexes: { byInvoiceId: string; byTimestamp: number };
  };
  auditKeys: {
    key: string;
    value: AuditKey;
  };
}

async function getDB() {
  return openDB<InvoiceDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('encryptedInvoices')) {
        const store = db.createObjectStore('encryptedInvoices', {
          keyPath: 'invoiceId'
        });
        store.createIndex('byCreatedAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('transactionHistory')) {
        const store = db.createObjectStore('transactionHistory', {
          keyPath: 'txId'
        });
        store.createIndex('byInvoiceId', 'invoiceId');
        store.createIndex('byTimestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('auditKeys')) {
        db.createObjectStore('auditKeys', { keyPath: 'key' });
      }
    }
  });
}

export async function saveEncryptedInvoice(
  invoiceId: string,
  payload: EncryptedPayload
) {
  const db = await getDB();
  await db.put('encryptedInvoices', {
    invoiceId,
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    createdAt: Date.now()
  });
}

export async function getEncryptedInvoice(
  invoiceId: string
): Promise<EncryptedPayload | null> {
  const db = await getDB();
  const result = await db.get('encryptedInvoices', invoiceId);
  if (!result) return null;
  return { ciphertext: result.ciphertext, iv: result.iv };
}

export async function saveTransaction(entry: {
  txId: string;
  type: 'create' | 'pay' | 'cancel';
  invoiceId: string;
  status: 'pending' | 'confirmed' | 'failed';
}) {
  const db = await getDB();
  await db.put('transactionHistory', {
    ...entry,
    timestamp: Date.now()
  });
}

export async function getTransactions(): Promise<
  InvoiceDBSchema['transactionHistory']['value'][]
> {
  const db = await getDB();
  return db.getAllFromIndex('transactionHistory', 'byTimestamp');
}

export async function saveAuditKey(key: AuditKey) {
  const db = await getDB();
  await db.put('auditKeys', key);
}

export async function listAuditKeys(): Promise<AuditKey[]> {
  const db = await getDB();
  return db.getAll('auditKeys');
}
