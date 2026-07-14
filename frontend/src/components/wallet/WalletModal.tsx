import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { sphereWallet } from '@/lib/sphere-wallet';
import { cn } from '@/lib/utils';

const QUICK_AMOUNTS = [10, 50, 100, 500];

export function WalletModal() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    enabled: !!user,
    refetchInterval: 8000,
  });

  const { data: deposits = [] } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => api.getDeposits(),
    enabled: !!user && open,
  });

  const deposit = useMutation({
    mutationFn: async (amount: number) => {
      setFeedback(null);

      if (!sphereWallet.isConnected()) {
        await sphereWallet.trySilentConnect();
      }

      if (wallet?.treasuryNametag && sphereWallet.isConnected()) {
        const amountBase = String(Math.floor(amount * 1_000_000));
        const result = await sphereWallet.sendTokens(
          `@${wallet.treasuryNametag}`,
          amountBase,
          'UCT',
        );
        return api.deposit(amount, result.id);
      }

      return api.deposit(amount);
    },
    onSuccess: (_data, amount) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      setDepositAmount('');
      setFeedback({
        type: 'success',
        message: `${amount.toFixed(2)} UCT credited to your trading balance`,
      });
    },
    onError: (err: Error) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Deposit failed. Check your Sphere Wallet balance and try again.',
      });
    },
  });

  const withdraw = useMutation({
    mutationFn: (amount: number) =>
      api.withdraw(amount, user!.directAddress ?? user!.chainPubkey),
    onSuccess: (_data, amount) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      setWithdrawAmount('');
      setFeedback({
        type: 'success',
        message: `${amount.toFixed(2)} UCT withdrawal submitted`,
      });
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message || 'Withdrawal failed' });
    },
  });

  if (!user) return null;

  const tradingBalance = wallet?.tradingBalance ?? 0;
  const lockedBalance = wallet?.lockedBalance ?? 0;
  const totalEquity = tradingBalance + lockedBalance;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFeedback(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="glass" size="sm" className="gap-2 border-accent/20 hover:border-accent/40">
          <Wallet className="w-4 h-4 text-accent" />
          <span className="font-mono font-semibold">
            {walletLoading ? '...' : `$${tradingBalance.toFixed(2)}`}
          </span>
          <span className="text-muted text-[10px] uppercase tracking-wider hidden sm:inline">UCT</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="relative px-6 pt-6 pb-4 border-b border-border bg-gradient-to-br from-accent/10 via-transparent to-transparent">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(244,122,32,0.15),transparent_60%)]" />
          <DialogHeader className="relative mb-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-deep flex items-center justify-center shadow-lg shadow-accent/25">
                <Wallet className="w-4 h-4 text-white" />
              </div>
              Trading Wallet
            </DialogTitle>
            <p className="text-xs text-muted mt-1">
              {user.nametag ? `@${user.nametag}` : 'Connected via Sphere'}
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-card border border-border/80">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Available</div>
              <div className="text-lg font-mono font-bold text-accent">
                ${tradingBalance.toFixed(2)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-card border border-border/80">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">In Positions</div>
              <div className="text-lg font-mono font-bold">${lockedBalance.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-xl bg-card border border-border/80">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Total Equity</div>
              <div className="text-lg font-mono font-bold">${totalEquity.toFixed(2)}</div>
            </div>
          </div>

          {feedback && (
            <div
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg text-sm animate-fade-in',
                feedback.type === 'success'
                  ? 'bg-long/10 border border-long/30 text-long'
                  : 'bg-short/10 border border-short/30 text-short',
              )}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <Tabs defaultValue="deposit">
            <TabsList className="w-full h-11">
              <TabsTrigger value="deposit" className="flex-1 gap-1.5">
                <ArrowDownToLine className="w-3.5 h-3.5" /> Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="flex-1 gap-1.5">
                <ArrowUpFromLine className="w-3.5 h-3.5" /> Withdraw
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 gap-1.5">
                <History className="w-3.5 h-3.5" /> History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="deposit" className="space-y-3 mt-4">
              <p className="text-xs text-muted leading-relaxed">
                Transfer UCT from your Sphere Wallet to{' '}
                <span className="text-accent font-medium">
                  @{wallet?.treasuryNametag ?? 'sphere-perps-treasury'}
                </span>
                . Funds are credited instantly to your trading balance.
              </p>

              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDepositAmount(String(amt))}
                    className="px-3 py-1 text-xs rounded-full border border-border-light hover:border-accent/50 hover:bg-accent/10 transition-colors"
                  >
                    {amt} UCT
                  </button>
                ))}
              </div>

              <Input
                type="number"
                placeholder="Amount (UCT)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min="0"
                step="0.01"
              />

              <Button
                className="w-full"
                size="lg"
                onClick={() => deposit.mutate(parseFloat(depositAmount))}
                disabled={!depositAmount || parseFloat(depositAmount) <= 0 || deposit.isPending}
              >
                {deposit.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  'Deposit UCT'
                )}
              </Button>
            </TabsContent>

            <TabsContent value="withdraw" className="space-y-3 mt-4">
              <p className="text-xs text-muted">
                Withdraw available balance back to your Sphere Wallet.
              </p>
              <Input
                type="number"
                placeholder="Amount (UCT)"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                max={tradingBalance}
              />
              <div className="flex justify-between text-xs text-muted">
                <span>Available</span>
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => setWithdrawAmount(String(tradingBalance))}
                >
                  Max: ${tradingBalance.toFixed(2)}
                </button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={() => withdraw.mutate(parseFloat(withdrawAmount))}
                disabled={
                  !withdrawAmount ||
                  parseFloat(withdrawAmount) <= 0 ||
                  parseFloat(withdrawAmount) > tradingBalance ||
                  withdraw.isPending
                }
              >
                {withdraw.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  'Withdraw UCT'
                )}
              </Button>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-2">
                {(deposits as Array<{ id: string; amount: number; status: string; createdAt: string }>).length === 0 ? (
                  <p className="text-sm text-muted text-center py-6">No deposits yet</p>
                ) : (
                  (deposits as Array<{ id: string; amount: number; status: string; createdAt: string }>).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/60 text-sm"
                    >
                      <div>
                        <div className="font-mono font-medium">+{Number(d.amount).toFixed(2)} UCT</div>
                        <div className="text-xs text-muted">
                          {new Date(d.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full',
                          d.status === 'COMPLETED'
                            ? 'bg-long/15 text-long'
                            : 'bg-warning/15 text-warning',
                        )}
                      >
                        {d.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}