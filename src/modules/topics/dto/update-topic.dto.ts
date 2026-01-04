import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string | null;
}
