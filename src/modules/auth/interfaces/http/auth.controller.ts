import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
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
  async signIn(@Body() dto: SignInDto): Promise<TokenPairResponseDto> {
    return this.signInUC.execute(new SignInCommand(dto.email, dto.password));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairResponseDto> {
    return this.refreshTokenUC.execute(dto.refreshToken);
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: SignOutDto,
  ): Promise<void> {
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '') ?? null;
    await this.signOutUC.execute(new SignOutCommand(accessToken, dto.refreshToken));
  }
}
