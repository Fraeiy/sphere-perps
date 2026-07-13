import { PositionSide } from '@prisma/client';
import { config } from '../config.js';

export interface TradeJournalResult {
  summary: string;
  analysis: string;
  riskScore: number;
  suggestions: Record<string, string>;
}

export interface MarketSummaryResult {
  symbol: string;
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  keyLevels: { support: number; resistance: number };
}

export class AiService {
  private static async callLlm(prompt: string): Promise<string> {
    if (config.ai.provider === 'mock' || !config.ai.apiKey) {
      return this.mockResponse(prompt);
    }

    try {
      const baseUrl =
        config.ai.provider === 'spacexai'
          ? 'https://api.x.ai/v1'
          : 'https://api.openai.com/v1';

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: config.ai.provider === 'spacexai' ? 'grok-2' : 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert crypto perpetual futures trading analyst. Be concise, actionable, and risk-aware.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? this.mockResponse(prompt);
    } catch {
      return this.mockResponse(prompt);
    }
  }

  private static mockResponse(prompt: string): string {
    if (prompt.includes('trade journal')) {
      return 'Trade closed with mixed results. Entry timing was reasonable but leverage amplified losses. Consider reducing position size on volatile assets.';
    }
    if (prompt.includes('market summary')) {
      return 'Market showing consolidation with moderate volume. Watch key support/resistance levels before entering new positions.';
    }
    if (prompt.includes('trading coach')) {
      return 'This loss came from holding through adverse price action. Set tighter stop losses and avoid averaging into losing positions.';
    }
    if (prompt.includes('news summary')) {
      return 'Major crypto markets remain sensitive to macro data. BTC correlation with equities elevated. Exercise caution with high leverage.';
    }
    return 'Analysis complete. Review risk parameters before next trade.';
  }

  static async generateTradeJournal(params: {
    symbol: string;
    side: PositionSide;
    entryPrice: number;
    exitPrice: number;
    leverage: number;
    realizedPnl: number;
    size: number;
  }): Promise<TradeJournalResult> {
    const pnlPct = ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100;
    const prompt = `Generate a trade journal for:
trade journal
Symbol: ${params.symbol}
Side: ${params.side}
Entry: $${params.entryPrice}
Exit: $${params.exitPrice}
Leverage: ${params.leverage}x
Size: ${params.size}
PnL: $${params.realizedPnl.toFixed(2)} (${pnlPct.toFixed(2)}%)
Provide 2-3 sentence analysis.`;

    const analysis = await this.callLlm(prompt);
    const riskScore = Math.min(100, Math.abs(params.leverage * 2) + (params.realizedPnl < 0 ? 30 : 0));

    return {
      summary: `${params.side} ${params.symbol}: ${params.realizedPnl >= 0 ? 'Profit' : 'Loss'} of $${Math.abs(params.realizedPnl).toFixed(2)} at ${params.leverage}x`,
      analysis,
      riskScore,
      suggestions: {
        leverage: params.leverage > 20 ? 'Consider reducing leverage below 20x' : 'Leverage within reasonable range',
        sizing: 'Risk no more than 2-5% of account per trade',
        timing: params.realizedPnl < 0 ? 'Avoid chasing extended moves' : 'Good execution — maintain discipline',
      },
    };
  }

  static async generateMarketSummary(params: {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    fundingRate: number;
  }): Promise<MarketSummaryResult> {
    const prompt = `market summary for ${params.symbol}:
Price: $${params.price}, 24h: ${params.change24h}%, Volume: $${params.volume24h}, Funding: ${params.fundingRate}`;

    const summary = await this.callLlm(prompt);

    return {
      symbol: params.symbol,
      summary,
      sentiment: params.change24h > 1 ? 'bullish' : params.change24h < -1 ? 'bearish' : 'neutral',
      keyLevels: {
        support: params.price * 0.97,
        resistance: params.price * 1.03,
      },
    };
  }

  static async generateTradingCoach(params: {
    realizedPnl: number;
    leverage: number;
    side: PositionSide;
    symbol: string;
  }): Promise<string> {
    const prompt = `trading coach: User lost $${Math.abs(params.realizedPnl).toFixed(2)} on ${params.side} ${params.symbol} at ${params.leverage}x leverage. Explain the mistake briefly.`;
    return this.callLlm(prompt);
  }

  static async generateNewsSummary(symbols: string[]): Promise<string> {
    const prompt = `news summary affecting: ${symbols.join(', ')}. Summarize major crypto news in 3-4 sentences.`;
    return this.callLlm(prompt);
  }

  static async assessTradeRisk(params: {
    symbol: string;
    side: string;
    leverage: number;
    size: number;
    price: number;
    change24h: number;
    balance: number;
  }): Promise<{
    risk: string;
    reward: number;
    trendDirection: string;
    volatility: string;
    suggestedLeverage: number;
    suggestedStopLoss: number;
    suggestedTakeProfit: number;
    explanation: string;
  }> {
    const notional = params.size * params.price;
    const marginPct = params.balance > 0 ? (notional / params.leverage / params.balance) * 100 : 100;

    let risk = 'low';
    if (params.leverage >= 50 || marginPct > 25) risk = 'extreme';
    else if (params.leverage >= 20 || marginPct > 15) risk = 'high';
    else if (params.leverage >= 10) risk = 'medium';

    const slPct = Math.abs(params.change24h) > 5 ? 0.02 : 0.015;
    const isLong = params.side === 'BUY' || params.side === 'LONG';

    return {
      risk,
      reward: slPct * 200,
      trendDirection: params.change24h > 1 ? 'bullish' : params.change24h < -1 ? 'bearish' : 'neutral',
      volatility: Math.abs(params.change24h) > 5 ? 'high' : Math.abs(params.change24h) > 2 ? 'medium' : 'low',
      suggestedLeverage: Math.min(params.leverage, risk === 'extreme' ? 5 : risk === 'high' ? 10 : 20),
      suggestedStopLoss: isLong ? params.price * (1 - slPct) : params.price * (1 + slPct),
      suggestedTakeProfit: isLong ? params.price * (1 + slPct * 2) : params.price * (1 - slPct * 2),
      explanation: `You are risking ~${marginPct.toFixed(1)}% of account at ${params.leverage}x on ${params.symbol}. ${risk === 'high' || risk === 'extreme' ? 'Consider reducing leverage.' : 'Risk parameters look reasonable.'}`,
    };
  }
}