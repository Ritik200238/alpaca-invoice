import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AleoProtocolService } from '../AleoProtocolServiceImpl';

vi.mock('@provablehq/sdk', () => {
  const run = vi.fn(async (_program: string, fn: string, inputs: string[]) => {
    return { outputs: ['mockfield'] };
  });
  const getProgram = vi.fn(async () => 'program text');
  class Plaintext {
    static fromString(_: string) {
      return new Plaintext();
    }
    toBitsLe() {
      return [true, false];
    }
  }
  class BHP256 {
    hash(_: boolean[]) {
      return { toString: () => 'mockfield' };
    }
  }
  return {
    AleoNetworkClient: vi.fn().mockImplementation(() => ({
      getProgram,
      getProgramMappingValue: vi.fn(async () => null)
    })),
    ProgramManager: vi.fn().mockImplementation(() => ({
      run,
      setAccount: vi.fn()
    })),
    PrivateKey: vi.fn().mockImplementation(() => ({
      to_string: () => 'mock-private-key'
    })),
    Account: vi.fn().mockImplementation(() => ({})),
    Plaintext,
    BHP256
  };
});

describe('AleoProtocolService (mocked)', () => {
  let svc: AleoProtocolService;

  beforeEach(() => {
    svc = new AleoProtocolService();
  });

  it('computeInvoiceIdOffline returns id', async () => {
    const id = await svc.computeInvoiceIdOffline({
      seller: 'aleo1seller' as any,
      buyer: 'aleo1buyer' as any,
      amount: 1n,
      dueDate: 1,
      nonce: '0field'
    });
    expect(id).toBe('mockfield');
  });

  it('computeInvoiceHashOffline returns hash', async () => {
    const hash = await svc.computeInvoiceHashOffline({
      seller: 'aleo1seller' as any,
      buyer: 'aleo1buyer' as any,
      amount: 1n,
      taxAmount: 1n,
      dueDate: 1,
      nonce: '0field',
      orderId: '0field',
      currency: '0field',
      itemsHash: '0field',
      memoHash: '0field'
    });
    expect(hash).toBe('mockfield');
  });
});
