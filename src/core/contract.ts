import {
  Contract,
  Keypair,
  Memo,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  BASE_FEE,
} from 'stellar-sdk';
import { ContractCallOptions, ContractSimulationResult } from '../types';

const DEFAULT_SOROBAN_RPC_URLS: Record<string, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  futurenet: 'https://rpc-futurenet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
};

export class ContractManager {
  private rpcServer: SorobanRpc.Server;

  constructor(
    private networkPassphrase: string,
    network: 'testnet' | 'mainnet' | 'futurenet' = 'testnet',
    rpcUrl?: string,
    rpcServerOverride?: SorobanRpc.Server,
  ) {
    const resolvedUrl =
      rpcUrl || DEFAULT_SOROBAN_RPC_URLS[network] || DEFAULT_SOROBAN_RPC_URLS.testnet;
    this.rpcServer = rpcServerOverride || new SorobanRpc.Server(resolvedUrl);
  }

  private toScValArgs(args: unknown[] = []): xdr.ScVal[] {
    return args.map((arg) => {
      if (arg instanceof xdr.ScVal) {
        return arg;
      }
      return nativeToScVal(arg);
    });
  }

  /**
   * Simulate a read-only Soroban smart contract call without submitting a transaction.
   */
  async simulateContract<T = unknown>(
    options: ContractCallOptions,
  ): Promise<ContractSimulationResult<T>> {
    const { contractId, method, args = [], signer, fee = BASE_FEE } = options;

    try {
      const callerKeypair = signer ? Keypair.fromSecret(signer) : Keypair.random();
      const sourceAccount = await this.rpcServer.getAccount(callerKeypair.publicKey());

      const contract = new Contract(contractId);
      const scArgs = this.toScValArgs(args);

      const tx = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call(method, ...scArgs))
        .setTimeout(30)
        .build();

      const simResponse = await this.rpcServer.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(simResponse)) {
        throw new Error(`Contract simulation error: ${simResponse.error}`);
      }

      const retval = simResponse.result?.retval;
      const decoded = retval ? (scValToNative(retval) as T) : (undefined as unknown as T);

      return {
        result: decoded,
        cost: {
          cpuInsns: simResponse.cost?.cpuInsns ?? '0',
          memBytes: simResponse.cost?.memBytes ?? '0',
        },
        latestLedger: simResponse.latestLedger,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Contract simulation error')) {
        throw error;
      }
      throw new Error(`Contract simulation failed: ${error}`);
    }
  }

  /**
   * Invoke a state-changing Soroban smart contract method (simulate, assemble, sign, submit, and poll).
   */
  async invokeContract<T = unknown>(
    options: ContractCallOptions & { memo?: string },
  ): Promise<{ hash: string; returnValue?: T }> {
    const { contractId, method, args = [], signer, fee = BASE_FEE, memo } = options;

    if (!signer) {
      throw new Error('Contract invocation requires a signer secret key');
    }

    try {
      const sourceKeypair = Keypair.fromSecret(signer);
      const sourceAccount = await this.rpcServer.getAccount(sourceKeypair.publicKey());

      const contract = new Contract(contractId);
      const scArgs = this.toScValArgs(args);

      const builder = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call(method, ...scArgs))
        .setTimeout(30);

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const tx = builder.build();
      const simResponse = await this.rpcServer.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(simResponse)) {
        throw new Error(`Contract simulation error: ${simResponse.error}`);
      }

      const preparedTx = SorobanRpc.assembleTransaction(tx, simResponse).build();
      preparedTx.sign(sourceKeypair);

      const sendResponse = await this.rpcServer.sendTransaction(preparedTx);
      if (sendResponse.status === 'ERROR') {
        throw new Error(`Transaction submission rejected: ${sendResponse.hash}`);
      }

      const txResponse = await this.rpcServer.getTransaction(sendResponse.hash);
      if (txResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Contract transaction failed on ledger: ${sendResponse.hash}`);
      }

      let returnValue: T | undefined;
      if (
        txResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS &&
        txResponse.returnValue
      ) {
        returnValue = scValToNative(txResponse.returnValue) as T;
      }

      return {
        hash: sendResponse.hash,
        returnValue,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Contract simulation error') ||
          error.message.includes('requires a signer') ||
          error.message.includes('rejected') ||
          error.message.includes('failed on ledger'))
      ) {
        throw error;
      }
      throw new Error(`Contract invocation failed: ${error}`);
    }
  }
}
