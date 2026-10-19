import { AleoProtocolService } from '../AleoProtocolServiceImpl';
import { ProtocolError } from '../IAleoProtocolService';
import { PROGRAM_ID } from '@/lib/contract';

// Share the ProgramManager mock instance so assertions can inspect it.
const mockPM = {
  run: vi.fn().mockResolvedValue({ outputs: ['999field'] }),
  buildAuthorization: vi.fn().mockResolvedValue({}),
  setAccount: vi.fn()
};

vi.mock('@provablehq/sdk', () => {
  const mockClient = {
    getProgram: vi.fn().mockResolvedValue('program source'),
    getLatestHeight: vi.fn().mockResolvedValue(10),
    getProgramMappingValue: vi.fn().mockResolvedValue('0u8'),
    submitTransaction: vi.fn().mockResolvedValue('at1tx'),
    getTransaction: vi.fn().mockResolvedValue({
      transitions: [{ program: PROGRAM_ID, function: 'foo', outputs: [1, 2] }]
    })
  };
  class PrivateKey {
    to_string() {
      return 'mock-private-key';
    }
  }
  class Account {
    constructor(_: any) {}
  }
  class Plaintext {
    static fromString(_: string) {
      return new Plaintext();
    }
    toBitsLe() {
      return [true, false, true]; // dummy bits
    }
  }
  class BHP256 {
    hash(_: boolean[]) {
      return { toString: () => '999field' };
    }
  }
  return {
    AleoNetworkClient: vi.fn(() => mockClient),
    ProgramManager: vi.fn(() => mockPM),
    PrivateKey,
    Account,
    Plaintext,
    BHP256
  };
});

describe('AleoProtocolService', () => {
  const svc = new AleoProtocolService();

  test('computeInvoiceIdOffline returns field', async () => {
    const res = await svc.computeInvoiceIdOffline({
      seller: 'aleo1seller',
      buyer: 'aleo1buyer',
      amount: 1n,
      dueDate: 123,
      nonce: '1field'
    });
    expect(res).toBe('999field');
  });

  test('verifyInvoiceOnChain returns exists/hashMatch/status', async () => {
    const res = await svc.verifyInvoiceOnChain('abcfield', '123u8field' as any);
    expect(res.exists).toBe(true);
    expect(res.chainStatus).toBe(0);
  });

  test('assertRules calls run', async () => {
    await svc.assertRules('invfield', 'hashfield');
    expect(mockPM.run).toHaveBeenCalledWith(expect.any(String), 'assert_rules_anchor', ['invfield', 'hashfield'], false);
  });

  test('getLatestBlockHeight throws on invalid', async () => {
    const sdk = await import('@provablehq/sdk');
    (sdk.AleoNetworkClient as any).mock.results[0].value.getLatestHeight.mockResolvedValueOnce(-1);
    await expect(svc.getLatestBlockHeight()).rejects.toHaveProperty('code', ProtocolError.NODE_CONNECTION_FAILED);
  });
});
