import { User } from '../../../domain/entities/user.entity';
import { UserResponseDto } from '../dto/user-response.dto';

/**
 * Превращает domain User в HTTP-ответ.
 * Сейчас отдаём только boolean флаги верификации.
 * Если понадобятся timestamps подтверждения — отдельный admin endpoint
 * с toAdminResponse().
 */
export class UserHttpMapper {
  static toResponse(user: User): UserResponseDto {
    return {
      id: user.id.toString(),
      email: user.email?.toString() ?? null,
      phone: user.phone.getValue(),
      emailVerified: user.isEmailVerified(),
      phoneVerified: user.isPhoneVerified(),
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      status: user.status.getValue(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
