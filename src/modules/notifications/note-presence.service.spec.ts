import { NotePresenceService } from './note-presence.service';

describe('NotePresenceService', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    fullname: 'Quick User',
    avatar: 'https://example.com/avatar.png',
  };

  const createService = () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
      notes: {
        findFirst: jest.fn().mockResolvedValue({ id: 'note-1' }),
      },
    };

    return {
      service: new NotePresenceService(prisma as never),
      prisma,
    };
  };

  it('shows a user once when multiple sockets view the same note', async () => {
    const { service } = createService();

    await service.joinNote('socket-1', user.id, 'note-1');
    await service.joinNote('socket-2', user.id, 'note-1');

    expect(service.getViewers('note-1')).toHaveLength(1);
    expect(service.getViewers('note-1')[0]).toMatchObject({
      id: user.id,
      name: user.fullname,
      avatarUrl: user.avatar,
    });
  });

  it('keeps a user present until their last socket leaves the note', async () => {
    const { service } = createService();

    await service.joinNote('socket-1', user.id, 'note-1');
    await service.joinNote('socket-2', user.id, 'note-1');

    service.leaveNote('socket-1', user.id, 'note-1');
    expect(service.getViewers('note-1')).toHaveLength(1);

    service.leaveNote('socket-2', user.id, 'note-1');
    expect(service.getViewers('note-1')).toEqual([]);
  });

  it('removes the socket from previous notes when it joins another note', async () => {
    const { service } = createService();

    await service.joinNote('socket-1', user.id, 'note-1');
    const result = await service.joinNote('socket-1', user.id, 'note-2');

    expect(result.affectedNoteIds).toEqual(['note-1', 'note-2']);
    expect(service.getViewers('note-1')).toEqual([]);
    expect(service.getViewers('note-2')).toHaveLength(1);
  });

  it('removes a disconnected socket from all notes it was tracking', async () => {
    const { service } = createService();

    await service.joinNote('socket-1', user.id, 'note-1');

    expect(service.leaveAll('socket-1', user.id)).toEqual(['note-1']);
    expect(service.getViewers('note-1')).toEqual([]);
  });

  it('checks view access through note ownership or shares', async () => {
    const { service, prisma } = createService();

    await expect(service.canViewNote(user.id, 'note-1')).resolves.toBe(true);
    expect(prisma.notes.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'note-1',
        deleted_at: null,
        OR: [
          {
            topics: {
              user_id: user.id,
            },
          },
          {
            note_shares: {
              some: {
                user_id: user.id,
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });
});
