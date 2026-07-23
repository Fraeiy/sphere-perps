import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import { SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';
import { parseTokenAmount } from '@unicitylabs/sphere-sdk';

const WALLET_URL = import.meta.env.VITE_SPHERE_WALLET_URL ?? 'https://sphere.unicity.network';
const SESSION_KEY = 'sphere-perps-session';

/** Unicity testnet2 UCT native coin (64-hex id, 18 decimals). */
export const UCT_COIN_ID = 'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0';
export const UCT_DECIMALS = 18;

export interface SphereIdentity {
  chainPubkey: string;
  directAddress?: string;
  nametag?: string;
}

interface SignMessageResult {
  signature: string;
  publicKey: string;
}

interface SendResult {
  id?: string;
  transferId?: string;
  status?: string;
  deliveryPending?: boolean;
  success?: boolean;
}

export class SphereWalletService {
  private client: Awaited<ReturnType<typeof autoConnect>>['client'] | null = null;
  private disconnectFn: (() => Promise<void>) | null = null;

  async connect(silent = false): Promise<SphereIdentity> {
    const result = await autoConnect({
      dapp: {
        name: 'Sphere Perps',
        description: 'Perpetual futures trading on Unicity Sphere',
        url: window.location.origin,
      },
      walletUrl: WALLET_URL,
      network: SPHERE_NETWORKS.testnet2,
      silent,
      resumeSessionId: sessionStorage.getItem(SESSION_KEY) ?? undefined,
      permissions: [
        'identity:read',
        'balance:read',
        'tokens:read',
        'history:read',
        'events:subscribe',
        'sign:request',
        'transfer:request',
      ],
      intentTimeout: 120000,
    });

    this.client = result.client;
    this.disconnectFn = result.disconnect;
    sessionStorage.setItem(SESSION_KEY, result.connection.sessionId);

    result.client.on('wallet:locked', async () => {
      sessionStorage.removeItem(SESSION_KEY);
      this.client = null;
    });

    return {
      chainPubkey: result.connection.identity.chainPubkey,
      directAddress: result.connection.identity.directAddress,
      nametag: result.connection.identity.nametag,
    };
  }

  async trySilentConnect(): Promise<SphereIdentity | null> {
    try {
      return await this.connect(true);
    } catch {
      return null;
    }
  }

  async signAuthMessage(message: string): Promise<{ signature: string; publicKey: string }> {
    if (!this.client) throw new Error('Wallet not connected');
    const result = (await this.client.intent('sign_message', { message })) as SignMessageResult;
    return { signature: result.signature, publicKey: result.publicKey };
  }

  async getBalance() {
    if (!this.client) throw new Error('Wallet not connected');
    return this.client.query('sphere_getBalance');
  }

  /**
   * Send fungible tokens via Sphere Connect.
   * amount is human-readable UCT (e.g. "10.5"); converted to base units (18 decimals).
   * coinId must be lowercase 64-hex for Connect v2 (symbols are rejected).
   */
  async sendTokens(to: string, humanAmount: string | number, coinId = UCT_COIN_ID) {
    if (!this.client) throw new Error('Wallet not connected');

    const amount = parseTokenAmount(String(humanAmount), UCT_DECIMALS).toString();
    const result = (await this.client.intent('send', {
      to,
      amount,
      coinId,
    })) as SendResult;

    return {
      id: result.transferId ?? result.id,
      transferId: result.transferId ?? result.id,
      status: result.status,
      deliveryPending: result.deliveryPending,
    };
  }

  async disconnect() {
    if (this.disconnectFn) await this.disconnectFn();
    sessionStorage.removeItem(SESSION_KEY);
    this.client = null;
    this.disconnectFn = null;
  }

  isConnected() {
    return !!this.client;
  }
}

export const sphereWallet = new SphereWalletService();
