import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseFilters,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserContactsDto } from './dto/update-user-contacts.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserHttpMapper } from './mappers/user-http.mapper';
import { UserExceptionFilter } from './filters/user-exception.filter';

import { CreateUserUseCase } from '../../application/use-cases/create-user/create-user.use-case';
import { CreateUserCommand } from '../../application/use-cases/create-user/create-user.command';
import { GetUserByIdUseCase } from '../../application/use-cases/get-user-by-id/get-user-by-id.use-case';
import { UpdateUserProfileUseCase } from '../../application/use-cases/update-user-profile/update-user-profile.use-case';
import { UpdateUserProfileCommand } from '../../application/use-cases/update-user-profile/update-user-profile.command';
import { UpdateUserContactsUseCase } from '../../application/use-cases/update-user-contacts/update-user-contacts.use-case';
import { UpdateUserContactsCommand } from '../../application/use-cases/update-user-contacts/update-user-contacts.command';
import { VerifyUserEmailUseCase } from '../../application/use-cases/verify-user-email/verify-user-email.use-case';
import { VerifyUserPhoneUseCase } from '../../application/use-cases/verify-user-phone/verify-user-phone.use-case';
import { SuspendUserUseCase } from '../../application/use-cases/suspend-user/suspend-user.use-case';
import { ActivateUserUseCase } from '../../application/use-cases/activate-user/activate-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user/delete-user.use-case';

@Controller('users')
@UseFilters(UserExceptionFilter)
export class UserController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUserById: GetUserByIdUseCase,
    private readonly updateUserProfile: UpdateUserProfileUseCase,
    private readonly updateUserContacts: UpdateUserContactsUseCase,
    private readonly verifyUserEmail: VerifyUserEmailUseCase,
    private readonly verifyUserPhone: VerifyUserPhoneUseCase,
    private readonly suspendUser: SuspendUserUseCase,
    private readonly activateUser: ActivateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.createUser.execute(
      new CreateUserCommand(
        dto.keycloakId,
        dto.email ?? null,
        dto.phone ?? null,
        dto.firstName ?? null,
        dto.lastName ?? null,
        dto.roles ?? [],
        dto.metadata ?? null,
      ),
    );
    return UserHttpMapper.toResponse(user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.getUserById.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Patch(':id/profile')
  async updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.updateUserProfile.execute(
      new UpdateUserProfileCommand(id, dto.firstName, dto.lastName),
    );
    return UserHttpMapper.toResponse(user);
  }

  @Patch(':id/contacts')
  async updateContacts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserContactsDto,
  ): Promise<UserResponseDto> {
    const user = await this.updateUserContacts.execute(
      new UpdateUserContactsCommand(id, dto.email, dto.phone),
    );
    return UserHttpMapper.toResponse(user);
  }

  @Post(':id/email/verify')
  @HttpCode(200)
  async verifyEmail(
    @Param('id', ParseUUIDPipe) id: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body() _dto: VerifyCodeDto,
  ): Promise<UserResponseDto> {
    const user = await this.verifyUserEmail.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Post(':id/phone/verify')
  @HttpCode(200)
  async verifyPhone(
    @Param('id', ParseUUIDPipe) id: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body() _dto: VerifyCodeDto,
  ): Promise<UserResponseDto> {
    const user = await this.verifyUserPhone.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  async suspend(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.suspendUser.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.activateUser.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteUser.execute(id);
  }
}
