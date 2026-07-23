import { create } from 'zustand';
import { api, type User } from '@/lib/api';
import { sphereWallet } from '@/lib/sphere-wallet';
import { wsClient } from '@/lib/websocket';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isConnecting: boolean;
  connectError: string | null;
  connect: (referralCode?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  tryAutoConnect: () => Promise<void>;
  clearError: () => void;
}

function buildAuthMessage(nonce: string): string {
  return [
    'Sign in to Sphere Perps',
    '',
    `Domain: ${window.location.origin}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
}

function formatConnectError(err: unknown): string {
  const code = (err as { code?: number })?.code;
  // Sphere Connect v2 error codes (SDK ≥ 0.9 / protocol 2.0)
  if (code === 4007) {
    return 'Wallet protocol mismatch. Update Sphere Wallet and refresh this app (SDK 0.12).';
  }
  if (code === 4008) {
    return 'Wallet network mismatch. Switch your Sphere Wallet to testnet2.';
  }
  if (code === 4003 || code === 4200) {
    return 'Connection rejected. Approve the connection in your Sphere Wallet.';
  }
  if (code === 4100) {
    return 'Insufficient UCT balance in your Sphere Wallet.';
  }

  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('popup') || msg.includes('Popup')) {
      return 'Popup blocked. Allow popups for this site, or install the Sphere browser extension.';
    }
    if (msg.includes('USER_REJECTED') || msg.includes('rejected')) {
      return 'Connection rejected. Approve the connection in your Sphere Wallet.';
    }
    if (msg.includes('INCOMPATIBLE_NETWORK') || msg.includes('network')) {
      return 'Wallet network mismatch. Switch your Sphere Wallet to testnet2.';
    }
    if (msg.includes('Invalid signature')) {
      return 'Signature verification failed. Please try connecting again.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return 'Cannot reach the trading API. The backend may be offline — try again in a moment.';
    }
    return msg;
  }
  return 'Failed to connect wallet. Please try again.';
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isConnecting: false,
  connectError: null,

  clearError: () => set({ connectError: null }),

  tryAutoConnect: async () => {
    const token = api.getToken();
    if (token) {
      try {
        const user = await api.getMe();
        set({ user, isLoading: false });
        wsClient.connect(token);
        sphereWallet.trySilentConnect().catch(() => undefined);
        return;
      } catch {
        api.setToken(null);
      }
    }
    set({ isLoading: false });
  },

  connect: async (referralCode) => {
    set({ isConnecting: true, connectError: null });
    try {
      const ref = referralCode ?? localStorage.getItem('referral-code') ?? undefined;

      // 1. Connect to Sphere Wallet (opens popup / extension)
      const identity = await sphereWallet.connect();

      // 2. Get auth nonce from backend
      const { nonce } = await api.getNonce();

      // 3. Sign the exact message (backend verifies this verbatim)
      const message = buildAuthMessage(nonce);
      const { signature, publicKey } = await sphereWallet.signAuthMessage(message);

      // 4. Verify signature and get JWT
      const { token, user } = await api.verifyAuth({
        nonce,
        message,
        signature,
        publicKey,
        directAddress: identity.directAddress,
        nametag: identity.nametag,
        referralCode: ref,
      });

      api.setToken(token);
      wsClient.connect(token);
      set({ user, isConnecting: false, connectError: null });
    } catch (err) {
      const connectError = formatConnectError(err);
      set({ isConnecting: false, connectError });
      try {
        await sphereWallet.disconnect();
      } catch {
        /* ignore cleanup errors */
      }
    }
  },

  disconnect: async () => {
    await sphereWallet.disconnect();
    api.setToken(null);
    wsClient.disconnect();
    set({ user: null, connectError: null });
  },
}));