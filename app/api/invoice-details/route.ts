import { NextRequest, NextResponse } from 'next/server';
import { redis, kvKey, DETAILS_TTL } from '@/lib/redis';

/**
 * POST /api/invoice-details
 * Body: { invoiceHash, invoiceId?, details: EncryptedPayload }
 * Saves encrypted invoice details (EncryptedPayload = { iv, ciphertext, authTag? }) to Upstash Redis
 * so the buyer can retrieve and decrypt them by invoiceHash or invoiceId.
 * API does not interpret plain vs encrypted; it stores the payload as-is.
 */
export async function POST(req: NextRequest) {
  try {
    const { invoiceHash, invoiceId, details } = await req.json();

    console.log('[DEBUG-ARBITER] POST /api/invoice-details received:', {
      invoiceHash: invoiceHash?.slice(0, 30),
      invoiceId: invoiceId?.slice(0, 30),
      hasDetails: !!details,
      detailsType: typeof details,
      hasIv: !!(details as any)?.iv,
      hasCiphertext: !!(details as any)?.ciphertext,
    });

    if (!invoiceHash || !details) {
      console.warn('[DEBUG-ARBITER] POST rejected: missing invoiceHash or details');
      return NextResponse.json({ error: 'Missing invoiceHash or details' }, { status: 400 });
    }

    const hashKey = kvKey.byHash(invoiceHash);
    const ops: Promise<unknown>[] = [
      redis.set(hashKey, details, { ex: DETAILS_TTL }),
    ];

    let idKey: string | null = null;
    if (invoiceId && invoiceId !== invoiceHash) {
      idKey = kvKey.byId(invoiceId);
      ops.push(redis.set(idKey, details, { ex: DETAILS_TTL }));
    }

    await Promise.all(ops);
    console.log('[DEBUG-ARBITER] POST success. Keys written:', { hashKey, idKey });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const isConfigError = err?.message?.includes('not configured');
    if (isConfigError) {
      console.warn('[DEBUG-ARBITER] ❌ POST failed: Redis not configured');
      return NextResponse.json({ error: 'Redis not configured', details: null }, { status: 503 });
    }
    console.error('[DEBUG-ARBITER] ❌ POST error:', err);
    return NextResponse.json({ error: 'Failed to save details' }, { status: 500 });
  }
}

/**
 * GET /api/invoice-details?invoiceHash=xxx
 * GET /api/invoice-details?invoiceId=xxx
 * Returns the stored payload (EncryptedPayload), or { details: null } if not found.
 * Client must decrypt with CryptoService.decryptPayloadWithInvoiceId(payload, invoiceId).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const invoiceHash = searchParams.get('invoiceHash');
    const invoiceId   = searchParams.get('invoiceId');

    console.log('[DEBUG-ARBITER] GET /api/invoice-details:', { invoiceHash: invoiceHash?.slice(0, 30), invoiceId: invoiceId?.slice(0, 30) });

    if (!invoiceHash && !invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceHash or invoiceId' }, { status: 400 });
    }

    let details: unknown = null;
    let foundVia: string = 'none';

    if (invoiceHash) {
      const key = kvKey.byHash(invoiceHash);
      details = await redis.get(key);
      if (details) foundVia = `byHash(${key})`;
    }
    if (!details && invoiceId) {
      const key = kvKey.byId(invoiceId);
      details = await redis.get(key);
      if (details) foundVia = `byId(${key})`;
    }

    console.log('[DEBUG-ARBITER] GET result:', {
      found: !!details,
      foundVia,
      detailsType: typeof details,
      hasIv: !!(details as any)?.iv,
    });

    return NextResponse.json({ details: details ?? null });
  } catch (err: any) {
    const isConfigError = err?.message?.includes('not configured');
    if (isConfigError) {
      console.warn('[DEBUG-ARBITER] ❌ GET failed: Redis not configured');
      return NextResponse.json({ details: null });
    }
    console.error('[DEBUG-ARBITER] ❌ GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch details' }, { status: 500 });
  }
}
