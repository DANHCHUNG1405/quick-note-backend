import { IsEmail, IsIn, IsUUID, ValidateIf } from 'class-validator';
import {
  NOTE_SHARE_PERMISSIONS,
  type NoteSharePermission,
} from '../types/note-share-permission.type';

export class ShareNoteDto {
  @ValidateIf((o: ShareNoteDto) => !o.email)
  @IsUUID()
  user_id?: string;

  @ValidateIf((o: ShareNoteDto) => !o.user_id)
  @IsEmail()
  email?: string;

  @IsIn(NOTE_SHARE_PERMISSIONS)
  permission: NoteSharePermission;
}
