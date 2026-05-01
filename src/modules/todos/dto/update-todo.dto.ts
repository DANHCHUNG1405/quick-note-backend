import {
  ValidateIf,
  IsDateString,
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
  @IsDateString()
  due_at?: string | null;

  @IsOptional()
  @IsUUID()
  topic_id?: string | null;

  @IsOptional()
  @IsUUID()
  note_id?: string | null;

  @IsOptional()
  @IsUUID()
  group_id?: string | null;

  @ValidateIf((o: UpdateTodoDto) => o.group_id === undefined)
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number | null;
}
