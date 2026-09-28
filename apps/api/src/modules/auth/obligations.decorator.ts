import { SetMetadata } from '@nestjs/common';

// Method-only opt-in. This never replaces role, object ownership or state checks.
export const LOCKED_ACCESS = 'auth:locked-access';
export const ExistingObligation = () => SetMetadata(LOCKED_ACCESS, true);
