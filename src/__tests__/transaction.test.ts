import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from 'stellar-sdk';
import { StellarToolkit } from '../index';

describe('StellarToolkit - Fee Bump Transactions', () => {
  let toolkit: StellarToolkit;

  beforeEach(() => {
    toolkit = new StellarToolkit({ network: 'testnet' });
  });

  const buildSampleInnerTx = (fee = BASE_FEE): Transaction => {
    const source = Keypair.random();
    const dest = Keypair.random();
    const account = new Account(source.publicKey(), '500');
    const tx = new TransactionBuilder(account, {
      fee,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: dest.publicKey(),
          asset: Asset.native(),
          amount: '25',
        }),
      )
      .setTimeout(180)
      .build();
    tx.sign(source);
    return tx;
  };

  it('test_fee_bump_valid', () => {
    const feeSponsor = Keypair.random();
    const innerTx = buildSampleInnerTx('100');

    const feeBump = toolkit.createFeeBumpTransaction({
      feeSourceSecret: feeSponsor.secret(),
      innerTransaction: innerTx,
      maxFeePerOp: 300,
    });

    expect(feeBump.innerTransaction.hash().toString('hex')).toBe(innerTx.hash().toString('hex'));
    expect(feeBump.signatures.length).toBeGreaterThanOrEqual(1);
  });

  it('test_fee_bump_higher_fee', async () => {
    const feeSponsor = Keypair.random();
    const innerTx = buildSampleInnerTx('100');
    const server = (toolkit as unknown as { server: { submitTransaction: jest.Mock } }).server;
    jest
      .spyOn(server, 'submitTransaction')
      .mockResolvedValue({ hash: 'feebump_tx_hash_999' } as unknown as never);

    const hash = await toolkit.submitFeeBumpTransaction({
      feeSourceSecret: feeSponsor.secret(),
      innerTransaction: innerTx.toXDR(),
      maxFeePerOp: 500,
    });

    expect(hash).toBe('feebump_tx_hash_999');
  });

  it('test_fee_bump_lower_fee', () => {
    const feeSponsor = Keypair.random();
    const innerTx = buildSampleInnerTx('500');

    expect(() =>
      toolkit.createFeeBumpTransaction({
        feeSourceSecret: feeSponsor.secret(),
        innerTransaction: innerTx,
        maxFeePerOp: 100,
      }),
    ).toThrow(/Fee too low/i);
  });

  it('test_fee_bump_invalid_tx', () => {
    const feeSponsor = Keypair.random();

    expect(() =>
      toolkit.createFeeBumpTransaction({
        feeSourceSecret: feeSponsor.secret(),
        innerTransaction: 'not-valid-xdr-string',
        maxFeePerOp: 500,
      }),
    ).toThrow(/Invalid transaction/i);
  });

  it('test_fee_bump_v0', () => {
    const feeSponsor = Keypair.random();
    const innerTx = buildSampleInnerTx('100');
    (innerTx as unknown as { toEnvelope: () => { switch: () => { name: string } } }).toEnvelope =
      () => ({
        switch: () => ({ name: 'envelopeTypeTxV0' }),
      });

    expect(() =>
      toolkit.createFeeBumpTransaction({
        feeSourceSecret: feeSponsor.secret(),
        innerTransaction: innerTx,
        maxFeePerOp: 500,
      }),
    ).toThrow(/Only v1 transactions are supported/i);
  });

  it('test_calculate_fee', () => {
    const innerTx = buildSampleInnerTx('200');
    const suggested = toolkit.calculateSuggestedFee(innerTx, 3);
    expect(parseInt(suggested, 10)).toBe(600);
  });
});
