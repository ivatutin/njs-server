import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TokenClaims } from '@shared/domain/token-claims';
import { CurrentUser } from '@shared/interfaces/http/decorators/current-user.decorator';
import { SetPasswordCommand } from '../../application/use-cases/set-password/set-password.command';
import { SetPasswordUseCase } from '../../application/use-cases/set-password/set-password.use-case';
import { SetPasswordDto } from './dto/set-password.dto';

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
  constructor(private readonly setPasswordUC: SetPasswordUseCase) {}

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
}
