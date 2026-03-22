import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserData } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.notificationsService.list(user.userId);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
