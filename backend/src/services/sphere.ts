import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
import { verifySignedMessage } from '@unicitylabs/sphere-sdk';
import { config } from '../config.js';

let treasurySphere: Sphere | null = null;

export class SphereService {
  static async initTreasury(): Promise<Sphere | null> {
    if (!config.sphere.treasuryMnemonic) {
      console.warn('[Sphere] Treasury mnemonic not configured — deposits/withdrawals in mock mode');
      return null;
    }

    try {
      const baseProviders = createNodeProviders({
        network: 'testnet',
        dataDir: config.sphere.dataDir,
        tokensDir: `${config.sphere.dataDir}/tokens`,
        oracle: { apiKey: config.sphere.oracleApiKey },
      });

      const providers = createWalletApiProviders(baseProviders, {
        baseUrl: config.sphere.walletApiUrl,
        network: 'testnet2',
        deviceId: config.sphere.deviceId,
      });

      const { sphere } = await Sphere.init({
        ...providers,
        mnemonic: config.sphere.treasuryMnemonic,
        nametag: config.sphere.treasuryNametag,
      });

      treasurySphere = sphere;
      console.log('[Sphere] Treasury wallet initialized:', sphere.identity?.directAddress);
      return sphere;
    } catch (err) {
      console.error('[Sphere] Failed to init treasury:', err);
      return null;
    }
  }

  static verifyAuthSignature(
    message: string,
    signature: string,
    publicKey: string,
  ): boolean {
    try {
      return verifySignedMessage(message, signature, publicKey);
    } catch {
      return false;
    }
  }

  static buildAuthMessage(nonce: string, domain: string): string {
    const issuedAt = new Date().toISOString();
    return [
      'Sign in to Sphere Perps',
      '',
      `Domain: ${domain}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');
  }

  static async processWithdrawal(
    recipient: string,
    amount: string,
  ): Promise<{ transferId: string; status: string }> {
    if (!treasurySphere) {
      return { transferId: `mock-${Date.now()}`, status: 'completed' };
    }

    const result = await treasurySphere.payments.send({
      recipient,
      amount,
      coinId: config.sphere.uctCoinId,
      memo: 'Sphere Perps withdrawal',
    });

    return {
      transferId: result.id,
      status: result.status,
    };
  }

  static async getTreasuryAddress(): Promise<string | null> {
    if (!treasurySphere) return null;
    return treasurySphere.identity?.directAddress ?? null;
  }

  static getTreasuryNametag(): string {
    return config.sphere.treasuryNametag;
  }
}