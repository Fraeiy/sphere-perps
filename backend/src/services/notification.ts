import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { WsHub } from '../websocket/hub.js';

let wsHub: WsHub | null = null;

export class NotificationService {
  static setWsHub(hub: WsHub) {
    wsHub = hub;
  }

  static async notify(
    userId: string,
    params: {
      type: NotificationType;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    },
  ) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data ? (params.data as Prisma.InputJsonValue) : undefined,
      },
    });

    wsHub?.sendToUser(userId, {
      type: 'notification',
      data: notification,
    });

    return notification;
  }

  static async getUnread(userId: string) {
    return prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  static async markRead(userId: string, ids: string[]) {
    return prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { isRead: true },
    });
  }
}