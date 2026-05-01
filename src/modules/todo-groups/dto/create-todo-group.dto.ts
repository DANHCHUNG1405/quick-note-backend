import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const TODO_GROUP_TYPES = ['CUSTOM', 'NOTE', 'DAILY', 'TOPIC'] as const;

export class CreateTodoGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(TODO_GROUP_TYPES)
  group_type?: (typeof TODO_GROUP_TYPES)[number];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  group_date?: string | null;

  @IsOptional()
  @IsUUID()
  topic_id?: string | null;

  @IsOptional()
  @IsUUID()
  note_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;
}
