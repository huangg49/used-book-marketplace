import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import {
  acknowledgedExchange,
  acknowledgedExchangeAction,
  exchangeCommandIdentity,
  exchangeCommandInFlight,
  exchangeReadProblem,
  exchangeRecoveryVersion,
  pendingExchangeIntent,
  pendingExchangeProposal,
  acknowledgedExchangeProposal,
  retryExchangeCommand,
  subscribeExchangeRecovery,
} from "@used-books/session-client";
import { Button, Notice, presentError, space } from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { exchangeSchema } from "./contracts";
import * as Crypto from "expo-crypto";

export function useExchangeRecovery(id = "", listingId = "") {
  "use no memo";
  const { client } = useSession();
  const subscribe = useCallback(
    (listener: () => void) => subscribeExchangeRecovery(client, listener),
    [client],
  );
  const snapshot = useCallback(() => exchangeRecoveryVersion(client), [client]);
  const version = useSyncExternalStore(subscribe, snapshot, () => 0);
  // This is an external mutable store, not a pure client/id calculation. The
  // compiler otherwise removes the revision dependency and caches old selectors.
  return useMemo(
    () => ({
      version,
      client,
      identity: exchangeCommandIdentity(client),
      pending: pendingExchangeIntent(client, id),
      ack: acknowledgedExchange(client, id, exchangeSchema),
      action: acknowledgedExchangeAction(client, id),
      problem: exchangeReadProblem(client, id),
      flying: exchangeCommandInFlight(client, id),
      proposal: pendingExchangeProposal(client),
      created: acknowledgedExchangeProposal(client, listingId),
    }),
    [client, id, listingId, version],
  );
}
export function ExchangeRecoveryPanel({
  id,
  onRead,
}: {
  id: string;
  onRead: () => Promise<unknown>;
}) {
  const { client, identity, pending, ack, action, problem, flying } =
    useExchangeRecovery(id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  if (!pending && !ack) return null;
  const run = async () => {
    if (busy || exchangeCommandInFlight(client, id)) return;
    setBusy(true);
    setError(undefined);
    try {
      if (pending)
        await retryExchangeCommand(
          client,
          id,
          () => Crypto.randomUUID(),
          exchangeSchema,
        );
      if (exchangeCommandIdentity(client) === identity) await onRead();
    } catch (failure) {
      if (exchangeCommandIdentity(client) === identity)
        setError(presentError(failure).message);
    } finally {
      if (exchangeCommandIdentity(client) === identity) setBusy(false);
    }
  };
  return (
    <View style={{ gap: space.md }}>
      <Notice>
        {pending
          ? "Chưa xác nhận được kết quả thao tác trước. Nội dung và mã yêu cầu đang được giữ nguyên. Hãy thử lại trước khi thực hiện việc khác."
          : "Máy chủ đã xác nhận thao tác. Đang đối soát trạng thái hiện tại; chỉ cần tải lại, không gửi lệnh lần nữa."}
      </Notice>
      {ack && action === "funding" && (
        <Notice>
          Máy chủ đã ghi nhận khoản nộp của bạn. Không cần nộp lại.
        </Notice>
      )}
      {ack && problem && (
        <Notice tone="error">
          {problem === "unavailable"
            ? "Chưa tải được trạng thái hiện tại. Kết quả đã xác nhận vẫn được giữ lại."
            : "Dữ liệu đọc lại chưa theo kịp kết quả đã xác nhận. Hãy tải lại sau một lát."}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        title={pending ? "Thử lại thao tác trước" : "Tải lại trạng thái"}
        busy={busy || flying}
        onPress={() => void run()}
      />
    </View>
  );
}
