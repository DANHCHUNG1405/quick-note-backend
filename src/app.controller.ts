import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { CurrentUser } from './modules/auth/current-user.decorator';
import type { CurrentUserData } from './modules/auth/current-user.decorator';
@Controller()
export class AppController {
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: CurrentUserData) {
    return user;
  }
}
