import { TradeRiskScorer, type PositionSide } from './risk-engine.ts';

export class AiService {
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

  private static async callLlm(prompt: string): Promise<string> {
    const provider = Deno.env.get('AI_PROVIDER') ?? 'mock';
    const apiKey = Deno.env.get('AI_API_KEY');
    if (provider === 'mock' || !apiKey) return this.mockResponse(prompt);

    try {
      const baseUrl = provider === 'spacexai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: provider === 'spacexai' ? 'grok-2' : 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an expert crypto perpetual futures trading analyst. Be concise, actionable, and risk-aware.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? this.mockResponse(prompt);
    } catch {
      return this.mockResponse(prompt);
    }
  }

  static async generateMarketSummary(params: {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    fundingRate: number;
  }) {
    const text = await this.callLlm(
      `market summary for ${params.symbol} at $${params.price}, 24h change ${params.change24h}%, volume $${params.volume24h}, funding ${params.fundingRate}`,
    );
    const sentiment = params.change24h > 1 ? 'bullish' : params.change24h < -1 ? 'bearish' : 'neutral';
    return { symbol: params.symbol, summary: text, sentiment };
  }

  static async assessTradeRisk(params: {
    symbol: string;
    side: string;
    leverage: number;
    size: number;
    price: number;
    change24h: number;
    balance: number;
  }) {
    const side = (params.side === 'SELL' || params.side === 'SHORT' ? 'SHORT' : 'LONG') as PositionSide;
    const marginUsed = (params.size * params.price) / params.leverage;
    return TradeRiskScorer.assess({
      side,
      leverage: params.leverage,
      size: params.size,
      entryPrice: params.price,
      change24h: params.change24h,
      accountBalance: params.balance,
      marginUsed,
    });
  }

  static async generateNewsSummary(symbols: string[]) {
    const text = await this.callLlm(`news summary for crypto perps markets: ${symbols.join(', ')}`);
    return text;
  }
}