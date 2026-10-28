import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { createCommand, runCommand, type Request } from "../../core/command";
import { simulatorCommand, simulatorOutcome, walletEventReceipt, type SimulatorValues } from "./simulator-contracts";
const actor = crypto.randomUUID();
const values: SimulatorValues = { eventId: crypto.randomUUID(), intentId: crypto.randomUUID(), recipientId: crypto.randomUUID(), amount: "150000", currency: "VND", outcome: "Succeeded", occurredAt: "2026-10-26T10:00:00.000Z", orderId: crypto.randomUUID(), shipmentId: crypto.randomUUID(), trackingCode: "LL-ABCDEFGH" };
describe("simulator command adapters", () => {
  it("binds each envelope to its own idempotency key and only sends contract fields", () => {
    for (const kind of ["topups", "pickups", "deliveries"] as const) {
      const command = simulatorCommand(kind, values, actor);
      expect(command.key).toBe(command.body.eventId);
      expect(command.body).not.toHaveProperty("expectedVersion");
      if (kind === "topups") expect(command.body).not.toHaveProperty("orderId");
      if (kind === "deliveries") expect(command.body).not.toHaveProperty("type");
      if (kind === "pickups") expect(command.body).toHaveProperty("type", "PickedUp");
    }
  });
  it("rejects an operator attempting a topup for themselves", () => {
    expect(() => simulatorCommand("topups", { ...values, recipientId: actor }, actor)).toThrow("độc lập");
  });
  it.each(["0", "10000001", "1.5", "bad"])("rejects invalid topup amount %s", amount => {
    expect(() => simulatorCommand("topups", { ...values, amount }, actor)).toThrow();
  });
  it("requires the real envelope identifiers, carrier tracking format and event time", () => {
    for (const [name, value] of [["shipmentId", "bad"], ["trackingCode", "wrong"], ["occurredAt", "tomorrow"]] as const)
      expect(() => simulatorCommand("pickups", { ...values, [name]: value }, actor)).toThrow();
  });
  it("keeps the exact envelope across a lost response even when inputs subsequently change", async () => {
    const draft = { ...values };
    const command = simulatorCommand("topups", draft, actor);
    const intent = createCommand(command.path, command.body, command.key);
    const calls: RequestInit[] = [];
    const request: Request = async (_path, schema, init) => {
      calls.push(init!);
      if (calls.length === 1) throw new ApiError(0, "NETWORK_ERROR", "lost");
      return schema.parse({ ok: true });
    };
    const schema = z.object({ ok: z.boolean() });
    await expect(runCommand(intent, schema, request, async () => {})).rejects.toThrow("lost");
    draft.amount = "999999"; draft.eventId = crypto.randomUUID();
    await runCommand(intent, schema, request, async () => {});
    expect(calls[1]).toEqual(calls[0]);
    expect(JSON.parse(String(calls[1].body)).amount).toBe(150000);
  });
  it("does not present ReviewRequired as credited or duplicate pickup as another application", () => {
    const receipt = walletEventReceipt.parse({ id: crypto.randomUUID(), entityType: "TopupIntent", entityId: values.intentId, version: 2, state: "ReviewRequired", credited: false, journalId: null, serverTime: values.occurredAt, demoOnly: true, label: "Mô phỏng đồ án", currency: "VND" });
    expect(simulatorOutcome(receipt).tone).toBe("warning");
    expect(simulatorOutcome(receipt).text).toContain("chưa ghi nhận bút toán");
    expect(simulatorOutcome({ id: crypto.randomUUID(), entityType: "CarrierEvent", entityId: values.eventId, shipmentId: values.shipmentId, orderId: values.orderId, contextId: crypto.randomUUID(), version: 1, state: "Recorded", outcome: "Duplicate", orderVersion: 4, orderState: "InTransit", serverTime: values.occurredAt }).text).toContain("không áp dụng thêm");
  });
});
