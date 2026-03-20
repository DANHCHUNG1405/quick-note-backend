import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  fullname?: string;

  @IsString()
  @MinLength(6)
  password: string;
}
