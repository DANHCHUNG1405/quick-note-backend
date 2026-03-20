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
        fullname: true,
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
  async updateMe(userId: string, data: { fullname?: string }) {
    return this.prisma.users.update({
      where: { id: userId },
      data: {
        fullname: data.fullname,
      },
      select: {
        id: true,
        email: true,
        fullname: true,
      },
    });
  }
}
