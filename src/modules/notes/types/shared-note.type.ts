import { Note } from './note.type';
import { NoteSharePermission } from './note-share-permission.type';

export type SharedNote = Note & {
  permission: NoteSharePermission;
  owner_id: string;
};
