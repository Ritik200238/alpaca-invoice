import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    throw new Error(
      'Upstash Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in .env.local.'
    );
  }

  _redis = new Redis({ url, token });
  return _redis;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const instance = getRedis();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const kvKey = {
  byHash: (hash: string) => `invhash:${hash}`,
  byId:   (id: string)   => `invid:${id}`,
  disputeReason: (invoiceId: string) => `dispute-reason:${invoiceId}`,
};

/** 2-year TTL in seconds */
export const DETAILS_TTL = 60 * 60 * 24 * 365 * 2;
