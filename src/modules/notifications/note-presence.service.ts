import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NoteViewerSocketPayload } from './notifications.types';

type PresenceUser = NoteViewerSocketPayload;

type NotePresenceEntry = {
  user: PresenceUser;
  socketIds: Set<string>;
};

type JoinNoteResult = {
  joined: boolean;
  affectedNoteIds: string[];
};

@Injectable()
export class NotePresenceService {
  private readonly noteUsers = new Map<string, Map<string, NotePresenceEntry>>();
  private readonly socketNotes = new Map<string, Set<string>>();

  constructor(private readonly prisma: PrismaService) {}

  async canViewNote(userId: string, noteId: string): Promise<boolean> {
    const note = await this.prisma.notes.findFirst({
      where: {
        id: noteId,
        deleted_at: null,
        OR: [
          {
            topics: {
              user_id: userId,
            },
          },
          {
            note_shares: {
              some: {
                user_id: userId,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    return Boolean(note);
  }

  async joinNote(
    socketId: string,
    userId: string,
    noteId: string,
  ): Promise<JoinNoteResult> {
    const user = await this.getPresenceUser(userId);
    if (!user) {
      return { joined: false, affectedNoteIds: [] };
    }

    const affectedNoteIds = this.leaveOtherNotes(socketId, noteId);
    const notePresence = this.getOrCreateNotePresence(noteId);
    const entry = notePresence.get(userId);

    if (entry) {
      entry.user = user;
      entry.socketIds.add(socketId);
    } else {
      notePresence.set(userId, {
        user,
        socketIds: new Set([socketId]),
      });
    }

    this.getOrCreateSocketNotes(socketId).add(noteId);

    return {
      joined: true,
      affectedNoteIds: this.uniqueNoteIds([...affectedNoteIds, noteId]),
    };
  }

  leaveNote(socketId: string, userId: string, noteId: string): boolean {
    const removed = this.removeSocketFromNote(socketId, userId, noteId);
    const notes = this.socketNotes.get(socketId);
    notes?.delete(noteId);

    if (notes && notes.size === 0) {
      this.socketNotes.delete(socketId);
    }

    return removed;
  }

  leaveAll(socketId: string, userId: string): string[] {
    const noteIds = [...(this.socketNotes.get(socketId) ?? [])];
    const affectedNoteIds: string[] = [];

    for (const noteId of noteIds) {
      if (this.removeSocketFromNote(socketId, userId, noteId)) {
        affectedNoteIds.push(noteId);
      }
    }

    this.socketNotes.delete(socketId);
    return this.uniqueNoteIds(affectedNoteIds);
  }

  getViewers(noteId: string): NoteViewerSocketPayload[] {
    return [...(this.noteUsers.get(noteId)?.values() ?? [])].map(
      (entry) => entry.user,
    );
  }

  private leaveOtherNotes(socketId: string, keepNoteId: string): string[] {
    const currentNoteIds = [...(this.socketNotes.get(socketId) ?? [])];
    const affectedNoteIds: string[] = [];

    for (const noteId of currentNoteIds) {
      if (noteId === keepNoteId) {
        continue;
      }

      const removed = this.removeSocketFromNoteWithoutUser(socketId, noteId);
      this.socketNotes.get(socketId)?.delete(noteId);

      if (removed) {
        affectedNoteIds.push(noteId);
      }
    }

    return affectedNoteIds;
  }

  private removeSocketFromNote(
    socketId: string,
    userId: string,
    noteId: string,
  ): boolean {
    const notePresence = this.noteUsers.get(noteId);
    const entry = notePresence?.get(userId);

    if (!notePresence || !entry) {
      return false;
    }

    entry.socketIds.delete(socketId);

    if (entry.socketIds.size === 0) {
      notePresence.delete(userId);
    }

    if (notePresence.size === 0) {
      this.noteUsers.delete(noteId);
    }

    return true;
  }

  private removeSocketFromNoteWithoutUser(
    socketId: string,
    noteId: string,
  ): boolean {
    const notePresence = this.noteUsers.get(noteId);
    if (!notePresence) {
      return false;
    }

    for (const [userId, entry] of notePresence.entries()) {
      if (!entry.socketIds.has(socketId)) {
        continue;
      }

      entry.socketIds.delete(socketId);

      if (entry.socketIds.size === 0) {
        notePresence.delete(userId);
      }

      if (notePresence.size === 0) {
        this.noteUsers.delete(noteId);
      }

      return true;
    }

    return false;
  }

  private getOrCreateNotePresence(noteId: string) {
    let notePresence = this.noteUsers.get(noteId);

    if (!notePresence) {
      notePresence = new Map<string, NotePresenceEntry>();
      this.noteUsers.set(noteId, notePresence);
    }

    return notePresence;
  }

  private getOrCreateSocketNotes(socketId: string) {
    let notes = this.socketNotes.get(socketId);

    if (!notes) {
      notes = new Set<string>();
      this.socketNotes.set(socketId, notes);
    }

    return notes;
  }

  private async getPresenceUser(userId: string): Promise<PresenceUser | null> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullname: true,
        avatar: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.fullname?.trim() || user.email,
      avatarUrl: user.avatar ?? undefined,
      color: this.colorForUser(user.id),
    };
  }

  private colorForUser(userId: string): string {
    const palette = [
      '#2563eb',
      '#16a34a',
      '#dc2626',
      '#9333ea',
      '#0891b2',
      '#ca8a04',
      '#db2777',
      '#4f46e5',
    ];
    let hash = 0;

    for (const char of userId) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return palette[hash % palette.length];
  }

  private uniqueNoteIds(noteIds: string[]): string[] {
    return [...new Set(noteIds)];
  }
}
