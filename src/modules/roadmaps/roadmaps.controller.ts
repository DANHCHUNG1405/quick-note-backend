import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserData } from '../auth/current-user.decorator';
import { CreateRoadmapDayDto } from './dto/create-roadmap-day.dto';
import { CreateRoadmapDto } from './dto/create-roadmap.dto';
import { RoadmapQueryDto } from './dto/roadmap-query.dto';
import { UpdateRoadmapDto } from './dto/update-roadmap.dto';
import { RoadmapsService } from './roadmaps.service';

@UseGuards(JwtAuthGuard)
@Controller('roadmaps')
export class RoadmapsController {
  constructor(private readonly roadmapsService: RoadmapsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData, @Query() query: RoadmapQueryDto) {
    return this.roadmapsService.list(user.userId, query);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateRoadmapDto) {
    return this.roadmapsService.create(user.userId, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roadmapsService.getById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoadmapDto,
  ) {
    return this.roadmapsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roadmapsService.softDelete(user.userId, id);
  }

  @Post(':id/days')
  addDay(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRoadmapDayDto,
  ) {
    return this.roadmapsService.addDay(user.userId, id, dto);
  }

  @Get(':id/days/:date')
  getDayTodos(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
  ) {
    return this.roadmapsService.getDayTodos(user.userId, id, date);
  }

  @Delete(':id/days/:date')
  removeDay(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
  ) {
    return this.roadmapsService.removeDay(user.userId, id, date);
  }
}
