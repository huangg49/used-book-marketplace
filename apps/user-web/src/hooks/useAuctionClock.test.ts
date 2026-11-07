import { describe, expect, it } from 'vitest';
import { ApiError } from '@used-books/session-client';
import { commandOutcomeUnknown, outcomeUnknown } from './useAuctionClock';

describe('auction command and read outcomes', () => {
  it.each([0, 401, 403, 408, 429, 500, 502, 503])('retains a command after HTTP%s', status => {
    expect(commandOutcomeUnknown(new ApiError(status, 'QA_FAILURE', 'Synthetic failure'))).toBe(true);
  });
  it.each([400, 404, 409, 410, 422])('releases a definitively rejected command after HTTP%s', status => {
    expect(commandOutcomeUnknown(new ApiError(status, 'QA_REFUSAL', 'Synthetic refusal'))).toBe(false);
  });
  it.each([401, 403, 404, 408, 429])('does not turn an HTTP%s read into successful cached content', status => {
    expect(outcomeUnknown(new ApiError(status, 'QA_DENIED_READ', 'Synthetic read failure'))).toBe(false);
  });
  it('keeps unknown network, response parsing and timeout failures', () => {
    for (const error of [new Error('Network failed'), new TypeError('Response invalid'), undefined]) {
      expect(commandOutcomeUnknown(error)).toBe(true);
      expect(outcomeUnknown(error)).toBe(true);
    }
  });
});
