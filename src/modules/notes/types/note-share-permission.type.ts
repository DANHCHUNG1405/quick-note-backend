export const NOTE_SHARE_PERMISSIONS = ['view', 'edit'] as const;

export type NoteSharePermission = (typeof NOTE_SHARE_PERMISSIONS)[number];
