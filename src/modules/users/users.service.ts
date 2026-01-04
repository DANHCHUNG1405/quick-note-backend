import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /users/me
   */
  async getMe(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * PATCH /users/me
   */
  async updateMe(userId: string, data: { username?: string }) {
    return this.prisma.users.update({
      where: { id: userId },
      data: {
        username: data.username,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });
  }
}
