import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { TODO_PRIORITIES, TODO_STATUSES } from './create-todo.dto';

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(TODO_STATUSES)
  status?: (typeof TODO_STATUSES)[number];

  @IsOptional()
  @IsIn(TODO_PRIORITIES)
  priority?: (typeof TODO_PRIORITIES)[number];

  @IsOptional()
  @IsUUID()
  group_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number | null;
}
