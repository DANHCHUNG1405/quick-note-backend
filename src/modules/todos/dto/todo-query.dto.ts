import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { TODO_PRIORITIES, TODO_STATUSES } from './create-todo.dto';

const TODO_DUE_FILTERS = ['today', 'upcoming', 'overdue'] as const;

export class TodoQueryDto {
  @IsOptional()
  @IsIn(TODO_STATUSES)
  status?: (typeof TODO_STATUSES)[number];

  @IsOptional()
  @IsIn(TODO_PRIORITIES)
  priority?: (typeof TODO_PRIORITIES)[number];

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsUUID()
  noteId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsIn(TODO_DUE_FILTERS)
  due?: (typeof TODO_DUE_FILTERS)[number];

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
