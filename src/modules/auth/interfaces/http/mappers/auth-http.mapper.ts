import { SignUpEmailResult } from '../../../application/use-cases/sign-up-email/sign-up-email.use-case';
import { SignUpPhoneResult } from '../../../application/use-cases/sign-up-phone/sign-up-phone.use-case';
import { ProvisionedUser } from '@shared/application/user-provisioning.interface';
import { SignUpEmailResponseDto, SignUpUserDto } from '../dto/sign-up-email-response.dto';
import { SignUpPhoneResponseDto } from '../dto/sign-up-phone-response.dto';

/**
 * DTO ≠ результат use case: наружу отдаём ровно поля контракта.
 */
export class AuthHttpMapper {
  static toSignUpEmailResponse(result: SignUpEmailResult): SignUpEmailResponseDto {
    return { user: this.toSignUpUser(result.user), verifyEmailSent: result.verifyEmailSent };
  }

  static toSignUpPhoneResponse(result: SignUpPhoneResult): SignUpPhoneResponseDto {
    return {
      user: this.toSignUpUser(result.user),
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        expiresIn: result.tokens.expiresIn,
      },
    };
  }

  private static toSignUpUser(user: ProvisionedUser): SignUpUserDto {
    return {
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
  }
}
