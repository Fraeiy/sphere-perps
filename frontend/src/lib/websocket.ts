type MessageHandler = (data: unknown) => void;

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.DEV) return `ws://${window.location.hostname}:4000/ws`;
  const api = import.meta.env.VITE_API_URL;
  if (api) return api.replace(/^http/, 'ws') + '/ws';
  return `ws://${window.location.hostname}:4000/ws`;
}

const WS_URL = getWsUrl();

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;

  connect(token?: string) {
    this.token = token ?? null;
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.subscribe('ticker');
      this.subscribe('*');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type as string;
        this.handlers.get(type)?.forEach((h) => h(msg.data ?? msg));
        this.handlers.get('*')?.forEach((h) => h(msg));
      } catch {
        /* ignore */
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.token ?? undefined);
    }, 3000);
  }

  subscribe(channel: string) {
    this.ws?.send(JSON.stringify({ type: 'subscribe', channel }));
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
  }

  on(channel: string, handler: MessageHandler) {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);
    return () => this.handlers.get(channel)?.delete(handler);
  }

  disconnect() {
    this.ws?.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }
}

export const wsClient = new WebSocketClient();