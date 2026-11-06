import { createAsset, isNativeAsset, formatAssetString } from '../utils/asset';

describe('Asset Utilities', () => {
  describe('createAsset', () => {
    it('should create native asset', () => {
      const asset = createAsset('native');
      expect(asset.isNative()).toBe(true);
    });

    it('should create custom asset', () => {
      const asset = createAsset({
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      });

      expect(asset.getCode()).toBe('USDC');
      expect(asset.getIssuer()).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    });
  });

  describe('isNativeAsset', () => {
    it('should return true for native asset', () => {
      expect(isNativeAsset('native')).toBe(true);
    });

    it('should return false for custom asset', () => {
      expect(
        isNativeAsset({
          code: 'USDC',
          issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        }),
      ).toBe(false);
    });
  });

  describe('formatAssetString', () => {
    it('should format native asset as XLM', () => {
      expect(formatAssetString('native')).toBe('XLM');
    });

    it('should format custom asset with code and truncated issuer', () => {
      const formatted = formatAssetString({
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      });

      expect(formatted).toContain('USDC');
      expect(formatted).toContain('GBBD');
      expect(formatted).toContain('...');
    });
  });
});
