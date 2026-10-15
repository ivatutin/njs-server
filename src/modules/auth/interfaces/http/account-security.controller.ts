import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { TokenClaims } from '@shared/domain/token-claims';
import { CurrentUser } from '@shared/interfaces/http/decorators/current-user.decorator';
import { resolveClientIp } from '@shared/interfaces/http/client-ip';
import { ChangePasswordCommand } from '../../application/use-cases/change-password/change-password.command';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password/change-password.use-case';
import { SetPasswordCommand } from '../../application/use-cases/set-password/set-password.command';
import { SetPasswordUseCase } from '../../application/use-cases/set-password/set-password.use-case';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ReauthTokenGuard } from './guards/reauth-token.guard';
import { ContactChangeUnavailableError } from '../../domain/errors/contact-change-unavailable.error';
import { CancelContactChangeCommand } from '../../application/use-cases/cancel-contact-change/cancel-contact-change.command';
import { CancelContactChangeUseCase } from '../../application/use-cases/cancel-contact-change/cancel-contact-change.use-case';
import { RequestContactChangeCommand } from '../../application/use-cases/request-contact-change/request-contact-change.command';
import { RequestContactChangeUseCase } from '../../application/use-cases/request-contact-change/request-contact-change.use-case';
import { VerifyContactChangeCommand } from '../../application/use-cases/verify-contact-change/verify-contact-change.command';
import { VerifyContactChangeUseCase } from '../../application/use-cases/verify-contact-change/verify-contact-change.use-case';
import { CancelContactChangeDto } from './dto/cancel-contact-change.dto';
import { RequestContactChangeDto } from './dto/request-contact-change.dto';
import {
  RequestContactChangeResponseDto,
  toRequestContactChangeResponse,
} from './dto/request-contact-change-response.dto';
import { UserDto } from './dto/user.dto';
import { VerifyContactChangeDto } from './dto/verify-contact-change.dto';
import { AuthHttpMapper } from './mappers/auth-http.mapper';

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
    private readonly requestContactChangeUC: RequestContactChangeUseCase,
    private readonly verifyContactChangeUC: VerifyContactChangeUseCase,
    private readonly cancelContactChangeUC: CancelContactChangeUseCase,
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

  @Post('contact-change/request')
  @HttpCode(201)
  @UseGuards(ReauthTokenGuard)
  @ApiHeader({
    name: 'X-Reauth-Token',
    required: true,
    description: 'Одноразовый токен из POST /auth/reauth — смена контакта защищённой операции',
  })
  @ApiOperation({
    summary: 'Request own contact change',
    description:
      'Starts the email/phone change: sends a code to the new contact and (when required) to the old one. ' +
      'A repeated request while a change is active answers 422 ContactChangeAlreadyPending — the front ends ' +
      'that flow with POST /users/me/contact-change/cancel and starts over.',
  })
  @ApiResponse({ status: 201, type: RequestContactChangeResponseDto })
  @ApiResponse({ status: 404, description: 'UserNotFound' })
  @ApiResponse({ status: 409, description: 'ContactAlreadyExists' })
  @ApiResponse({
    status: 422,
    description: 'ContactChangeAlreadyPending | OtpRateLimited | InvalidContacts | OtpRateLimited',
  })
  async requestContactChange(
    @CurrentUser() user: TokenClaims,
    @Body() dto: RequestContactChangeDto,
    @Req() request: Request,
  ): Promise<RequestContactChangeResponseDto> {
    const result = await this.requestContactChangeUC.execute(
      new RequestContactChangeCommand(user.sub, dto.channel, dto.newValue, resolveClientIp(request)),
    );
    return toRequestContactChangeResponse(result);
  }

  @Post('contact-change/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify own contact change',
    description:
      'Verifies the codes and applies the change: access is revoked first (ADR-0018), then the shadow DB ' +
      'and Keycloak are updated. 200 means the change is applied (the client must sign in again); ' +
      '409 means the contact was taken meanwhile; 503 means nothing was applied and a retry is allowed ' +
      '(see the Retry-After header).',
  })
  @ApiResponse({ status: 200, type: UserDto })
  @ApiResponse({ status: 401, description: 'InvalidToken' })
  @ApiResponse({ status: 409, description: 'ContactAlreadyExists' })
  @ApiResponse({
    status: 422,
    description: 'ChangeTokenExpired | OtpInvalid | OtpExpired | OtpTooManyAttempts',
  })
  @ApiResponse({
    status: 503,
    description: 'Keycloak/инфраструктура недоступна — ничего не применено, повтор разрешён',
    headers: {
      'Retry-After': {
        description: 'Сколько секунд подождать перед повтором',
        schema: { type: 'integer' },
      },
    },
  })
  async verifyContactChange(
    @CurrentUser() user: TokenClaims,
    @Body() dto: VerifyContactChangeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    try {
      const result = await this.verifyContactChangeUC.execute(
        new VerifyContactChangeCommand(user.sub, dto.changeToken, dto.newCode, dto.oldCode ?? null),
      );
      return AuthHttpMapper.toUserDto(result.user);
    } catch (err) {
      // B2-1: 503 означает «ничего не применено, повтор разрешён» — говорим клиенту, сколько ждать.
      if (err instanceof ContactChangeUnavailableError) {
        res.header('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }

  @Post('contact-change/cancel')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cancel own contact change',
    description:
      'Frees the active change (ADR-0017 §5) — the front uses it to re-issue codes: ' +
      'cancel, then POST /users/me/contact-change/request again.',
  })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 422, description: 'ChangeTokenExpired' })
  async cancelContactChange(
    @CurrentUser() user: TokenClaims,
    @Body() dto: CancelContactChangeDto,
  ): Promise<void> {
    await this.cancelContactChangeUC.execute(
      new CancelContactChangeCommand(user.sub, dto.changeToken),
    );
  }
}
