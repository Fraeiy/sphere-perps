import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn, formatPrice } from '@/lib/utils';

export function PositionsTable() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.getPositions('OPEN'),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.getOpenOrders(),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades'],
    queryFn: () => api.getTrades(),
    enabled: !!user,
  });

  const { data: funding = [] } = useQuery({
    queryKey: ['funding'],
    queryFn: () => api.getFundingHistory(),
    enabled: !!user,
  });

  const { data: deposits = [] } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => api.getDeposits(),
    enabled: !!user,
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => api.getWithdrawals(),
    enabled: !!user,
  });

  const closePosition = useMutation({
    mutationFn: (id: string) => api.closePosition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  if (!user) {
    return (
      <div className="h-48 border-t border-border flex items-center justify-center text-muted text-sm">
        Connect wallet to view positions
      </div>
    );
  }

  return (
    <div className="h-56 border-t border-border shrink-0">
      <Tabs defaultValue="positions" className="h-full flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="positions">Positions ({positions.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="funding">Funding</TabsTrigger>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto scrollbar-thin px-4 pb-2">
          <TabsContent value="positions" className="mt-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Market</th>
                  <th className="text-left">Side</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Mark</th>
                  <th className="text-right">Liq.</th>
                  <th className="text-right">PnL</th>
                  <th className="text-right">ROE</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const pnl = p.liveMetrics?.unrealizedPnl ?? Number(p.unrealizedPnl);
                  const roe = p.liveMetrics?.roe ?? Number(p.roe);
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-card-hover">
                      <td className="py-2 font-medium">{p.market.symbol}</td>
                      <td className={p.side === 'LONG' ? 'text-long' : 'text-short'}>{p.side}</td>
                      <td className="text-right font-mono">{Number(p.size).toFixed(4)}</td>
                      <td className="text-right font-mono">{formatPrice(Number(p.entryPrice))}</td>
                      <td className="text-right font-mono">{formatPrice(p.liveMarkPrice ?? Number(p.markPrice))}</td>
                      <td className="text-right font-mono text-short">{formatPrice(p.liveMetrics?.liquidationPrice ?? Number(p.liquidationPrice))}</td>
                      <td className={cn('text-right font-mono', pnl >= 0 ? 'text-long' : 'text-short')}>
                        ${pnl.toFixed(2)}
                      </td>
                      <td className={cn('text-right font-mono', roe >= 0 ? 'text-long' : 'text-short')}>
                        {roe.toFixed(2)}%
                      </td>
                      <td className="text-right">
                        <Button variant="outline" size="sm" onClick={() => closePosition.mutate(p.id)} disabled={closePosition.isPending}>
                          Close
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {positions.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted">No open positions</td></tr>
                )}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="orders" className="mt-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Market</th>
                  <th className="text-left">Type</th>
                  <th className="text-left">Side</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2">{o.market.symbol}</td>
                    <td>{o.type}</td>
                    <td className={o.side === 'BUY' ? 'text-long' : 'text-short'}>{o.side}</td>
                    <td className="text-right font-mono">{Number(o.size).toFixed(4)}</td>
                    <td className="text-right font-mono">{o.price ? formatPrice(Number(o.price)) : 'Market'}</td>
                    <td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => cancelOrder.mutate(o.id)}>Cancel</Button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted">No open orders</td></tr>
                )}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Market</th>
                  <th className="text-left">Side</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">PnL</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 20).map((t) => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="py-2">{t.market.symbol}</td>
                    <td className={t.side === 'BUY' ? 'text-long' : 'text-short'}>{t.side}</td>
                    <td className="text-right font-mono">{Number(t.size).toFixed(4)}</td>
                    <td className="text-right font-mono">{formatPrice(Number(t.price))}</td>
                    <td className={cn('text-right font-mono', Number(t.realizedPnl) >= 0 ? 'text-long' : 'text-short')}>
                      ${Number(t.realizedPnl).toFixed(2)}
                    </td>
                    <td className="text-right text-muted">{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="funding" className="mt-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Market</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Payment</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {(funding as Array<{ id: string; market: { symbol: string }; rate: number; payment: number; createdAt: string }>).map((f) => (
                  <tr key={f.id} className="border-b border-border/50">
                    <td className="py-2">{f.market?.symbol}</td>
                    <td className="text-right font-mono">{(Number(f.rate) * 100).toFixed(4)}%</td>
                    <td className={cn('text-right font-mono', Number(f.payment) >= 0 ? 'text-long' : 'text-short')}>
                      ${Number(f.payment).toFixed(4)}
                    </td>
                    <td className="text-right text-muted">{new Date(f.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="deposits" className="mt-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {(deposits as Array<{ id: string; amount: number; status: string; createdAt: string }>).map((d) => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="py-2 font-mono">{Number(d.amount).toFixed(2)} UCT</td>
                    <td>{d.status}</td>
                    <td className="text-right text-muted">{new Date(d.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="withdrawals" className="mt-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {(withdrawals as Array<{ id: string; amount: number; status: string; createdAt: string }>).map((w) => (
                  <tr key={w.id} className="border-b border-border/50">
                    <td className="py-2 font-mono">{Number(w.amount).toFixed(2)} UCT</td>
                    <td>{w.status}</td>
                    <td className="text-right text-muted">{new Date(w.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}