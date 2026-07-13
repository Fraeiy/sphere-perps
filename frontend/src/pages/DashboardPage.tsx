import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn, formatPercent } from '@/lib/utils';
import { Target, BarChart3 } from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    enabled: !!user,
  });

  const { data: journal = [] } = useQuery({
    queryKey: ['journal'],
    queryFn: () => api.getJournal(),
    enabled: !!user,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ['achievements'],
    queryFn: () => api.getAchievements(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted">
        Connect your wallet to view dashboard
      </div>
    );
  }

  const cards = [
    { label: 'Portfolio Value', value: `$${stats?.portfolioValue?.toFixed(2) ?? '0'}`, icon: BarChart3 },
    { label: 'Daily PnL', value: `$${stats?.dailyPnl?.toFixed(2) ?? '0'}`, positive: (stats?.dailyPnl ?? 0) >= 0 },
    { label: 'Weekly PnL', value: `$${stats?.weeklyPnl?.toFixed(2) ?? '0'}`, positive: (stats?.weeklyPnl ?? 0) >= 0 },
    { label: 'Monthly PnL', value: `$${stats?.monthlyPnl?.toFixed(2) ?? '0'}`, positive: (stats?.monthlyPnl ?? 0) >= 0 },
    { label: 'Win Rate', value: `${stats?.winRate?.toFixed(1) ?? '0'}%`, icon: Target },
    { label: 'Avg R:R', value: stats?.averageRR?.toFixed(2) ?? '0' },
    { label: 'Largest Win', value: `$${stats?.largestWin?.toFixed(2) ?? '0'}`, positive: true },
    { label: 'Largest Loss', value: `$${stats?.largestLoss?.toFixed(2) ?? '0'}`, positive: false },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Portfolio Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="p-4 rounded-xl glass">
            <div className="text-xs text-muted mb-1">{card.label}</div>
            <div className={cn(
              'text-xl font-mono font-bold',
              card.positive === true && 'text-long',
              card.positive === false && 'text-short',
            )}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-4 rounded-xl glass">
          <h2 className="font-semibold mb-3">Profit Chart</h2>
          <div className="h-48 flex items-center justify-center text-muted text-sm border border-dashed border-border rounded-lg">
            PnL chart — integrate with trade history time series
          </div>
        </div>

        <div className="p-4 rounded-xl glass">
          <h2 className="font-semibold mb-3">Calendar Heatmap</h2>
          <div className="h-48 flex items-center justify-center text-muted text-sm border border-dashed border-border rounded-lg">
            Trading activity heatmap — future release
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-4 rounded-xl glass">
          <h2 className="font-semibold mb-3">AI Trade Journal</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
            {journal.map((j) => (
              <div key={j.id} className="p-3 rounded-lg bg-card text-sm">
                <div className="font-medium mb-1">{j.summary}</div>
                <div className="text-muted text-xs">{j.analysis}</div>
              </div>
            ))}
            {journal.length === 0 && <p className="text-muted text-sm">No closed trades yet</p>}
          </div>
        </div>

        <div className="p-4 rounded-xl glass">
          <h2 className="font-semibold mb-3">Achievements</h2>
          <div className="grid grid-cols-2 gap-2">
            {achievements.map((a, i) => (
              <div key={i} className="p-3 rounded-lg bg-card text-sm flex items-center gap-2">
                <span className="text-lg">{a.achievement.icon ?? '🏅'}</span>
                <div>
                  <div className="font-medium">{a.achievement.name}</div>
                  <div className="text-xs text-muted">{a.achievement.description}</div>
                </div>
              </div>
            ))}
            {achievements.length === 0 && <p className="text-muted text-sm col-span-2">Start trading to earn achievements</p>}
          </div>
        </div>
      </div>
    </div>
  );
}