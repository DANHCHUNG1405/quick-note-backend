import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Note } from './types/note.type';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CREATE NOTE
   */
  async create(userId: string, dto: CreateNoteDto): Promise<Note> {
    const topic = await this.prisma.topics.findFirst({
      where: {
        id: dto.topic_id,
        user_id: userId,
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!topic) {
      throw new BadRequestException('Topic not found');
    }

    return this.prisma.notes.create({
      data: {
        topic_id: dto.topic_id,
        title: dto.title,
        content: dto.content ?? null,
        is_pinned: dto.is_pinned ?? false,
      },
    });
  }

  /**
   * GET NOTES BY TOPIC (INCLUDE SUBTREE)
   */
  async getByTopic(userId: string, topicId: string): Promise<Note[]> {
    const topicIds = await this.collectTopicIds(userId, topicId);

    return this.prisma.notes.findMany({
      where: {
        topic_id: { in: topicIds },
        deleted_at: null,
        topics: {
          user_id: userId,
        },
      },
      orderBy: [{ is_pinned: 'desc' }, { updated_at: 'desc' }],
    });
  }

  /**
   * GET NOTE BY ID
   */
  async getById(userId: string, noteId: string): Promise<Note> {
    const note = await this.prisma.notes.findFirst({
      where: {
        id: noteId,
        deleted_at: null,
        topics: {
          user_id: userId,
        },
      },
    });

    if (!note) {
      throw new BadRequestException('Note not found');
    }

    return note;
  }

  /**
   * UPDATE NOTE
   */
  async update(
    userId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<Note> {
    const note = await this.prisma.notes.findFirst({
      where: {
        id: noteId,
        deleted_at: null,
        topics: {
          user_id: userId,
        },
      },
      select: { id: true },
    });

    if (!note) {
      throw new BadRequestException('Note not found');
    }

    return this.prisma.notes.update({
      where: { id: noteId },
      data: {
        title: dto.title,
        content: dto.content,
        is_pinned: dto.is_pinned,
      },
    });
  }

  /**
   * SOFT DELETE NOTE
   */
  async softDelete(userId: string, noteId: string) {
    return this.prisma.notes.updateMany({
      where: {
        id: noteId,
        deleted_at: null,
        topics: {
          user_id: userId,
        },
      },
      data: {
        deleted_at: new Date(),
      },
    });
  }

  /**
   * ===== HELPER =====
   * Collect topic + all children ids
   */
  private async collectTopicIds(
    userId: string,
    rootTopicId: string,
  ): Promise<string[]> {
    const topics = await this.prisma.topics.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      select: {
        id: true,
        parent_id: true,
      },
    });

    const map = new Map<string, string[]>();
    for (const t of topics) {
      if (t.parent_id) {
        if (!map.has(t.parent_id)) {
          map.set(t.parent_id, []);
        }
        map.get(t.parent_id)!.push(t.id);
      }
    }

    const result: string[] = [];
    const stack: string[] = [rootTopicId];

    while (stack.length) {
      const current = stack.pop()!;
      result.push(current);
      stack.push(...(map.get(current) ?? []));
    }

    return result;
  }
}
