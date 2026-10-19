import { NextRequest, NextResponse } from 'next/server';
import { redis, kvKey, DETAILS_TTL } from '@/lib/redis';

/**
 * POST /api/dispute-reason
 * Body: { invoiceId, reasonText }
 * Stores plain-text dispute reason so all parties (buyer, seller, arbiter) can read it.
 */
export async function POST(req: NextRequest) {
  try {
    const { invoiceId, reasonText } = await req.json();
    if (!invoiceId || !reasonText) {
      return NextResponse.json({ error: 'Missing invoiceId or reasonText' }, { status: 400 });
    }
    await redis.set(kvKey.disputeReason(invoiceId), reasonText, { ex: DETAILS_TTL });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes('not configured')) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }
    console.error('[dispute-reason] POST error:', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

/**
 * GET /api/dispute-reason?invoiceId=xxx
 * Returns { reasonText: string | null }
 */
export async function GET(req: NextRequest) {
  try {
    const invoiceId = req.nextUrl.searchParams.get('invoiceId');
    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }
    const reasonText = await redis.get<string>(kvKey.disputeReason(invoiceId));
    return NextResponse.json({ reasonText: reasonText ?? null });
  } catch (err: any) {
    if (err?.message?.includes('not configured')) {
      return NextResponse.json({ reasonText: null });
    }
    console.error('[dispute-reason] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
