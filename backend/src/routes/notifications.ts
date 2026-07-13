import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { NotificationService } from '../services/notification.js';
import { AchievementService } from '../services/achievement.js';

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware);

notificationsRouter.get('/', async (req, res) => {
  const notifications = await NotificationService.getUnread(req.user!.userId);
  res.json(notifications);
});

notificationsRouter.post('/read', async (req, res) => {
  const { ids } = req.body;
  await NotificationService.markRead(req.user!.userId, ids);
  res.json({ success: true });
});

notificationsRouter.get('/achievements', async (req, res) => {
  const achievements = await AchievementService.getUserAchievements(req.user!.userId);
  res.json(achievements);
});