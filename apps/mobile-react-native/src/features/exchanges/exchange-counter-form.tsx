import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AppText, Button, Notice, TextField, space } from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { formatVnd } from "../../core/ui/format";
import { draftPage } from "../drafts/contracts";
import { BookIdentity } from "../drafts/catalog-picker";

export function ExchangeCounterForm({
  isInitiator,
  currentIds,
  partnerValue,
  busy,
  onSubmit,
}: {
  isInitiator: boolean;
  currentIds: string[];
  partnerValue: number;
  busy: boolean;
  onSubmit: (ids: string[], note: string) => void;
}) {
  const { client, state } = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const actorId = state.status === "authenticated" ? state.user.id : "";
  const read = useInfiniteQuery({
    queryKey: ["exchange-replacement-books", actorId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      client.request(
        "/me/listings?moderation=Approved&limit=20&channel=Marketplace" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        draftPage,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(actorId),
    retry: false,
  });
  const items =
    read.data?.pages
      .flatMap((page) => page.items)
      .filter(
        (item) =>
          !currentIds.includes(item.id) &&
          item.channel === "Marketplace" &&
          item.state.visibility === "Visible" &&
          item.state.trade === "Available" &&
          ["Exchange", "Both"].includes(
            item.currentRevision.content.mode ?? "",
          ) &&
          !item.currentRevision.content.bundle,
      ) ?? [];
  const ownValue = items
    .filter((item) => selected.includes(item.id))
    .reduce(
      (sum, item) => sum + (item.currentRevision.content.exchangeValue ?? 0),
      0,
    );
  const diff = Math.abs(ownValue - partnerValue);
  return (
    <View style={{ gap: space.md }}>
      <AppText>
        Chọn {isInitiator ? "từ 1 đến 5 sách khác" : "đúng 1 sách khác"} của
        bạn. Hệ thống tính tiền bù từ giá trị đã duyệt; đối tác phải chấp nhận
        đề xuất mới.
      </AppText>
      {read.isPending && <AppText>Đang tải sách…</AppText>}
      {read.isError && (
        <>
          <Notice tone="error">
            Chưa tải được sách. Hãy thử lại trước khi chọn.
          </Notice>
          <Button title="Tải lại sách" onPress={() => void read.refetch()} />
        </>
      )}
      {!read.isPending && !read.isError && !items.length && (
        <AppText>Chưa có sách thay thế đủ điều kiện trong phần đã tải.</AppText>
      )}
      <ScrollView
        style={{ maxHeight: 240 }}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(item.id) }}
            disabled={
              busy ||
              (!selected.includes(item.id) &&
                selected.length >= (isInitiator ? 5 : 1))
            }
            onPress={() =>
              setSelected((old) =>
                old.includes(item.id)
                  ? old.filter((id) => id !== item.id)
                  : [...old, item.id],
              )
            }
            style={{
              padding: space.md,
              minHeight: 48,
              opacity: selected.includes(item.id) ? 1 : 0.8,
            }}
          >
            <AppText>
              {selected.includes(item.id) ? "Đã chọn" : "Chọn sách"}
            </AppText>
            <BookIdentity id={item.currentRevision.content.bookId} compact />
            <AppText>
              {formatVnd(item.currentRevision.content.exchangeValue ?? 0)}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
      {read.hasNextPage && (
        <Button
          title="Tải thêm sách"
          secondary
          busy={read.isFetchingNextPage}
          onPress={() => void read.fetchNextPage()}
        />
      )}
      {selected.length > 0 && (
        <Notice>
          Sách giao {formatVnd(ownValue)} · Sách nhận {formatVnd(partnerValue)}.{" "}
          {diff === 0
            ? "Đổi ngang giá."
            : (ownValue < partnerValue ? "Bạn bù " : "Đối tác bù ") +
              formatVnd(diff)}
        </Notice>
      )}
      <TextField
        label="Lời nhắn (tùy chọn)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      <Button
        title="Gửi đề xuất sách mới"
        wine
        busy={busy}
        disabled={!selected.length || read.isFetching}
        onPress={() => onSubmit(selected, note)}
      />
    </View>
  );
}
