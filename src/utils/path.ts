import { Asset, Server } from 'stellar-sdk';

export interface HorizonPathAssetRecord {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

export interface HorizonStrictSendPathRecord {
  destination_amount: string;
  path: HorizonPathAssetRecord[];
}

export interface StrictSendPathQuote {
  destAmount: string;
  path: Asset[];
}

/**
 * Query Horizon `strictSendPaths` and return the path that maximizes `destination_amount`.
 */
export async function findBestStrictSendPath(
  server: Server,
  sendAsset: Asset,
  sendAmount: string,
  destAsset: Asset,
): Promise<StrictSendPathQuote> {
  const response = await server
    .strictSendPaths(sendAsset, sendAmount, [destAsset])
    .call();

  const records = (response?.records || []) as unknown as HorizonStrictSendPathRecord[];
  if (records.length === 0) {
    throw new Error(
      `No path found from ${sendAsset.isNative() ? 'XLM' : sendAsset.getCode()} to ${destAsset.isNative() ? 'XLM' : destAsset.getCode()}`,
    );
  }

  const bestRecord = records.reduce((best, current) =>
    Number(current.destination_amount) > Number(best.destination_amount) ? current : best,
  );

  const hopAssets = (bestRecord.path || []).map((hop) => {
    if (hop.asset_type === 'native' || !hop.asset_code || !hop.asset_issuer) {
      return Asset.native();
    }
    return new Asset(hop.asset_code, hop.asset_issuer);
  });

  return {
    destAmount: bestRecord.destination_amount,
    path: hopAssets,
  };
}
