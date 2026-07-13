import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Shield, Activity, Users, DollarSign } from 'lucide-react';

export function AdminPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.getAdminDashboard(),
    enabled: !!user?.isAdmin,
  });

  const toggleTrading = useMutation({
    mutationFn: (tradingEnabled: boolean) => api.updateSystemSettings({ tradingEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
  });

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted">
        Admin access required
      </div>
    );
  }

  const d = dashboard as {
    users: number;
    openPositions: number;
    totalTrades: number;
    deposits: { count: number };
    withdrawals: { count: number };
    system: { tradingEnabled: boolean; maintenanceMode: boolean };
    health: string;
  } | undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="w-6 h-6 text-accent" /> Admin Dashboard
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Users" value={d?.users ?? 0} />
        <StatCard icon={Activity} label="Open Positions" value={d?.openPositions ?? 0} />
        <StatCard icon={DollarSign} label="Deposits" value={d?.deposits?.count ?? 0} />
        <StatCard icon={DollarSign} label="Withdrawals" value={d?.withdrawals?.count ?? 0} />
      </div>

      <div className="p-4 rounded-xl glass space-y-4">
        <h2 className="font-semibold">System Controls</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm">Trading Enabled:</span>
          <Button
            variant={d?.system?.tradingEnabled ? 'long' : 'short'}
            size="sm"
            onClick={() => toggleTrading.mutate(!d?.system?.tradingEnabled)}
          >
            {d?.system?.tradingEnabled ? 'ON' : 'OFF'}
          </Button>
          <span className="text-sm text-muted">Health: {d?.health ?? 'unknown'}</span>
        </div>
      </div>

      <div className="p-4 rounded-xl glass">
        <h2 className="font-semibold mb-3">System Logs</h2>
        <div className="font-mono text-xs text-muted space-y-1">
          <div>[INFO] System operational</div>
          <div>[INFO] Price feed connected to Binance</div>
          <div>[INFO] WebSocket server active</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="p-4 rounded-xl glass">
      <div className="flex items-center gap-2 text-muted text-xs mb-1">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}