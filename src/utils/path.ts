import { Asset } from 'stellar-sdk';
import { CustomAsset } from '../types';
import { createAsset } from './asset';
import { Server } from './network';

export interface StrictSendPathQuote {
  path: ('native' | CustomAsset)[];
  destAmount: string;
}

/**
 * Find the best strict-send payment path via Horizon
 */
export async function findStrictSendPaths(
  server: Server,
  sendAsset: 'native' | CustomAsset,
  sendAmount: string,
  destAsset: 'native' | CustomAsset,
): Promise<StrictSendPathQuote> {
  const sourceAssetObj: Asset = createAsset(sendAsset);
  const destAssetObj: Asset = createAsset(destAsset);

  const response = await server.strictSendPaths(sourceAssetObj, sendAmount, [destAssetObj]).call();

  const records = response?.records || [];
  if (records.length === 0) {
    throw new Error('No path found for strict send payment');
  }

  // Pick the path yielding the highest destination amount
  const best = records.reduce((prev, curr) =>
    parseFloat(curr.destination_amount) > parseFloat(prev.destination_amount) ? curr : prev,
  );

  const hops: ('native' | CustomAsset)[] = (best.path || []).map(
    (hop: { asset_type: string; asset_code?: string; asset_issuer?: string }) => {
      if (hop.asset_type === 'native' || !hop.asset_code || !hop.asset_issuer) {
        return 'native';
      }
      return {
        code: hop.asset_code,
        issuer: hop.asset_issuer,
      };
    },
  );

  return {
    path: hops,
    destAmount: best.destination_amount,
  };
}
