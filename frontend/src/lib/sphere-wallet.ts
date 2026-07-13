import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import { SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';

const WALLET_URL = import.meta.env.VITE_SPHERE_WALLET_URL ?? 'https://sphere.unicity.network';
const SESSION_KEY = 'sphere-perps-session';

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

  async sendTokens(to: string, amount: string, coinId: string) {
    if (!this.client) throw new Error('Wallet not connected');
    return this.client.intent('send', { to, amount, coinId }) as Promise<SendResult>;
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