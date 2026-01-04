import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import type { TopicNode } from './type/topic-node.type';
import { topics as TopicModel } from '@prisma/client';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CREATE TOPIC
   */
  async create(userId: string, dto: CreateTopicDto) {
    if (dto.parent_id) {
      const parent = await this.prisma.topics.findFirst({
        where: {
          id: dto.parent_id,
          user_id: userId,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (!parent) {
        throw new BadRequestException('Parent topic not found');
      }
    }

    return this.prisma.topics.create({
      data: {
        name: dto.title, // 🔑 map API title → DB name
        user_id: userId,
        parent_id: dto.parent_id ?? null,
      },
    });
  }

  /**
   * GET TOPIC TREE
   */
  async getTree(userId: string): Promise<TopicNode[]> {
    const topics = await this.prisma.topics.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      orderBy: { created_at: 'asc' },
    });

    return this.buildTree(topics);
  }

  /**
   * SOFT DELETE TOPIC
   */
  async softDelete(userId: string, topicId: string) {
    return this.prisma.topics.updateMany({
      where: {
        id: topicId,
        user_id: userId,
        deleted_at: null,
      },
      data: {
        deleted_at: new Date(),
      },
    });
  }

  /**
   * BUILD TREE HELPER
   */
  private buildTree(topics: TopicModel[]): TopicNode[] {
    const map = new Map<string, TopicNode>();
    const roots: TopicNode[] = [];

    // 1️⃣ Khởi tạo map
    for (const t of topics) {
      map.set(t.id, {
        id: t.id,
        name: t.name,
        parent_id: t.parent_id,
        user_id: t.user_id,
        created_at: t.created_at,
        updated_at: t.updated_at,
        deleted_at: t.deleted_at,
        children: [],
      });
    }

    // 2️⃣ Gắn con vào cha
    for (const node of map.values()) {
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
