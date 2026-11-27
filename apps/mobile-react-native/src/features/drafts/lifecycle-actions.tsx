import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { Button, ConfirmDialog, Notice, space } from "../../core/ui";
import { privateDraft, type Draft } from "./contracts";
import { photoError } from "./draft-media";
import { manageableListing } from "./listing-form";
import {
  executeLifecycle,
  lifecycleIntent,
  type LifecycleIntent,
} from "./lifecycle-command";

export function LifecycleActions({
  value,
  disabled,
  reconcile,
  onBack,
  onPending,
}: {
  value: Draft;
  disabled: boolean;
  reconcile: (fresh: Draft, replace: boolean) => Promise<void>;
  onBack: () => void;
  onPending: (pending: boolean) => void;
}) {
  const { client, state } = useSession(),
    cache = useQueryClient();
  const [choice, setChoice] = useState<LifecycleIntent["action"]>();
  const [intent, setIntent] = useState<LifecycleIntent>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    onPending(!!intent || busy);
    return () => onPending(false);
  }, [intent, busy, onPending]);
  const eligible = manageableListing(value);
  const auction = value.channel === "Auction";
  const hideLabel = auction ? "Ẩn bài đấu giá" : "Ẩn khỏi kệ";
  const showLabel = auction ? "Mở lại bài đấu giá" : "Mở lại trên kệ";
  const active =
    state.status === "authenticated" && state.user.status === "ACTIVE";
  const label =
    choice === "archive"
      ? "Xóa bài đăng"
      : choice === "Hidden"
        ? hideLabel
        : showLabel;
  async function send() {
    if (inFlight.current || !choice) return;
    const current =
      intent ??
      lifecycleIntent(value.id, value.version, choice, Crypto.randomUUID());
    setIntent(current);
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await executeLifecycle(client, current);
      if (current.acknowledged && current.action === "archive") {
        await cache.invalidateQueries({ queryKey: ["drafts"] });
      } else
        await reconcile(
          await client.request(`/me/listings/${value.id}`, privateDraft),
          true,
        );
      await cache.invalidateQueries({ queryKey: ["public-shelf"] });
      await cache.invalidateQueries({ queryKey: ["public-listing", value.id] });
      if (auction && state.status === "authenticated")
        await cache.invalidateQueries({ queryKey: ["my-listings", state.user.id, "auction"] });
      setMessage(
        current.stopped
          ? "Đã tải trạng thái mới nhất. Thao tác trước không được thực hiện; kiểm tra lại trước khi chọn tiếp."
          : current.action === "Hidden"
            ? auction ? "Đã ẩn bài đấu giá." : "Đã ẩn bài khỏi kệ."
            : auction ? "Đã mở lại bài đấu giá." : "Đã mở lại bài trên kệ.",
      );
      setChoice(undefined);
      setIntent(undefined);
      if (current.acknowledged && current.action === "archive") onBack();
    } catch (e) {
      setError(photoError(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function choose(action: LifecycleIntent["action"]) {
    setChoice(action);
    setError("");
    setMessage("");
  }
  return (
    <View style={{ gap: space.sm }}>
      {intent && !choice ? (
        <Button
          wine
          title="Đối chiếu yêu cầu đang giữ"
          onPress={() => setChoice(intent.action)}
        />
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {eligible && value.state.moderation === "Approved" ? (
        <Button
          wine
          secondary
          title={
            value.state.visibility === "Visible"
              ? hideLabel
              : showLabel
          }
          disabled={
            disabled ||
            !!intent ||
            (value.state.visibility === "Hidden" && !active)
          }
          onPress={() =>
            choose(value.state.visibility === "Visible" ? "Hidden" : "Visible")
          }
        />
      ) : null}
      {eligible ? (
        <Button
          secondary
          destructive
          title="Xóa bài đăng"
          disabled={disabled || !!intent}
          onPress={() => choose("archive")}
        />
      ) : null}
      <ConfirmDialog
        visible={!!choice}
        title={label + "?"}
        message={
          choice === "archive"
            ? "Bài sẽ biến mất khỏi kệ và Sách của tôi. Bạn không thể tự khôi phục; lịch sử được giữ để đối chiếu."
            : choice === "Hidden"
            ? auction
              ? "Bài tạm rời danh sách sách có thể gửi đấu giá để bạn có chỗ gửi bài khác. Nội dung đã duyệt được giữ lại."
              : "Người khác sẽ không tìm thấy bài. Nội dung đã duyệt được giữ để bạn mở lại sau."
              : "Bài sẽ hiện lại nếu thông tin và tài khoản vẫn đủ điều kiện."
        }
        confirmLabel={
          intent?.stopped
            ? "Tải trạng thái mới nhất"
            : intent
              ? "Thử lại yêu cầu này"
              : label
        }
        destructive={choice === "archive"}
        busy={busy}
        error={error || undefined}
        onConfirm={() => void send()}
        onCancel={() => setChoice(undefined)}
      />
    </View>
  );
}
