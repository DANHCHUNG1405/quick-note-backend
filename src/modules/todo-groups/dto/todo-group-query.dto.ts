import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TODO_GROUP_TYPES } from './create-todo-group.dto';

export class TodoGroupQueryDto {
  @IsOptional()
  @IsIn(TODO_GROUP_TYPES)
  groupType?: (typeof TODO_GROUP_TYPES)[number];

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsUUID()
  noteId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  groupDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
