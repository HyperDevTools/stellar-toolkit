import { Horizon, Networks } from 'stellar-sdk';
import { NetworkType } from '../types';

export type Server = Horizon.Server;
const { Server: HorizonServer } = Horizon;

export const DEFAULT_HORIZON_URLS = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

export function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

export function getHorizonUrl(network: NetworkType, customUrl?: string): string {
  return customUrl || DEFAULT_HORIZON_URLS[network];
}

export function createServer(network: NetworkType, customUrl?: string): Server {
  const horizonUrl = getHorizonUrl(network, customUrl);
  return new HorizonServer(horizonUrl);
}
