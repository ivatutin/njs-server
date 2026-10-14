import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { Public } from '@shared/interfaces/http/decorators/public.decorator';
import { HandleCibaChannelRequestCommand } from '../../application/use-cases/handle-ciba-channel-request/handle-ciba-channel-request.command';
import { HandleCibaChannelRequestUseCase } from '../../application/use-cases/handle-ciba-channel-request/handle-ciba-channel-request.use-case';
import { CibaChannelRequestDto } from './dto/ciba-channel-request.dto';

/**
 * «Канал аутентификации» CIBA (ADR-0015): сюда Keycloak присылает уведомление о
 * заявке, начатой нашим же бэкендом; мы подтверждаем её своим callback'ом.
 *
 * Не входит в контракт фронта (server-to-server), поэтому исключён из Swagger;
 * доступен только из внутренней сети compose, наружу не публикуется.
 */
@ApiExcludeController()
@Controller('internal/ciba/channel')
export class CibaChannelController {
  constructor(private readonly handleUC: HandleCibaChannelRequestUseCase) {}

  @Public()
  @Post()
  @HttpCode(201)
  async handle(
    @Body() dto: CibaChannelRequestDto,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const result = await this.handleUC.execute(
      new HandleCibaChannelRequestCommand(
        authorization ?? null,
        dto.login_hint ?? null,
        dto.binding_message ?? null,
      ),
    );

    // 201 = «заявка подтверждена». Любой другой ответ = отказ: Keycloak завершит
    // backchannel-запрос ошибкой `access_denied`, и токены никто не получит.
    if (!result.approved) throw new BadRequestException('Channel request denied');
  }
}
