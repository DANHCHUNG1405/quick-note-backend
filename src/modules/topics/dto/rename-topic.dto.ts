import { IsString } from 'class-validator';

export class RenameTopicDto {
  @IsString()
  title: string;
}
