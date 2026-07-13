import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { Trophy, Users, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LeaderboardPage() {
  const [period, setPeriod] = useState('daily');
  const [sortBy, setSortBy] = useState('pnl');
  const { user } = useAuthStore();

  const { data: entries = [] } = useQuery({
    queryKey: ['leaderboard', period, sortBy],
    queryFn: () => api.getLeaderboard(period, sortBy),
  });

  const { data: referrals } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => api.getReferrals(),
    enabled: !!user,
  });

  const copyReferral = () => {
    if (referrals?.referralCode) {
      navigator.clipboard.writeText(`${window.location.origin}?ref=${referrals.referralCode}`);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="w-6 h-6 text-warning" /> Leaderboard
        </h1>
        {user && referrals ? (
          <Button variant="outline" size="sm" onClick={copyReferral}>
            <Copy className="w-4 h-4" />
            Invite: {referrals.referralCode}
          </Button>
        ) : null}
      </div>

      <div className="flex gap-2">
        {['daily', 'weekly', 'monthly'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-4 py-2 text-sm rounded-lg capitalize transition-colors',
              period === p ? 'bg-accent text-white' : 'bg-card text-muted hover:text-foreground',
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {['pnl', 'roi', 'winRate', 'volume', 'consistency'].map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={cn(
              'px-3 py-1 text-xs rounded-md border transition-colors',
              sortBy === s ? 'border-accent text-accent' : 'border-border text-muted',
            )}
          >
            {s === 'winRate' ? 'Win Rate' : s === 'roi' ? 'ROI' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="rounded-xl glass overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="text-left p-4">Rank</th>
              <th className="text-left">Trader</th>
              <th className="text-right">PnL</th>
              <th className="text-right">ROI</th>
              <th className="text-right">Win Rate</th>
              <th className="text-right">Volume</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.rank} className="border-b border-border/50 hover:bg-card-hover">
                <td className="p-4 font-bold">
                  {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}
                </td>
                <td>{e.user.nametag ? `@${e.user.nametag}` : e.user.chainPubkey.slice(0, 12) + '...'}</td>
                <td className={cn('text-right font-mono', Number(e.pnl) >= 0 ? 'text-long' : 'text-short')}>
                  ${Number(e.pnl).toFixed(2)}
                </td>
                <td className="text-right font-mono">{Number(e.roi).toFixed(2)}%</td>
                <td className="text-right font-mono">{Number(e.winRate).toFixed(1)}%</td>
                <td className="text-right font-mono">${Number(e.volume).toLocaleString()}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted">No leaderboard data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {referrals ? (
        <div className="p-4 rounded-xl glass">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Users className="w-4 h-4" /> Your Referrals
          </h2>
          <p className="text-sm text-muted">
            {referrals.referrals.length} friends referred
          </p>
        </div>
      ) : null}
    </div>
  );
}