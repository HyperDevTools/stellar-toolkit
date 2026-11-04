import { Account, Keypair, SorobanRpc, nativeToScVal } from 'stellar-sdk';
import { ContractManager } from '../core/contract';
import { getNetworkPassphrase } from '../utils/network';

describe('ContractManager - Soroban Smart Contract Operations', () => {
  const passphrase = getNetworkPassphrase('testnet');
  const signer = Keypair.random();
  const contractId = 'CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

  const createMockRpcServer = (overrides: Record<string, unknown> = {}): SorobanRpc.Server => {
    const account = new Account(signer.publicKey(), '100');
    return {
      getAccount: jest.fn().mockResolvedValue(account),
      simulateTransaction: jest.fn().mockResolvedValue({
        id: 'sim-1',
        latestLedger: 12345,
        cost: { cpuInsns: '42000', memBytes: '8192' },
        result: {
          auth: [],
          retval: nativeToScVal(42),
        },
      }),
      sendTransaction: jest.fn().mockResolvedValue({
        status: 'PENDING',
        hash: 'soroban_tx_hash_001',
      }),
      getTransaction: jest.fn().mockResolvedValue({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: nativeToScVal(42),
      }),
      ...overrides,
    } as unknown as SorobanRpc.Server;
  };

  it('simulates a read-only contract method and decodes the ScVal return value', async () => {
    const rpc = createMockRpcServer();
    const manager = new ContractManager(passphrase, 'testnet', undefined, rpc);

    const sim = await manager.simulateContract<number>({
      contractId,
      method: 'get_count',
      args: [],
    });

    expect(sim.result).toBe(42);
    expect(sim.cost.cpuInsns).toBe('42000');
    expect(sim.latestLedger).toBe(12345);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when simulation returns a Soroban error', async () => {
    const rpc = createMockRpcServer({
      simulateTransaction: jest.fn().mockResolvedValue({
        id: 'sim-err',
        latestLedger: 12345,
        error: 'HostError: Error(Contract, #1)',
      }),
    });
    const manager = new ContractManager(passphrase, 'testnet', undefined, rpc);

    await expect(
      manager.simulateContract({
        contractId,
        method: 'failing_method',
      }),
    ).rejects.toThrow(/Contract simulation error/i);
  });

  it('requires a signer secret key for state-changing invokeContract calls', async () => {
    const rpc = createMockRpcServer();
    const manager = new ContractManager(passphrase, 'testnet', undefined, rpc);

    await expect(
      manager.invokeContract({
        contractId,
        method: 'increment',
        args: [5],
      }),
    ).rejects.toThrow(/requires a signer/i);
  });
});
