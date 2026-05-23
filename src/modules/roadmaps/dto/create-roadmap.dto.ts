import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const ROADMAP_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

export class CreateRoadmapDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  start_date: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  end_date?: string | null;

  @IsOptional()
  @IsIn(ROADMAP_STATUSES)
  status?: (typeof ROADMAP_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;
}
