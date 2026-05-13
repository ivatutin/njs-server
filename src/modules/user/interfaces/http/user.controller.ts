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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserContactsDto } from './dto/update-user-contacts.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserHttpMapper } from './mappers/user-http.mapper';

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

@ApiTags('Users')
@ApiBearerAuth('bearer')
@Controller('users')
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
  @ApiOperation({
    summary: 'Create user',
    description: 'Creates a new user in pending_verification status.',
  })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email or phone already exists' })
  @ApiResponse({ status: 422, description: 'Domain invariant violated' })
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
  @ApiOperation({ summary: 'Get user by id' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.getUserById.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update first/last name' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
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
  @ApiOperation({
    summary: 'Update email/phone',
    description:
      'Only allowed for non-verified contacts. To change a verified contact, use the change request flow (not yet implemented).',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email or phone already exists' })
  @ApiResponse({ status: 422, description: 'Cannot change verified contact directly' })
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
  @ApiOperation({
    summary: 'Verify user email',
    description:
      'Accepts a code in body but does not validate it yet — verification flow is a placeholder for the future Verification bounded context.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
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
  @ApiOperation({ summary: 'Verify user phone' })
  @ApiResponse({ status: 200, type: UserResponseDto })
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
  @ApiOperation({ summary: 'Suspend user', description: 'Only active users can be suspended.' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 422, description: 'Cannot suspend a non-active user' })
  async suspend(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.suspendUser.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Activate user',
    description: 'Requires at least one verified contact.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 422, description: 'No verified contact' })
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.activateUser.execute(id);
    return UserHttpMapper.toResponse(user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteUser.execute(id);
  }
}
