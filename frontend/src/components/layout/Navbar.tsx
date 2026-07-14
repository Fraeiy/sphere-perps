import { Link, useLocation } from 'react-router-dom';
import { Wallet, Bell, LayoutDashboard, Trophy, Settings, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { shortenAddress } from '@/lib/utils';
import { cn } from '@/lib/utils';

const NAV_LINKS: Array<{
  to: string;
  label: string;
  icon?: typeof LayoutDashboard;
}> = [
  { to: '/', label: 'Trade' },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];

export function Navbar() {
  const { user, connect, disconnect, isConnecting, connectError, clearError } = useAuthStore();
  const location = useLocation();

  return (
    <>
      <header className="h-14 border-b border-border glass flex items-center justify-between px-4 shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-deep flex items-center justify-center shadow-lg shadow-accent/20 group-hover:shadow-accent/35 transition-shadow">
              <img src="/sphere.svg" alt="" className="w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-bold text-base leading-tight">Sphere Perps</div>
              <div className="text-[10px] text-muted uppercase tracking-widest">Unicity Network</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'text-muted hover:text-foreground',
                    location.pathname === to && 'text-accent bg-accent/10',
                  )}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {label}
                </Button>
              </Link>
            ))}
            {user?.isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="sm" className="text-muted">
                  <Settings className="w-4 h-4" /> Admin
                </Button>
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <Button variant="ghost" size="icon" className="text-muted hover:text-accent">
              <Bell className="w-4 h-4" />
            </Button>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/80">
                <div className="w-2 h-2 rounded-full bg-long animate-pulse" />
                <span className="text-sm font-medium">
                  {user.nametag ? `@${user.nametag}` : shortenAddress(user.chainPubkey)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={() => connect()} disabled={isConnecting} className="shadow-lg shadow-accent/20">
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
          <button type="button" onClick={clearError} className="text-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}