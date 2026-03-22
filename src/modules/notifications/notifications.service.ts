import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /notifications
   */
  async list(userId: string) {
    return this.prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        type: true,
        message: true,
        is_read: true,
        created_at: true,
      },
    });
  }

  /**
   * PATCH /notifications/:id/read
   */
  async markRead(userId: string, id: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { id, user_id: userId },
      data: { is_read: true },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }

    return { updated: result.count };
  }
}
