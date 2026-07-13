import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthPayload } from '../middleware/auth.js';

interface ClientConnection {
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
}

export class WsHub {
  private wss: WebSocketServer;
  private clients = new Set<ClientConnection>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const conn: ClientConnection = { ws, subscriptions: new Set() };
      this.clients.add(conn);

      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (token) {
        try {
          const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
          conn.userId = payload.userId;
        } catch {
          /* unauthenticated connection allowed for public data */
        }
      }

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(conn, msg);
        } catch {
          /* ignore */
        }
      });

      ws.on('close', () => {
        this.clients.delete(conn);
      });

      ws.send(JSON.stringify({ type: 'connected', data: { authenticated: !!conn.userId } }));
    });
  }

  private handleMessage(conn: ClientConnection, msg: { type: string; channel?: string }) {
    if (msg.type === 'subscribe' && msg.channel) {
      conn.subscriptions.add(msg.channel);
      conn.ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
    }
    if (msg.type === 'unsubscribe' && msg.channel) {
      conn.subscriptions.delete(msg.channel);
    }
    if (msg.type === 'ping') {
      conn.ws.send(JSON.stringify({ type: 'pong' }));
    }
  }

  broadcast(channel: string, data: unknown) {
    const message = JSON.stringify({ type: channel, data, timestamp: Date.now() });
    for (const conn of this.clients) {
      if (conn.subscriptions.has(channel) || conn.subscriptions.has('*')) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(message);
        }
      }
    }
  }

  broadcastAll(data: unknown) {
    const message = JSON.stringify(data);
    for (const conn of this.clients) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }

  sendToUser(userId: string, data: unknown) {
    const message = JSON.stringify(data);
    for (const conn of this.clients) {
      if (conn.userId === userId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }
}