import { SignUpEmailResult } from '../../../application/use-cases/sign-up-email/sign-up-email.use-case';
import { SignUpEmailResponseDto, SignUpUserDto } from '../dto/sign-up-email-response.dto';

/**
 * DTO ≠ результат use case: наружу отдаём ровно поля контракта.
 */
export class AuthHttpMapper {
  static toSignUpEmailResponse(result: SignUpEmailResult): SignUpEmailResponseDto {
    const { user } = result;
    const dto: SignUpUserDto = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return { user: dto, verifyEmailSent: result.verifyEmailSent };
  }
}
