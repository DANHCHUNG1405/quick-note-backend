import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserData } from '../auth/current-user.decorator';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { ShareNoteDto } from './dto/share-note.dto';
import { UpdateShareDto } from './dto/update-share.dto';

@UseGuards(JwtAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateNoteDto) {
    return this.notesService.create(user.userId, dto);
  }

  @Get('topic/:topicId')
  getByTopic(
    @CurrentUser() user: CurrentUserData,
    @Param('topicId') topicId: string,
  ) {
    return this.notesService.getByTopic(user.userId, topicId);
  }

  @Get('recent')
  getRecent(@CurrentUser() user: CurrentUserData) {
    return this.notesService.getRecentViewed(user.userId, 5);
  }

  @Get('shared')
  getShared(@CurrentUser() user: CurrentUserData) {
    return this.notesService.getSharedWithMe(user.userId);
  }

  @Get(':id')
  getById(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notesService.getById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.update(user.userId, id, dto);
  }

  @Patch(':id/pin')
  pin(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notesService.setPinned(user.userId, id, true);
  }

  @Patch(':id/unpin')
  unpin(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notesService.setPinned(user.userId, id, false);
  }

  @Get(':id/shares')
  listShares(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notesService.listShares(user.userId, id);
  }

  @Post(':id/share')
  share(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: ShareNoteDto,
  ) {
    return this.notesService.shareNote(user.userId, id, dto);
  }

  @Patch(':id/share/:shareUserId')
  updateShare(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Param('shareUserId') shareUserId: string,
    @Body() dto: UpdateShareDto,
  ) {
    return this.notesService.updateSharePermission(
      user.userId,
      id,
      shareUserId,
      dto,
    );
  }

  @Delete(':id/share/:shareUserId')
  removeShare(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Param('shareUserId') shareUserId: string,
  ) {
    return this.notesService.removeShare(user.userId, id, shareUserId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notesService.softDelete(user.userId, id);
  }
}
