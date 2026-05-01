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

export const TODO_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const;
export const TODO_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

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

  @ValidateIf((o: CreateTodoDto) => o.group_id === undefined)
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;
}
