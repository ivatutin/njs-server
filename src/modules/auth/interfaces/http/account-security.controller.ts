import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TokenClaims } from '@shared/domain/token-claims';
import { CurrentUser } from '@shared/interfaces/http/decorators/current-user.decorator';
import { ChangePasswordCommand } from '../../application/use-cases/change-password/change-password.command';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password/change-password.use-case';
import { SetPasswordCommand } from '../../application/use-cases/set-password/set-password.command';
import { SetPasswordUseCase } from '../../application/use-cases/set-password/set-password.use-case';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ReauthTokenGuard } from './guards/reauth-token.guard';

/**
 * Self-service операции над **своим** аккаунтом (Phase 4).
 *
 * Живут в auth-контексте, потому что работают с Keycloak-паролем и одноразовыми
 * токенами (`verificationToken`, `X-Reauth-Token`), а путь `/users/me/...` задан
 * контрактом. Пользователь всегда берётся из access-токена, поэтому RBAC здесь
 * не нужен, а `:id` в путях не участвует — подменить аккаунт нечем.
 */
@ApiTags('Account security')
@ApiBearerAuth()
@Controller('users/me')
export class AccountSecurityController {
  constructor(
    private readonly setPasswordUC: SetPasswordUseCase,
    private readonly changePasswordUC: ChangePasswordUseCase,
  ) {}

  @Post('set-password')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Set own password',
    description:
      'For passwordless users (phone sign-up): sets the Keycloak password after the contact is confirmed. ' +
      'The verificationToken must have purpose=set-password and belong to the caller’s own contact.',
  })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 401, description: 'InvalidToken' })
  @ApiResponse({
    status: 422,
    description: 'VerificationTokenInvalid | VerificationTokenExpired | PasswordPolicyViolation',
  })
  async setPassword(@CurrentUser() user: TokenClaims, @Body() dto: SetPasswordDto): Promise<void> {
    await this.setPasswordUC.execute(
      new SetPasswordCommand(user.sub, dto.verificationToken, dto.newPassword),
    );
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(ReauthTokenGuard)
  @ApiHeader({
    name: 'X-Reauth-Token',
    required: true,
    description: 'Одноразовый токен из POST /auth/reauth (живёт ~5 минут, расходуется здесь)',
  })
  @ApiOperation({
    summary: 'Change own password',
    description:
      'Requires a fresh reauth token (X-Reauth-Token) for the same user: password change is a sensitive operation. ' +
      'Passwordless users (phone sign-up) use POST /users/me/set-password instead — they have nothing to re-enter.',
  })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 401, description: 'InvalidToken | ReauthTokenInvalid' })
  @ApiResponse({
    status: 422,
    description: 'ReauthTokenExpired | PasswordPolicyViolation',
  })
  async changePassword(
    @CurrentUser() user: TokenClaims,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.changePasswordUC.execute(new ChangePasswordCommand(user.sub, dto.newPassword));
  }
}
