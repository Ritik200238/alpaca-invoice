import type { AleoAddress, AleoField } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { PROGRAM_ID, MAPPINGS } from '@/lib/contract';
import type { IInvoiceRegistryService } from './IInvoiceRegistryService';

/**
 * Minimal adapter for querying program mappings (avoids circular dependency)
 */
export interface IProgramMappingReader {
  getProgramMappingValue(
    programId: string,
    mappingName: string,
    key: AleoField | AleoAddress
  ): Promise<string | null>;
}

const CACHE_TTL_MS = 30_000;

function parseLeoAuditAuthString(raw: string): {
  audit_key_hash: AleoField;
  scopes_bitmask: bigint;
  expires_at: number;
  issuer: AleoAddress;
} | null {
  const cleaned = raw.replace(/[{}]/g, '').trim();
  if (!cleaned.includes('audit_key_hash')) return null;
  const parts = cleaned.split(',').map((p) => p.trim());
  const kv: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split(':').map((s) => s.trim());
    if (k && v) kv[k] = v.replace(/["']/g, '');
  }
  if (!kv.audit_key_hash) return null;
  const scopes = kv.scopes_bitmask || kv.scopesBitmask;
  const expires = kv.expires_at || kv.expiresAt;
  const issuer = kv.issuer;
  return {
    audit_key_hash: kv.audit_key_hash as AleoField,
    scopes_bitmask: scopes ? BigInt(scopes.replace(/u64$/i, '')) : 0n,
    expires_at: expires ? Number(expires.replace(/u32$/i, '')) : 0,
    issuer: issuer as AleoAddress
  };
}

/** Parse Leo struct string (e.g. "amount: 123field, tax_amount: 456field, ... } string") into Record<string, AleoField>. */
function parseLeoFieldCommitmentsString(raw: string): Record<string, AleoField> | null {
  const out: Record<string, string> = {};
  // Match "key: digitsfield" (key = word chars, value = digits + "field")
  const re = /(\w+):\s*(\d+field)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1];
    const val = m[2];
    out[key] = val.endsWith('field') ? val : `${val}field`;
  }
  if (Object.keys(out).length === 0) return null;
  return out as Record<string, AleoField>;
}

export class InvoiceRegistryServiceImpl implements IInvoiceRegistryService {
  private readonly reader: IProgramMappingReader;
  private readonly hashCache = new Map<string, { ts: number; hash: AleoField | null }>();
  private readonly statusCache = new Map<string, { ts: number; status: InvoiceStatus | null }>();
  private readonly commitmentCache = new Map<string, { ts: number; value: AleoField | null }>();
  private readonly fieldsCache = new Map<string, { ts: number; value: Record<string, AleoField> | null }>();
  private readonly rulesCache = new Map<string, { ts: number; value: AleoField | null }>();
  private readonly authCache = new Map<string, { ts: number; value: any }>();
  private readonly counterCache = new Map<string, { ts: number; value: bigint | null }>();
  private readonly taxTagCache = new Map<string, { ts: number; value: AleoField | null }>();
  private readonly jctRegCache = new Map<string, { ts: number; value: AleoField | null }>();
  private readonly paymentCommitmentCache = new Map<string, { ts: number; value: AleoField | null }>();

  constructor(reader: IProgramMappingReader) {
    this.reader = reader;
  }

  async getInvoiceHash(invoiceId: AleoField): Promise<AleoField | null> {
    const cached = this.hashCache.get(invoiceId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.hash;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'invoice_registry', invoiceId);
    if (!raw) {
      this.hashCache.set(invoiceId, { ts: Date.now(), hash: null });
      return null;
    }
    const val = raw.replace(/["']?/g, '') as AleoField;
    this.hashCache.set(invoiceId, { ts: Date.now(), hash: val });
    return val;
  }

  async getInvoiceTaxTag(invoiceId: AleoField): Promise<AleoField | null> {
    const key = `tax_tag-${invoiceId}`;
    const cached = this.taxTagCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, MAPPINGS.invoice_tax_tag, invoiceId);
    if (raw == null) {
      this.taxTagCache.set(key, { ts: Date.now(), value: null });
      return null;
    }
    const v = String(raw).replace(/^["']|["']$/g, '').trim();
    const val = (v === '0field' || v === '') ? null : (v.endsWith('field') ? v : `${v}field`) as AleoField;
    this.taxTagCache.set(key, { ts: Date.now(), value: val });
    return val;
  }

  async getInvoiceJctReg(invoiceId: AleoField): Promise<AleoField | null> {
    const key = `jct_reg-${invoiceId}`;
    const cached = this.jctRegCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, MAPPINGS.invoice_jct_reg, invoiceId);
    if (raw == null) {
      this.jctRegCache.set(key, { ts: Date.now(), value: null });
      return null;
    }
    const v = String(raw).replace(/^["']|["']$/g, '').trim();
    const val = (v === '0field' || v === '') ? null : (v.endsWith('field') ? v : `${v}field`) as AleoField;
    this.jctRegCache.set(key, { ts: Date.now(), value: val });
    return val;
  }

  /**
   * payment_commitments mapping: key = settlement_anchor (commitment hash), value = invoice_id.
   * Used in audit Step 2 to resolve invoice_id from settlement_anchor.
   */
  async getPaymentCommitment(settlementAnchor: AleoField): Promise<AleoField | null> {
    const key = `payment_commit-${settlementAnchor}`;
    const cached = this.paymentCommitmentCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(
      PROGRAM_ID,
      MAPPINGS.payment_commitments,
      settlementAnchor
    );
    if (raw == null) {
      this.paymentCommitmentCache.set(key, { ts: Date.now(), value: null });
      return null;
    }
    const v = String(raw).replace(/^["']|["']$/g, '').trim();
    const val = (v === '0field' || v === '') ? null : (v.endsWith('field') ? v : `${v}field`) as AleoField;
    this.paymentCommitmentCache.set(key, { ts: Date.now(), value: val });
    return val;
  }

  async getInvoiceStatus(invoiceId: AleoField): Promise<InvoiceStatus | null> {
    const cached = this.statusCache.get(invoiceId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.status;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'invoice_status', invoiceId);
    if (!raw) {
      this.statusCache.set(invoiceId, { ts: Date.now(), status: null });
      return null;
    }
    const clean = raw.replace(/u8$/i, '').replace(/["']/g, '');
    const num = Number(clean);
    const status =
      num === 0 ? InvoiceStatus.PENDING
      : num === 1 ? InvoiceStatus.PAID
      : num === 2 ? InvoiceStatus.CANCELLED
      : num === 3 ? InvoiceStatus.EXPIRED
      : null;
    this.statusCache.set(invoiceId, { ts: Date.now(), status });
    return status;
  }

  async getCommitmentRoot(invoiceId: AleoField): Promise<AleoField | null> {
    const key = `commit-${invoiceId}`;
    const cached = this.commitmentCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'invoice_commitment', invoiceId);

    const val = raw ? (String(raw).replace(/["']/g, '') as AleoField) : null;
    this.commitmentCache.set(key, { ts: Date.now(), value: val });
    return val;
  }

  async getFieldCommitments(invoiceId: AleoField): Promise<Record<string, AleoField> | null> {
    const key = `fields-${invoiceId}`;
    const cached = this.fieldsCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'invoice_field_commitments', invoiceId);
    if (!raw) {
      this.fieldsCache.set(key, { ts: Date.now(), value: null });
      return null;
    }
    let parsed: Record<string, AleoField> | null = null;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as Record<string, AleoField>;
      } catch {
        parsed = parseLeoFieldCommitmentsString(raw);
      }
    } else {
      parsed = raw as Record<string, AleoField>;
    }
    this.fieldsCache.set(key, { ts: Date.now(), value: parsed });
    return parsed;
  }

  async getRulesResult(invoiceId: AleoField): Promise<AleoField | null> {
    const key = `rules-${invoiceId}`;
    const cached = this.rulesCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'invoice_rules_result', invoiceId);
    const val = raw ? (String(raw).replace(/["']/g, '') as AleoField) : null;
    this.rulesCache.set(key, { ts: Date.now(), value: val });
    return val;
  }

  async getAuditAuthorization(invoiceId: AleoField): Promise<{
    audit_key_hash: AleoField;
    scopes_bitmask: bigint;
    expires_at: number;
    issuer: AleoAddress;
  } | null> {
    const key = `auth-${invoiceId}`;
    const cached = this.authCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'audit_authorization', invoiceId);
    if (!raw) {
      this.authCache.set(key, { ts: Date.now(), value: null });
      return null;
    }
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = parseLeoAuditAuthString(raw);
      }
    }
    const value = parsed
      ? {
          audit_key_hash: parsed.audit_key_hash ?? parsed.auditKeyHash,
          scopes_bitmask: BigInt(parsed.scopes_bitmask ?? parsed.scopesBitmask ?? 0),
          expires_at: Number(parsed.expires_at ?? parsed.expiresAt ?? 0),
          issuer: parsed.issuer
        }
      : null;
    this.authCache.set(key, { ts: Date.now(), value });
    return value;
  }

  async getInvoiceCount(seller: AleoAddress): Promise<number> {
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'invoice_count', seller);
    if (!raw) return 0;
    const clean = raw.replace(/u64$/i, '').replace(/["']/g, '');
    const num = Number(clean);
    return Number.isNaN(num) ? 0 : num;
  }

  async getAuditCounter(seller: AleoAddress): Promise<number> {
    const key = `counter-${seller}`;
    const cached = this.counterCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.value !== null) return Number(cached.value);
    const raw = await this.reader.getProgramMappingValue(PROGRAM_ID, 'getter_counter_cache', seller);
    const val = raw ? BigInt(String(raw).replace(/u64$/i, '').replace(/["']/g, '')) : 0n;
    this.counterCache.set(key, { ts: Date.now(), value: val });
    return Number(val);
  }
}
