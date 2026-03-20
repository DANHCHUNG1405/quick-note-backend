import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Note } from './types/note.type';
import { ShareNoteDto } from './dto/share-note.dto';
import { UpdateShareDto } from './dto/update-share.dto';
import {
  type NoteSharePermission,
  NOTE_SHARE_PERMISSIONS,
} from './types/note-share-permission.type';
import { SharedNote } from './types/shared-note.type';

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
    await this.assertNoteAccess(userId, noteId);

    return this.prisma.notes.update({
      where: { id: noteId },
      data: { last_viewed_at: new Date() },
    });
  }

  /**
   * GET RECENTLY VIEWED NOTES
   */
  async getRecentViewed(userId: string, limit = 5): Promise<Note[]> {
    return this.prisma.notes.findMany({
      where: {
        deleted_at: null,
        last_viewed_at: { not: null },
        topics: {
          user_id: userId,
        },
      },
      orderBy: {
        last_viewed_at: 'desc',
      },
      take: limit,
    });
  }

  /**
   * UPDATE NOTE
   */
  async update(
    userId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<Note> {
    const access = await this.getNoteAccess(userId, noteId);

    if (!access.isOwner && access.permission !== 'edit') {
      throw new BadRequestException('Permission denied');
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
   * PIN / UNPIN NOTE
   */
  async setPinned(
    userId: string,
    noteId: string,
    isPinned: boolean,
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
        is_pinned: isPinned,
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
   * SHARE NOTE (VIEW / EDIT)
   */
  async shareNote(userId: string, noteId: string, dto: ShareNoteDto) {
    await this.assertNoteOwner(userId, noteId);

    const shareUser = await this.resolveShareUser(dto);
    if (!shareUser) {
      throw new BadRequestException('User not found');
    }

    if (shareUser.id === userId) {
      throw new BadRequestException('Cannot share note with yourself');
    }

    return this.prisma.note_shares.upsert({
      where: {
        note_id_user_id: {
          note_id: noteId,
          user_id: shareUser.id,
        },
      },
      update: {
        permission: dto.permission,
      },
      create: {
        note_id: noteId,
        user_id: shareUser.id,
        permission: dto.permission,
      },
    });
  }

  /**
   * UPDATE SHARE PERMISSION
   */
  async updateSharePermission(
    userId: string,
    noteId: string,
    shareUserId: string,
    dto: UpdateShareDto,
  ) {
    await this.assertNoteOwner(userId, noteId);

    return this.prisma.note_shares.updateMany({
      where: {
        note_id: noteId,
        user_id: shareUserId,
      },
      data: {
        permission: dto.permission,
      },
    });
  }

  /**
   * REMOVE SHARE
   */
  async removeShare(userId: string, noteId: string, shareUserId: string) {
    await this.assertNoteOwner(userId, noteId);

    return this.prisma.note_shares.deleteMany({
      where: {
        note_id: noteId,
        user_id: shareUserId,
      },
    });
  }

  /**
   * LIST SHARES OF A NOTE
   */
  async listShares(userId: string, noteId: string) {
    await this.assertNoteOwner(userId, noteId);

    return this.prisma.note_shares.findMany({
      where: {
        note_id: noteId,
      },
      select: {
        user_id: true,
        permission: true,
        created_at: true,
        users: {
          select: {
            email: true,
            fullname: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * LIST NOTES SHARED WITH CURRENT USER
   */
  async getSharedWithMe(userId: string): Promise<SharedNote[]> {
    const shares = await this.prisma.note_shares.findMany({
      where: {
        user_id: userId,
        notes: {
          deleted_at: null,
        },
      },
      select: {
        permission: true,
        notes: {
          include: {
            topics: {
              select: { user_id: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return shares.map((share) => ({
      ...this.stripNoteRelations(share.notes),
      permission: this.normalizePermission(share.permission),
      owner_id: share.notes.topics.user_id,
    }));
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

  private async assertNoteOwner(userId: string, noteId: string) {
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
  }

  private async getNoteAccess(userId: string, noteId: string) {
    const note = await this.prisma.notes.findFirst({
      where: {
        id: noteId,
        deleted_at: null,
      },
      include: {
        topics: { select: { user_id: true } },
        note_shares: {
          where: { user_id: userId },
          select: { permission: true },
          take: 1,
        },
      },
    });

    if (!note) {
      throw new BadRequestException('Note not found');
    }

    const isOwner = note.topics.user_id === userId;
    const permission = note.note_shares[0]?.permission ?? null;

    if (!isOwner && !permission) {
      throw new BadRequestException('Note not found');
    }

    return {
      isOwner,
      permission: permission
        ? this.normalizePermission(permission)
        : (null as NoteSharePermission | null),
    };
  }

  private async assertNoteAccess(userId: string, noteId: string) {
    await this.getNoteAccess(userId, noteId);
  }

  private async resolveShareUser(dto: ShareNoteDto) {
    if (dto.user_id) {
      return this.prisma.users.findUnique({
        where: { id: dto.user_id },
        select: { id: true },
      });
    }

    if (dto.email) {
      return this.prisma.users.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
    }

    return null;
  }

  private normalizePermission(permission: string): NoteSharePermission {
    if (NOTE_SHARE_PERMISSIONS.includes(permission as NoteSharePermission)) {
      return permission as NoteSharePermission;
    }
    return 'view';
  }

  private stripNoteRelations(note: {
    topics?: { user_id: string };
    note_shares?: unknown;
  }) {
    const { topics, note_shares, ...rest } = note as Record<string, unknown>;
    return rest as Note;
  }
}
