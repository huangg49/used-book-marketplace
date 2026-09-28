import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import type { CommandContext, CommandService } from './command.service.js';
import { ContractInput } from './contract-input.service.js';
export function commandContext(
  input: ContractInput,
  request: AuthenticatedRequest,
  response: Response,
): CommandContext {
  return {
    auth: request.auth,
    key: input.uuid(request.headers['idempotency-key']),
    requestId: response.locals.requestId as string,
  };
}
export async function commandResponse(
  result: ReturnType<CommandService['run']>,
  response: Response,
) {
  const { receipt, replayed } = await result;
  response.setHeader('Idempotency-Replayed', String(replayed));
  return receipt;
}
