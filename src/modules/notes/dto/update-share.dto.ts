import { IsIn } from 'class-validator';
import {
  NOTE_SHARE_PERMISSIONS,
  type NoteSharePermission,
} from '../types/note-share-permission.type';

export class UpdateShareDto {
  @IsIn(NOTE_SHARE_PERMISSIONS)
  permission: NoteSharePermission;
}
