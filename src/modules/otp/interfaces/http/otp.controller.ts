import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '@shared/interfaces/http/decorators/public.decorator';
import { SendOtpCommand } from '../../application/use-cases/send-otp/send-otp.command';
import { SendOtpUseCase } from '../../application/use-cases/send-otp/send-otp.use-case';
import { VerifyOtpCommand } from '../../application/use-cases/verify-otp/verify-otp.command';
import { VerifyOtpUseCase } from '../../application/use-cases/verify-otp/verify-otp.use-case';
import { OtpChallengeResponseDto } from './dto/otp-challenge-response.dto';
import { OtpVerifiedResponseDto } from './dto/otp-verified-response.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpHttpMapper } from './mappers/otp-http.mapper';

/**
 * OTP-эндпоинты контракта Auth v1 (`/auth/otp/*`). Контроллер живёт в OTP-контексте,
 * хотя путь начинается с `auth` — это URL контракта, а не ссылка на auth-модуль.
 * Оба эндпоинта публичные: OTP выдаётся до аутентификации.
 */
@ApiTags('Auth')
@Controller('auth/otp')
export class OtpController {
  constructor(
    private readonly sendOtpUC: SendOtpUseCase,
    private readonly verifyOtpUC: VerifyOtpUseCase,
  ) {}

  @Public()
  @Post('send')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send OTP code',
    description:
      'Creates an OTP challenge for the phone number and sends the code via SMS ' +
      '(dev: logged to console). Always returns 200 for purpose=sign-in ' +
      '(anti-enumeration); returns 409 ContactAlreadyExists for purpose=sign-up on a taken number.',
  })
  @ApiResponse({ status: 200, type: OtpChallengeResponseDto })
  @ApiResponse({ status: 409, description: 'ContactAlreadyExists' })
  @ApiResponse({ status: 422, description: 'OtpRateLimited (details.retryAfter)' })
  async send(@Body() dto: SendOtpDto, @Req() request: Request): Promise<OtpChallengeResponseDto> {
    const result = await this.sendOtpUC.execute(
      new SendOtpCommand(dto.channel, dto.target, dto.purpose, resolveClientIp(request)),
    );
    return OtpHttpMapper.toChallengeResponse(result);
  }

  @Public()
  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify OTP code',
    description:
      'Checks the code: 5 wrong attempts lock the challenge. On success returns a ' +
      'single-use verificationToken (10 min) to be presented in sign-up/sign-in.',
  })
  @ApiResponse({ status: 200, type: OtpVerifiedResponseDto })
  @ApiResponse({ status: 422, description: 'OtpInvalid | OtpExpired | OtpTooManyAttempts' })
  async verify(@Body() dto: VerifyOtpDto): Promise<OtpVerifiedResponseDto> {
    const result = await this.verifyOtpUC.execute(new VerifyOtpCommand(dto.challengeId, dto.code));
    return OtpHttpMapper.toVerifiedResponse(result);
  }
}

/** IP вызывающего для per-IP лимита (учитываем X-Forwarded-For за reverse-proxy). */
function resolveClientIp(request: Request): string | null {
  const header = request.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim();
  }
  return request.ip ?? null;
}
