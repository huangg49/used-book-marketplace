import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsUUID,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AccountEmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}
export class RegisterAccountDto extends AccountEmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName: string;
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
  @IsBoolean()
  @Equals(true)
  acceptedRules: boolean;
}
export class AuthActionTokenDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}
export class ResetPasswordDto extends AuthActionTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}
export class AccountOtpRequestDto extends AccountEmailDto {
  @IsIn(['VerifyEmail', 'ResetPassword'])
  purpose: 'VerifyEmail' | 'ResetPassword';
}
export class AccountOtpCodeDto {
  @IsUUID('4')
  challengeId: string;
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code: string;
}
export class AccountOtpResetDto extends AccountOtpCodeDto {
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}
