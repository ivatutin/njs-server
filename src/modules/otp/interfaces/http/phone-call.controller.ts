import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { resolveClientIp } from '@shared/interfaces/http/client-ip';
import { Public } from '@shared/interfaces/http/decorators/public.decorator';
import { GetPhoneCallStatusCommand } from '../../application/use-cases/get-phone-call-status/get-phone-call-status.command';
import { GetPhoneCallStatusUseCase } from '../../application/use-cases/get-phone-call-status/get-phone-call-status.use-case';
import { StartPhoneCallCommand } from '../../application/use-cases/start-phone-call/start-phone-call.command';
import { StartPhoneCallUseCase } from '../../application/use-cases/start-phone-call/start-phone-call.use-case';
import { PhoneCallChallengeResponseDto } from './dto/phone-call-challenge-response.dto';
import { PhoneCallStatusResponseDto } from './dto/phone-call-status-response.dto';
import { StartPhoneCallDto } from './dto/start-phone-call.dto';
import { PhoneCallHttpMapper } from './mappers/phone-call-http.mapper';

/**
 * Звонковый канал подтверждения телефона (`/auth/phone/call*`, контракт v1.2,
 * ADR-0014). Контроллер живёт в OTP-контексте: челлендж-стор и
 * `verificationToken` — общие с кодом по SMS.
 */
@ApiTags('Auth')
@Controller('auth/phone/call')
export class PhoneCallController {
  constructor(
    private readonly startPhoneCallUC: StartPhoneCallUseCase,
    private readonly getStatusUC: GetPhoneCallStatusUseCase,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start phone verification by call',
    description:
      'Creates a call challenge and asks the provider for the number the user must call. ' +
      'Always returns 200 for purpose=sign-in (anti-enumeration); 409 ContactAlreadyExists ' +
      'for purpose=sign-up on a taken number; 503 without a new error code when the provider ' +
      'is unavailable.',
  })
  @ApiResponse({ status: 200, type: PhoneCallChallengeResponseDto })
  @ApiResponse({ status: 409, description: 'ContactAlreadyExists' })
  @ApiResponse({ status: 422, description: 'OtpRateLimited (details.retryAfter)' })
  @ApiResponse({ status: 503, description: 'Phone verification provider is unavailable' })
  async start(
    @Body() dto: StartPhoneCallDto,
    @Req() request: Request,
  ): Promise<PhoneCallChallengeResponseDto> {
    const result = await this.startPhoneCallUC.execute(
      new StartPhoneCallCommand('phone', dto.phone, dto.purpose, resolveClientIp(request)),
    );
    return PhoneCallHttpMapper.toChallengeResponse(result);
  }

  @Public()
  @Get(':challengeId')
  @ApiOperation({
    summary: 'Get call challenge status',
    description:
      'Always 200 with a status field: pending | verified (with single-use verificationToken) ' +
      '| expired (window over, superseded by another channel or unknown challengeId) | failed.',
  })
  @ApiResponse({ status: 200, type: PhoneCallStatusResponseDto })
  async status(@Param('challengeId') challengeId: string): Promise<PhoneCallStatusResponseDto> {
    const result = await this.getStatusUC.execute(new GetPhoneCallStatusCommand(challengeId));
    return PhoneCallHttpMapper.toStatusResponse(result);
  }
}
