import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTopicDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
