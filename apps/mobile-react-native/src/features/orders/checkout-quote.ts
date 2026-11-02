import { z } from "zod";
import type { SessionClient } from "@used-books/session-client";
import { quoteSchema, type Quote } from "./contracts";

export type ReadQuote = { value: Quote; receivedAt: number; signature: string };

// Use the server's time budget, rather than the phone's wall-clock date.
// The server still revalidates everything when creating an Order.
export function quoteRemaining(read: ReadQuote, now = Date.now()) {
  return Math.max(
    0,
    Date.parse(read.value.expiresAt) -
      Date.parse(read.value.serverTime) -
      Math.max(0, now - read.receivedAt),
  );
}

export function quoteUsable(
  read: ReadQuote,
  signature: string,
  now = Date.now(),
) {
  return (
    read.signature === signature &&
    read.value.assessment === "Current" &&
    quoteRemaining(read, now) > 0
  );
}

export function quoteSignature(listingId: string, body: string) {
  return `${listingId}:${body}`;
}

type Attempt = {
  listingId: string;
  signature: string;
  key: string;
  body: string;
  id?: string;
  result?: ReadQuote;
  flight?: Promise<ReadQuote>;
};

/** One modal session: Back keeps its intent; a different identity gets a new one. */
export class CheckoutQuote {
  private attempt?: Attempt;

  async read(
    client: SessionClient,
    listingId: string,
    body: string,
    key: () => string,
  ) {
    const signature = quoteSignature(listingId, body);
    if (
      !this.attempt ||
      (this.attempt.result &&
        !this.attempt.flight &&
        this.attempt.signature !== signature)
    ) {
      this.attempt = { listingId, signature, key: key(), body };
    }
    const attempt = this.attempt;
    if (attempt.signature !== signature)
      throw new Error(
        "Báo giá trước chưa xác định kết quả. Thử lại báo giá đã yêu cầu trước khi tính phí cho địa chỉ đang chọn.",
      );
    if (attempt.flight) return attempt.flight;
    attempt.flight = (async () => {
      const receipt = attempt.id
        ? { entityId: attempt.id }
        : await client.request(
            `/listings/${listingId}/quotes`,
            z.object({ entityId: z.uuid() }),
            {
              method: "POST",
              headers: { "Idempotency-Key": attempt.key },
              body: attempt.body,
            },
          );
      attempt.id = receipt.entityId;
      const value = await client.request(
        `/me/quotes/${attempt.id}`,
        quoteSchema,
      );
      const result = { value, receivedAt: Date.now(), signature };
      attempt.result = result;
      return result;
    })();
    try {
      return await attempt.flight;
    } finally {
      attempt.flight = undefined;
    }
  }

  retry(client: SessionClient) {
    const attempt = this.attempt;
    if (!attempt) throw new Error("Chưa có yêu cầu báo giá để thử lại.");
    return this.read(
      client,
      attempt.listingId,
      attempt.body,
      () => attempt.key,
    );
  }

  // Renewal is deliberate and allowed only for a known expired estimate.
  // Network/auth errors, Changed and Unavailable never silently replace intent.
  renew(now = Date.now()) {
    const read = this.attempt?.result;
    if (
      this.attempt?.flight ||
      !read ||
      !(
        read.value.assessment === "Expired" ||
        (read.value.assessment === "Current" && quoteRemaining(read, now) === 0)
      )
    )
      return false;
    this.attempt = undefined;
    return true;
  }
}
