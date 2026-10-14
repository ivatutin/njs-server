import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SignInUseCase } from '../../application/use-cases/sign-in/sign-in.use-case';
import { SignInCommand } from '../../application/use-cases/sign-in/sign-in.command';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token/refresh-token.use-case';
import { SignOutUseCase } from '../../application/use-cases/sign-out/sign-out.use-case';
import { SignOutCommand } from '../../application/use-cases/sign-out/sign-out.command';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignOutDto } from './dto/sign-out.dto';
import { SignUpEmailDto } from './dto/sign-up-email.dto';
import { ResendVerifyEmailDto } from './dto/resend-verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { SignUpEmailResponseDto } from './dto/sign-up-email-response.dto';
import { TokenPairResponseDto } from './dto/token-pair-response.dto';
import { AuthHttpMapper } from './mappers/auth-http.mapper';
import { SignUpEmailCommand } from '../../application/use-cases/sign-up-email/sign-up-email.command';
import { SignUpEmailUseCase } from '../../application/use-cases/sign-up-email/sign-up-email.use-case';
import { ResendVerifyEmailCommand } from '../../application/use-cases/resend-verify-email/resend-verify-email.command';
import { ResendVerifyEmailUseCase } from '../../application/use-cases/resend-verify-email/resend-verify-email.use-case';
import { ForgotPasswordCommand } from '../../application/use-cases/forgot-password/forgot-password.command';
import { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password/forgot-password.use-case';
import { Public } from '@shared/interfaces/http/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signInUC: SignInUseCase,
    private readonly refreshTokenUC: RefreshTokenUseCase,
    private readonly signOutUC: SignOutUseCase,
    private readonly signUpEmailUC: SignUpEmailUseCase,
    private readonly resendVerifyEmailUC: ResendVerifyEmailUseCase,
    private readonly forgotPasswordUC: ForgotPasswordUseCase,
  ) {}

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in with email + password',
    description:
      'Authenticates against Keycloak via password grant. Returns access + refresh tokens. ' +
      'On first sign-in for a user, also creates a local User record (via UserSignedInEvent).',
  })
  @ApiResponse({ status: 200, type: TokenPairResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async signIn(@Body() dto: SignInDto): Promise<TokenPairResponseDto> {
    return this.signInUC.execute(new SignInCommand(dto.email, dto.password));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange refresh token for a new token pair' })
  @ApiResponse({ status: 200, type: TokenPairResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairResponseDto> {
    return this.refreshTokenUC.execute(dto.refreshToken);
  }

  @Post('sign-out')
  @HttpCode(204)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the refresh token on Keycloak side and blacklists the bearer access token ' +
      'in Redis until its natural expiry, so it can no longer be used to call protected endpoints.',
  })
  @ApiResponse({ status: 204, description: 'No Content' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Authorization header' })
  async signOut(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: SignOutDto,
  ): Promise<void> {
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '') ?? null;
    await this.signOutUC.execute(new SignOutCommand(accessToken, dto.refreshToken));
  }

  @Public()
  @Post('sign-up/email')
  @ApiOperation({
    summary: 'Sign up with email + password',
    description:
      'Creates a Keycloak account with a password and the VERIFY_EMAIL required action, ' +
      'provisions the local user (status pending_verification) and sends the verification ' +
      'magic link. The response user shape matches the contract UserDto.',
  })
  @ApiResponse({ status: 201, type: SignUpEmailResponseDto })
  @ApiResponse({ status: 409, description: 'ContactAlreadyExists' })
  @ApiResponse({ status: 422, description: 'PasswordPolicyViolation | TermsNotAccepted' })
  async signUpEmail(@Body() dto: SignUpEmailDto): Promise<SignUpEmailResponseDto> {
    const result = await this.signUpEmailUC.execute(
      new SignUpEmailCommand(
        dto.email,
        dto.password,
        dto.acceptedTerms,
        dto.firstName ?? null,
        dto.lastName ?? null,
      ),
    );
    return AuthHttpMapper.toSignUpEmailResponse(result);
  }

  @Public()
  @Post('verify-email/resend')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Resend the email verification link',
    description:
      'Always answers 202 (anti-enumeration): the response does not reveal whether the ' +
      'address exists or is already verified.',
  })
  @ApiResponse({ status: 202, description: 'Accepted (always)' })
  async resendVerifyEmail(@Body() dto: ResendVerifyEmailDto): Promise<void> {
    await this.resendVerifyEmailUC.execute(new ResendVerifyEmailCommand(dto.email));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always answers 202 (anti-enumeration). When the address exists, Keycloak sends an ' +
      'UPDATE_PASSWORD link valid for 1 hour. Limited to 3 requests per hour per address ' +
      '(over-limit requests are silently skipped, still 202).',
  })
  @ApiResponse({ status: 202, description: 'Accepted (always)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.forgotPasswordUC.execute(new ForgotPasswordCommand(dto.email));
  }
}
