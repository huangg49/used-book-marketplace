import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Notice,
  StatePanel,
  colors,
  space,
} from "../../core/ui";
import { addressBook } from "../addresses/contracts";
import { useForeground } from "../../core/hooks/use-foreground";
import type { Content } from "./contracts";

export function FulfillmentFields({
  value,
  onChange,
  disabled,
  summary = false,
}: {
  value: Content["fulfillment"];
  onChange: (value: Content["fulfillment"]) => void;
  disabled: boolean;
  summary?: boolean;
}) {
  const { client } = useSession(),
    active = useForeground();
  const book = useQuery({
    queryKey: ["address-book"],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled: active,
    gcTime: 0,
    refetchInterval: active ? 30_000 : false,
  });
  const selected = book.data?.items.find(
    (a) => a.id === value?.originAddressId,
  );
  const current =
    !!selected && selected.version === value?.originAddressVersion;
  return (
    <View
      style={{
        gap: space.md,
        paddingVertical: space.lg,
        borderTopWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <AppText kind="heading">Sách sẽ đi từ đâu?</AppText>
      <AppText>
        Chọn nơi bạn sẽ gửi cuốn sách. Tên, số điện thoại và địa chỉ chi tiết
        chỉ hiển thị trong sổ của bạn.
      </AppText>
      {book.isPending ? <StatePanel loading title="Đang tải nơi gửi" /> : null}
      {book.isError ? (
        <>
          <Notice tone="error">
            Chưa tải được sổ địa chỉ. Lựa chọn đang giữ chưa được xác minh lại.
          </Notice>
          <Button
            secondary
            title="Tải lại nơi gửi"
            busy={book.isFetching}
            onPress={() => void book.refetch()}
          />
        </>
      ) : null}
      {value && book.data && !book.isError && !current ? (
        <Notice tone="warning">
          Nơi gửi đã được sửa hoặc xóa. Chọn lại địa chỉ trước khi lưu hoặc gửi
          duyệt; bản đã lưu không tự đổi theo sổ địa chỉ.
        </Notice>
      ) : null}
      {!value ? (
        <AppText color={colors.muted}>
          Chưa khai báo nơi gửi. Bạn vẫn có thể hoàn thiện bài đăng; giao dịch
          chưa mở.
        </AppText>
      ) : null}
      {current && !book.isError ? (
        <View style={{ gap: space.xs }}>
          <AppText kind="bold">
            Nơi gửi đã chọn · {selected.recipientName}
          </AppText>
          <AppText>{selected.detail}</AppText>
          <AppText kind="small">
            Giao trực tiếp · TP.HCM · khu vực mô phỏng
          </AppText>
        </View>
      ) : null}
      {!summary && !disabled && book.data && !book.isError ? (
        <>
          {!book.data.items.length ? (
            <StatePanel
              title="Sổ địa chỉ còn trống"
              message="Thêm địa chỉ, rồi quay lại bài đăng để chọn nơi gửi."
            />
          ) : null}
          {/* Default first and labelled; choosing stays explicit, never automatic. */}
          {[...book.data.items]
            .sort((x, y) => Number(y.isDefault) - Number(x.isDefault))
            .map((a) => (
              <Button
                key={a.id}
                secondary
                selected={value?.originAddressId === a.id && current}
                title={`${value?.originAddressId === a.id && current ? "Đã chọn" : "Chọn nơi gửi"}: ${a.recipientName} · ${a.detail}${a.isDefault ? " · Mặc định" : ""}`}
                disabled={book.isFetching}
                onPress={() =>
                  onChange({
                    originAddressId: a.id,
                    originAddressVersion: a.version,
                    method: "DirectDelivery",
                  })
                }
              />
            ))}
          {value ? (
            <Button
              secondary
              title="Bỏ lựa chọn nơi gửi"
              onPress={() => onChange(null)}
            />
          ) : null}
        </>
      ) : null}
      {!summary ? (
        <Button
          secondary
          title="Mở sổ địa chỉ"
          disabled={disabled}
          onPress={() => router.push("./addresses")}
        />
      ) : null}
      <AppText kind="small" color={colors.muted}>
        Hiện mới lưu lựa chọn giao trực tiếp. Chưa tính phí, đặt giao hàng hay
        nhận sách qua điểm. Thay đổi nơi gửi trên bài đã duyệt cần được duyệt
        lại.
      </AppText>
    </View>
  );
}
