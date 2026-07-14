import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { signToken, verifyToken, getBearerToken, adminPubkeys } from '../_shared/auth.ts';
import { toCamel, toCamelArray } from '../_shared/transform.ts';
import { num, round8 } from '../_shared/decimal.ts';
import { getMarkPrice, getTicker, fetchCandles } from '../_shared/price-feed.ts';
import { TradingEngine } from '../_shared/trading-engine.ts';
import { RiskEngine } from '../_shared/risk-engine.ts';
import { AiService } from '../_shared/ai.ts';
import { notify } from '../_shared/notify.ts';

const FUNCTION_SLUG = 'perps-api';

function parsePath(req: Request): string {
  const url = new URL(req.url);
  let path = url.pathname;
  for (const marker of [`/functions/v1/${FUNCTION_SLUG}`, `/${FUNCTION_SLUG}`]) {
    const idx = path.indexOf(marker);
    if (idx >= 0) {
      path = path.slice(idx + marker.length) || '/';
      break;
    }
  }
  return path.replace(/\/+$/, '') || '/';
}

function decodeSymbol(path: string, prefix: string): string {
  return decodeURIComponent(path.slice(prefix.length));
}

async function requireAuth(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error('Unauthorized');
  return verifyToken(token);
}

async function requireAdmin(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data: user } = await supabase.from('users').select('is_admin').eq('id', userId).single();
  if (!user?.is_admin) throw new Error('Admin access required');
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createServiceClient();
  const path = parsePath(req);
  const method = req.method;

  try {
    // ─── Health ─────────────────────────────────────────────────────────────
    if (path === '/health' && method === 'GET') {
      const { data: engine } = await supabase.from('engine_status').select('*').eq('id', 'global').maybeSingle();
      return jsonResponse({ status: 'ok', engine: toCamel(engine), timestamp: new Date().toISOString() });
    }

    // ─── Auth ───────────────────────────────────────────────────────────────
    if (path === '/auth/nonce' && method === 'POST') {
      const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await supabase.from('auth_nonces').insert({ nonce, expires_at: expiresAt });
      return jsonResponse({ nonce, expiresAt });
    }

    if (path === '/auth/verify' && method === 'POST') {
      const body = await req.json();
      const { nonce, signature, publicKey, message, directAddress, nametag, referralCode } = body;
      if (!nonce || !signature || !publicKey || !message) {
        return errorResponse('Missing required fields');
      }

      const { data: authNonce } = await supabase.from('auth_nonces').select('*').eq('nonce', nonce).maybeSingle();
      if (!authNonce || authNonce.used_at || new Date(authNonce.expires_at) < new Date()) {
        return errorResponse('Invalid or expired nonce');
      }
      if (!String(message).includes(nonce)) return errorResponse('Message does not match nonce');

      let valid = false;
      try {
        const { verifySignedMessage } = await import('npm:@unicitylabs/sphere-sdk@0.10.2');
        valid = verifySignedMessage(String(message), signature, publicKey);
      } catch {
        valid = false;
      }
      if (!valid) return errorResponse('Invalid signature', 401);

      await supabase.from('auth_nonces').update({
        used_at: new Date().toISOString(),
        chain_pubkey: publicKey,
      }).eq('id', authNonce.id);

      const isAdmin = adminPubkeys().has(publicKey);
      let { data: user } = await supabase.from('users').select('*').eq('chain_pubkey', publicKey).maybeSingle();

      if (!user) {
        let referredById: string | null = null;
        if (referralCode) {
          const { data: referrer } = await supabase.from('users').select('id').eq('referral_code', referralCode).maybeSingle();
          referredById = referrer?.id ?? null;
        }

        const { data: created, error } = await supabase.from('users').insert({
          chain_pubkey: publicKey,
          direct_address: directAddress ?? null,
          nametag: nametag ?? null,
          referred_by_id: referredById,
          is_admin: isAdmin,
        }).select('*').single();
        if (error || !created) throw error ?? new Error('Failed to create user');
        user = created;

        await supabase.from('wallets').insert({
          user_id: user.id,
          chain_pubkey: publicKey,
          direct_address: directAddress ?? null,
          nametag: nametag ?? null,
        });
        await supabase.from('balances').insert({ user_id: user.id });
        await supabase.from('settings').insert({ user_id: user.id });

        if (referredById) {
          await supabase.from('referral_rewards').insert({
            referrer_id: referredById,
            referred_id: user.id,
            amount: 10,
            type: 'signup',
          });
        }
      } else {
        const { data: updated } = await supabase.from('users').update({
          direct_address: directAddress ?? user.direct_address,
          nametag: nametag ?? user.nametag,
          last_login_at: new Date().toISOString(),
          is_admin: isAdmin || user.is_admin,
        }).eq('id', user.id).select('*').single();
        user = updated ?? user;
      }

      const token = await signToken({ userId: user.id, chainPubkey: publicKey });
      return jsonResponse({
        token,
        user: {
          id: user.id,
          chainPubkey: user.chain_pubkey,
          directAddress: user.direct_address,
          nametag: user.nametag,
          referralCode: user.referral_code,
          isAdmin: user.is_admin,
        },
      });
    }

    if (path === '/auth/me' && method === 'GET') {
      const auth = await requireAuth(req);
      const { data: user } = await supabase
        .from('users')
        .select('*, balance:balances(*), wallet:wallets(*), settings:settings(*)')
        .eq('id', auth.userId)
        .single();
      return jsonResponse(toCamel(user));
    }

    // ─── Markets (public) ─────────────────────────────────────────────────
    if (path === '/markets' && method === 'GET') {
      const { data: markets } = await supabase.from('markets').select('*').eq('is_active', true).order('sort_order');
      const enriched = await Promise.all((markets ?? []).map(async (m) => {
        const ticker = await getTicker(supabase, m.symbol);
        return {
          ...toCamel(m),
          price: ticker?.price ?? 0,
          change24h: ticker?.change24h ?? 0,
          volume24h: ticker?.volume24h ?? 0,
          fundingRate: ticker?.fundingRate ?? num(m.funding_rate),
          nextFundingAt: ticker?.nextFundingAt,
        };
      }));
      return jsonResponse(enriched);
    }

    if (path.startsWith('/markets/') && method === 'GET') {
      const symbol = decodeSymbol(path, '/markets/');
      const { data: market } = await supabase.from('markets').select('*').eq('symbol', symbol).maybeSingle();
      if (!market) return errorResponse('Market not found', 404);
      const ticker = await getTicker(supabase, symbol);
      return jsonResponse({ ...toCamel(market), ticker });
    }

    // ─── Prices (public) ──────────────────────────────────────────────────
    if (path === '/prices/tickers' && method === 'GET') {
      const { data: rows } = await supabase.from('market_prices').select('*');
      return jsonResponse((rows ?? []).map((r) => ({
        symbol: r.symbol,
        price: num(r.price),
        markPrice: num(r.mark_price),
        change24h: num(r.change_24h),
        volume24h: num(r.volume_24h),
        fundingRate: num(r.funding_rate),
        nextFundingAt: r.next_funding_at,
      })));
    }

    if (path.match(/^\/prices\/[^/]+\/candles$/) && method === 'GET') {
      const symbol = decodeSymbol(path, '/prices/').replace(/\/candles$/, '');
      const url = new URL(req.url);
      const interval = url.searchParams.get('interval') ?? '1h';
      const limit = parseInt(url.searchParams.get('limit') ?? '500', 10);
      const candles = await fetchCandles(supabase, symbol, interval, limit);
      return jsonResponse(candles);
    }

    if (path.startsWith('/prices/') && method === 'GET') {
      const symbol = decodeSymbol(path, '/prices/');
      const ticker = await getTicker(supabase, symbol);
      if (!ticker) return errorResponse('Ticker not found', 404);
      return jsonResponse(ticker);
    }

    // ─── Authenticated routes ───────────────────────────────────────────────
    const auth = await requireAuth(req);
    const trading = new TradingEngine(supabase);

    if (path === '/orders' && method === 'POST') {
      const body = await req.json();
      const result = await trading.placeOrder({
        userId: auth.userId,
        marketId: body.marketId,
        type: body.type,
        side: body.side,
        size: body.size,
        price: body.price,
        leverage: body.leverage,
        marginMode: body.marginMode,
        reduceOnly: body.reduceOnly,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
      });
      return jsonResponse(toCamel(result as Record<string, unknown>), 201);
    }

    if (path === '/orders/open' && method === 'GET') {
      const { data } = await supabase
        .from('orders')
        .select('*, market:markets(*)')
        .eq('user_id', auth.userId)
        .in('status', ['OPEN', 'PENDING', 'PARTIALLY_FILLED'])
        .order('created_at', { ascending: false });
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path.match(/^\/orders\/[^/]+$/) && method === 'DELETE') {
      const id = path.split('/')[2];
      const result = await trading.cancelOrder(id, auth.userId);
      return jsonResponse(toCamel(result));
    }

    if (path === '/positions' && method === 'GET') {
      const url = new URL(req.url);
      const status = url.searchParams.get('status') ?? 'OPEN';
      const { data } = await supabase
        .from('positions')
        .select('*, market:markets(*)')
        .eq('user_id', auth.userId)
        .eq('status', status)
        .order('created_at', { ascending: false });

      const enriched = await Promise.all((data ?? []).map(async (p) => {
        const markPrice = await getMarkPrice(supabase, p.market.symbol) ?? num(p.mark_price);
        const metrics = RiskEngine.calculateMetrics({
          side: p.side,
          size: num(p.size),
          entryPrice: num(p.entry_price),
          markPrice,
          leverage: p.leverage,
          marginMode: p.margin_mode,
          maintenanceMarginRate: num(p.market.maintenance_margin),
        });
        return { ...toCamel(p), liveMarkPrice: markPrice, liveMetrics: metrics };
      }));
      return jsonResponse(enriched);
    }

    if (path.match(/^\/positions\/[^/]+\/close$/) && method === 'POST') {
      const id = path.split('/')[2];
      const body = await req.json().catch(() => ({}));
      const result = await trading.closePosition(id, auth.userId, body.size);
      return jsonResponse(toCamel(result as Record<string, unknown>));
    }

    if (path === '/trades' && method === 'GET') {
      const { data } = await supabase
        .from('trades')
        .select('*, market:markets(*)')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false })
        .limit(100);
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path === '/trades/funding' && method === 'GET') {
      const { data } = await supabase
        .from('funding_payments')
        .select('*, market:markets(*)')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false })
        .limit(100);
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path === '/trades/stats' && method === 'GET') {
      const { data: trades } = await supabase.from('trades').select('*').eq('user_id', auth.userId);
      const { data: closedPositions } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', auth.userId)
        .in('status', ['CLOSED', 'LIQUIDATED']);

      const closed = closedPositions ?? [];
      const wins = closed.filter((p) => num(p.realized_pnl) > 0);
      const losses = closed.filter((p) => num(p.realized_pnl) < 0);
      const now = Date.now();
      const pnlInPeriod = (days: number) =>
        closed
          .filter((p) => p.closed_at && new Date(p.closed_at).getTime() >= now - days * 86400000)
          .reduce((s, p) => s + num(p.realized_pnl), 0);

      const { data: balance } = await supabase.from('balances').select('*').eq('user_id', auth.userId).maybeSingle();
      const portfolioValue = num(balance?.available) + num(balance?.locked);
      const largestWin = wins.length ? Math.max(...wins.map((p) => num(p.realized_pnl))) : 0;
      const largestLoss = losses.length ? Math.min(...losses.map((p) => num(p.realized_pnl))) : 0;
      const avgWin = wins.length ? wins.reduce((s, p) => s + num(p.realized_pnl), 0) / wins.length : 0;
      const avgLoss = losses.length
        ? Math.abs(losses.reduce((s, p) => s + num(p.realized_pnl), 0) / losses.length)
        : 0;

      return jsonResponse({
        portfolioValue,
        dailyPnl: pnlInPeriod(1),
        weeklyPnl: pnlInPeriod(7),
        monthlyPnl: pnlInPeriod(30),
        winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
        averageRR: avgLoss > 0 ? avgWin / avgLoss : 0,
        largestWin,
        largestLoss,
        totalTrades: (trades ?? []).length,
        totalVolume: (trades ?? []).reduce((s, t) => s + num(t.size) * num(t.price), 0),
      });
    }

    if (path === '/wallet' && method === 'GET') {
      const { data: user } = await supabase
        .from('users')
        .select('*, balance:balances(*), wallet:wallets(*)')
        .eq('id', auth.userId)
        .single();

      const [{ count: pendingDeposits }, { count: pendingWithdrawals }] = await Promise.all([
        supabase.from('deposits').select('*', { count: 'exact', head: true })
          .eq('user_id', auth.userId).in('status', ['PENDING', 'CONFIRMING']),
        supabase.from('withdrawals').select('*', { count: 'exact', head: true })
          .eq('user_id', auth.userId).in('status', ['PENDING', 'PROCESSING']),
      ]);

      return jsonResponse({
        wallet: toCamel(user?.wallet ?? null),
        balance: toCamel(user?.balance ?? null),
        tradingBalance: num(user?.balance?.available),
        lockedBalance: num(user?.balance?.locked),
        pendingDeposits: pendingDeposits ?? 0,
        pendingWithdrawals: pendingWithdrawals ?? 0,
        treasuryAddress: null,
        treasuryNametag: Deno.env.get('SPHERE_TREASURY_NAMETAG') ?? 'sphere-perps-treasury',
      });
    }

    if (path === '/deposits' && method === 'POST') {
      const body = await req.json();
      const { amount, sphereTransferId, txHash } = body;
      if (!amount || amount <= 0) return errorResponse('Invalid amount');

      const { data: system } = await supabase.from('system_settings').select('deposit_enabled').eq('id', 'global').maybeSingle();
      if (system && !system.deposit_enabled) return errorResponse('Deposits are currently disabled', 403);

      const { data: deposit } = await supabase.from('deposits').insert({
        user_id: auth.userId,
        amount,
        sphere_transfer_id: sphereTransferId ?? null,
        tx_hash: txHash ?? null,
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      }).select('*').single();

      const { data: bal } = await supabase.from('balances').select('*').eq('user_id', auth.userId).maybeSingle();
      if (bal) {
        await supabase.from('balances').update({
          available: round8(num(bal.available) + amount),
          total_deposited: round8(num(bal.total_deposited) + amount),
        }).eq('user_id', auth.userId);
      }

      await notify(supabase, auth.userId, {
        type: 'DEPOSIT_COMPLETE',
        title: 'Deposit Complete',
        message: `${amount} UCT deposited successfully`,
        data: { depositId: deposit?.id },
      });
      return jsonResponse(toCamel(deposit), 201);
    }

    if (path === '/deposits' && method === 'GET') {
      const { data } = await supabase.from('deposits').select('*').eq('user_id', auth.userId).order('created_at', { ascending: false });
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path === '/withdrawals' && method === 'POST') {
      const body = await req.json();
      const { amount, recipientAddress } = body;
      if (!amount || !recipientAddress) return errorResponse('Invalid withdrawal request');

      const { data: system } = await supabase.from('system_settings').select('withdrawal_enabled').eq('id', 'global').maybeSingle();
      if (system && !system.withdrawal_enabled) return errorResponse('Withdrawals are currently disabled', 403);

      const { data: balance } = await supabase.from('balances').select('*').eq('user_id', auth.userId).maybeSingle();
      if (!balance || num(balance.available) < amount) return errorResponse('Insufficient balance');

      const { data: withdrawal } = await supabase.from('withdrawals').insert({
        user_id: auth.userId,
        amount,
        recipient_address: recipientAddress,
        status: 'PROCESSING',
      }).select('*').single();

      await supabase.from('balances').update({
        available: round8(num(balance.available) - amount),
        total_withdrawn: round8(num(balance.total_withdrawn) + amount),
      }).eq('user_id', auth.userId);

      const { data: completed } = await supabase.from('withdrawals').update({
        status: 'COMPLETED',
        sphere_transfer_id: `mock-${Date.now()}`,
        completed_at: new Date().toISOString(),
      }).eq('id', withdrawal!.id).select('*').single();

      await notify(supabase, auth.userId, {
        type: 'WITHDRAWAL_COMPLETE',
        title: 'Withdrawal Complete',
        message: `${amount} UCT sent to ${recipientAddress}`,
        data: { withdrawalId: completed?.id },
      });
      return jsonResponse(toCamel(completed), 201);
    }

    if (path === '/withdrawals' && method === 'GET') {
      const { data } = await supabase.from('withdrawals').select('*').eq('user_id', auth.userId).order('created_at', { ascending: false });
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path.startsWith('/ai/market-summary/') && method === 'GET') {
      const symbol = decodeSymbol(path, '/ai/market-summary/');
      const ticker = await getTicker(supabase, symbol);
      if (!ticker) return errorResponse('Market not found', 404);
      const summary = await AiService.generateMarketSummary(ticker);
      return jsonResponse(summary);
    }

    if (path === '/ai/risk-score' && method === 'POST') {
      const body = await req.json();
      const ticker = await getTicker(supabase, body.symbol);
      const price = body.price ?? ticker?.price ?? 0;
      const { data: balance } = await supabase.from('balances').select('available').eq('user_id', auth.userId).maybeSingle();
      const assessment = await AiService.assessTradeRisk({
        ...body,
        price,
        change24h: ticker?.change24h ?? 0,
        balance: num(balance?.available),
      });
      return jsonResponse(assessment);
    }

    if (path === '/ai/news-summary' && method === 'GET') {
      const { data: markets } = await supabase.from('markets').select('symbol').eq('is_active', true).limit(6);
      const symbols = (markets ?? []).map((m) => m.symbol);
      const summary = await AiService.generateNewsSummary(symbols);
      return jsonResponse({ summary, symbols });
    }

    if (path === '/ai/journal' && method === 'GET') {
      const { data } = await supabase
        .from('trade_journals')
        .select('*, position:positions(*, market:markets(*))')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false })
        .limit(20);
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path.match(/^\/leaderboard\/[^/]+$/) && method === 'GET' && !path.includes('/user/')) {
      const period = path.split('/')[2];
      const url = new URL(req.url);
      const sortBy = url.searchParams.get('sortBy') ?? 'pnl';
      const { data } = await supabase
        .from('leaderboard_entries')
        .select('*, user:users(id, nametag, chain_pubkey)')
        .eq('period', period)
        .order(sortBy === 'roi' ? 'roi' : sortBy === 'winRate' ? 'win_rate' : sortBy === 'volume' ? 'volume' : sortBy === 'consistency' ? 'consistency' : 'pnl', { ascending: false })
        .limit(50);
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path === '/leaderboard/user/referrals' && method === 'GET') {
      const { data: referrals } = await supabase
        .from('users')
        .select('id, nametag, chain_pubkey, created_at')
        .eq('referred_by_id', auth.userId);
      const { data: rewards } = await supabase
        .from('referral_rewards')
        .select('*')
        .eq('referrer_id', auth.userId)
        .order('created_at', { ascending: false });
      const { data: user } = await supabase.from('users').select('referral_code').eq('id', auth.userId).single();
      return jsonResponse({
        referralCode: user?.referral_code,
        referrals: toCamelArray(referrals ?? []),
        rewards: toCamelArray(rewards ?? []),
      });
    }

    if (path === '/notifications' && method === 'GET') {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', auth.userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      return jsonResponse(toCamelArray(data ?? []));
    }

    if (path === '/notifications/read' && method === 'POST') {
      const { ids } = await req.json();
      if (Array.isArray(ids) && ids.length) {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', auth.userId).in('id', ids);
      }
      return jsonResponse({ success: true });
    }

    if (path === '/notifications/achievements' && method === 'GET') {
      const { data } = await supabase
        .from('user_achievements')
        .select('*, achievement:achievements(*)')
        .eq('user_id', auth.userId);
      return jsonResponse(toCamelArray(data ?? []));
    }

    // ─── Admin ──────────────────────────────────────────────────────────────
    if (path.startsWith('/admin')) {
      await requireAdmin(supabase, auth.userId);

      if (path === '/admin/dashboard' && method === 'GET') {
        const [users, deposits, withdrawals, positions, trades, system] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('deposits').select('amount'),
          supabase.from('withdrawals').select('amount'),
          supabase.from('positions').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'),
          supabase.from('trades').select('*', { count: 'exact', head: true }),
          supabase.from('system_settings').select('*').eq('id', 'global').maybeSingle(),
        ]);
        const depVol = (deposits.data ?? []).reduce((s, d) => s + num(d.amount), 0);
        const wVol = (withdrawals.data ?? []).reduce((s, w) => s + num(w.amount), 0);
        return jsonResponse({
          users: users.count ?? 0,
          openPositions: positions.count ?? 0,
          totalTrades: trades.count ?? 0,
          deposits: { count: (deposits.data ?? []).length, volume: depVol },
          withdrawals: { count: (withdrawals.data ?? []).length, volume: wVol },
          system: toCamel(system.data),
          health: 'healthy',
        });
      }

      if (path === '/admin/users' && method === 'GET') {
        const url = new URL(req.url);
        const skip = parseInt(url.searchParams.get('skip') ?? '0', 10);
        const { data } = await supabase.from('users').select('*, balance:balances(*)').order('created_at', { ascending: false }).range(skip, skip + 99);
        return jsonResponse(toCamelArray(data ?? []));
      }

      if (path === '/admin/markets' && method === 'GET') {
        const { data } = await supabase.from('markets').select('*').order('sort_order');
        return jsonResponse(toCamelArray(data ?? []));
      }

      if (path.match(/^\/admin\/markets\/[^/]+$/) && method === 'PATCH') {
        const id = path.split('/')[3];
        const body = await req.json();
        const { data } = await supabase.from('markets').update({
          is_active: body.isActive,
          max_leverage: body.maxLeverage,
          funding_rate: body.fundingRate,
          is_trending: body.isTrending,
        }).eq('id', id).select('*').single();
        return jsonResponse(toCamel(data));
      }

      if (path === '/admin/settings' && method === 'PATCH') {
        const body = await req.json();
        const { data } = await supabase.from('system_settings').upsert({
          id: 'global',
          trading_enabled: body.tradingEnabled,
          max_leverage: body.maxLeverage,
          maintenance_mode: body.maintenanceMode,
          deposit_enabled: body.depositEnabled,
          withdrawal_enabled: body.withdrawalEnabled,
          updated_at: new Date().toISOString(),
        }).select('*').single();
        return jsonResponse(toCamel(data));
      }
    }

    return errorResponse('Not found', 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Request failed';
    const status = msg === 'Unauthorized' ? 401 : msg.includes('Admin') ? 403 : 400;
    console.error(`[platform] ${path}`, err);
    return errorResponse(msg, status);
  }
});