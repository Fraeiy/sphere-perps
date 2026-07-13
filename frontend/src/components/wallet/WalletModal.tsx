import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { sphereWallet } from '@/lib/sphere-wallet';

export function WalletModal() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [open, setOpen] = useState(false);

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.getWallet(),
    enabled: !!user && open,
  });

  const deposit = useMutation({
    mutationFn: async (amount: number) => {
      if (wallet?.treasuryNametag && sphereWallet.isConnected()) {
        const amountBase = String(Math.floor(amount * 1_000_000));
        const result = await sphereWallet.sendTokens(`@${wallet.treasuryNametag}`, amountBase, 'UCT');
        return api.deposit(amount, result.id);
      }
      return api.deposit(amount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setDepositAmount('');
    },
  });

  const withdraw = useMutation({
    mutationFn: (amount: number) =>
      api.withdraw(amount, user!.directAddress ?? user!.chainPubkey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setWithdrawAmount('');
    },
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="glass" size="sm">
          <Wallet className="w-4 h-4" />
          ${wallet?.tradingBalance?.toFixed(2) ?? '0.00'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Wallet</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-card">
            <div className="text-xs text-muted">Trading Balance</div>
            <div className="text-xl font-mono font-bold">${wallet?.tradingBalance?.toFixed(2) ?? '0.00'}</div>
          </div>
          <div className="p-3 rounded-lg bg-card">
            <div className="text-xs text-muted">In Positions</div>
            <div className="text-xl font-mono font-bold">${wallet?.lockedBalance?.toFixed(2) ?? '0.00'}</div>
          </div>
        </div>

        <Tabs defaultValue="deposit">
          <TabsList className="w-full">
            <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-3">
            <p className="text-xs text-muted">
              Deposit UCT to @{wallet?.treasuryNametag ?? 'sphere-perps-treasury'} via Sphere Wallet
            </p>
            <Input
              type="number"
              placeholder="Amount (UCT)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <Button
              className="w-full"
              onClick={() => deposit.mutate(parseFloat(depositAmount))}
              disabled={!depositAmount || deposit.isPending}
            >
              {deposit.isPending ? 'Processing...' : 'Deposit UCT'}
            </Button>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-3">
            <Input
              type="number"
              placeholder="Amount (UCT)"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => withdraw.mutate(parseFloat(withdrawAmount))}
              disabled={!withdrawAmount || withdraw.isPending}
            >
              {withdraw.isPending ? 'Processing...' : 'Withdraw UCT'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}