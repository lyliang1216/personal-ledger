import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'

import type { AuthenticatedUser } from '../auth/auth.types'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreateLedgerDto } from './dto/create-ledger.dto'
import { UpdateLedgerDto } from './dto/update-ledger.dto'
import { LedgersService } from './ledgers.service'

@Controller('ledgers')
@UseGuards(JwtAuthGuard)
export class LedgersController {
  constructor(private readonly ledgersService: LedgersService) {}

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.ledgersService.findAll(currentUser.userId)
  }

  @Post()
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateLedgerDto) {
    return this.ledgersService.create(currentUser.userId, dto)
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLedgerDto,
  ) {
    return this.ledgersService.update(currentUser.userId, id, dto)
  }

  @Patch(':id/default')
  setDefault(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ledgersService.setDefault(currentUser.userId, id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.ledgersService.remove(currentUser.userId, id)
  }
}
