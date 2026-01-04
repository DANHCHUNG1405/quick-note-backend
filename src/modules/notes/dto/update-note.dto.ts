import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string | null;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;
}
