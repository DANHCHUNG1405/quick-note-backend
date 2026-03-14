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

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notesService.softDelete(user.userId, id);
  }
}
