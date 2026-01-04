import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserData } from '../auth/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserData) {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user.userId, dto);
  }
}
