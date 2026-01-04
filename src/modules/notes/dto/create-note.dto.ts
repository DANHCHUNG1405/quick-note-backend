import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';

export class CreateNoteDto {
  @IsUUID()
  topic_id: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;
}
