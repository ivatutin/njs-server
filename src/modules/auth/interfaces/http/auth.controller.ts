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
import { TokenPairResponseDto } from './dto/token-pair-response.dto';
import { Public } from './decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signInUC: SignInUseCase,
    private readonly refreshTokenUC: RefreshTokenUseCase,
    private readonly signOutUC: SignOutUseCase,
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
}
