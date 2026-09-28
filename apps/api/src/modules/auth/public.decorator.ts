import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'auth:public';
// Authentication is required by default. Mark only intentionally public routes.
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
