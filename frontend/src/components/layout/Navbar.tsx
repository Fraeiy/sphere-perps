import { Link } from 'react-router-dom';
import { Wallet, Bell, LayoutDashboard, Trophy, Settings, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { shortenAddress } from '@/lib/utils';

export function Navbar() {
  const { user, connect, disconnect, isConnecting, connectError, clearError } = useAuthStore();

  return (
    <>
      <header className="h-14 border-b border-border glass flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-sm">
              S
            </div>
            <span>Sphere Perps</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/">
              <Button variant="ghost" size="sm">Trade</Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </Button>
            </Link>
            <Link to="/leaderboard">
              <Button variant="ghost" size="sm">
                <Trophy className="w-4 h-4" /> Leaderboard
              </Button>
            </Link>
            {user?.isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="sm">
                  <Settings className="w-4 h-4" /> Admin
                </Button>
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <Button variant="ghost" size="icon">
              <Bell className="w-4 h-4" />
            </Button>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-right">
                <div className="text-sm font-medium">
                  {user.nametag ? `@${user.nametag}` : shortenAddress(user.chainPubkey)}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={() => connect()} disabled={isConnecting}>
              <Wallet className="w-4 h-4" />
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
        </div>
      </header>

      {connectError && (
        <div className="bg-short/10 border-b border-short/30 px-4 py-3 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-short shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-short">Wallet connection failed</p>
            <p className="text-muted mt-0.5">{connectError}</p>
            <p className="text-xs text-muted mt-2">
              Need a wallet? Open{' '}
              <a
                href="https://sphere.unicity.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                sphere.unicity.network
              </a>{' '}
              or install the Sphere browser extension.
            </p>
          </div>
          <button onClick={clearError} className="text-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}