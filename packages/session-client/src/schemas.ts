import { z } from "zod";
import type { components } from "@used-books/api-contract";

export type CurrentUser = components["schemas"]["CurrentUser"];
export type AuthTokens = components["schemas"]["AuthTokens"];
export type LoginRequest = components["schemas"]["LoginRequest"];

export const currentUserSchema: z.ZodType<CurrentUser> = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  status: z.enum(["ACTIVE", "RESTRICTED", "LOCKED"]),
  roles: z.array(z.enum(["MEMBER", "STAFF", "ADMIN", "TEST_OPERATOR"])),
});
export const authTokensSchema: z.ZodType<AuthTokens> = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresIn: z.literal(900),
  user: currentUserSchema,
});
