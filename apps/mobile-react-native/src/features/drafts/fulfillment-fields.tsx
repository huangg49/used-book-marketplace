import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppModal,
  AppText,
  Button,
  Notice,
  StatePanel,
  TextField,
  colors,
  space,
  stitchTokens,
} from "../../core/ui";
import { addressBook, addressReceipt, directory } from "../addresses/contracts";
import { photoError, useForeground } from "./draft-media";
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
    cache = useQueryClient(),
    active = useForeground();
  const [createOpen, setCreateOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocality, setNewLocality] = useState("q1");
  const [newDetail, setNewDetail] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => client.request("/service-areas", directory),
    enabled: active,
  });

  const localities = areas.data?.localities ?? [
    { code: "q1", label: "Quận 1" },
    { code: "q3", label: "Quận 3" },
    { code: "q5", label: "Quận 5" },
    { code: "q7", label: "Quận 7" },
    { code: "q10", label: "Quận 10" },
    { code: "binh-thanh", label: "Bình Thạnh" },
    { code: "go-vap", label: "Gò Vấp" },
    { code: "phu-nhuan", label: "Phú Nhuận" },
    { code: "tan-binh", label: "Tân Bình" },
    { code: "thu-duc", label: "TP. Thủ Đức" },
    { code: "binh-duong", label: "Bình Dương" },
    { code: "vung-tau", label: "Vũng Tàu" },
  ];

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
              message="Thêm nơi gửi sách để người giao hàng đến lấy sách của bạn."
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
      {!summary && !disabled ? (
        <View style={{ gap: space.sm }}>
          <Button
            secondary
            title="+ Thêm nơi gửi sách mới"
            disabled={disabled}
            onPress={() => setCreateOpen(true)}
          />
          <Button
            secondary
            title="Quản lý sổ địa chỉ"
            disabled={disabled}
            onPress={() => router.push("./addresses")}
          />
        </View>
      ) : null}

      {/* Inline Address Creation Modal */}
      <AppModal
        visible={createOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: stitchTokens.modalScrim,
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: stitchTokens.white,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: space.lg,
              gap: space.md,
              maxHeight: "85%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <AppText kind="heading" color={stitchTokens.wineDark} style={{ fontSize: 18 }}>
                Thêm nơi gửi sách
              </AppText>
              <Button
                secondary
                title="Đóng"
                onPress={() => {
                  setCreateOpen(false);
                  setCreateError("");
                }}
              />
            </View>

            <AppText kind="small" color={stitchTokens.subtleGray}>
              Người giao hàng sẽ lấy sách tại đây. Người mua chỉ thấy khu vực luân chuyển, không thấy địa chỉ chi tiết hoặc số điện thoại của bạn.
            </AppText>

            {createError ? <Notice tone="error">{createError}</Notice> : null}

            <TextField
              label="Họ tên người gửi *"
              value={newRecipient}
              placeholder="Ví dụ: Nguyễn Văn A"
              onChangeText={setNewRecipient}
              maxLength={100}
            />

            <TextField
              label="Số điện thoại *"
              value={newPhone}
              placeholder="10 chữ số (0...)"
              keyboardType="phone-pad"
              onChangeText={setNewPhone}
              maxLength={15}
            />

            <View style={{ gap: 4 }}>
              <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 12 }}>
                Khu vực luân chuyển (TP.HCM) *
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                {localities.map((loc) => {
                  const isSel = newLocality === loc.code;
                  return (
                    <Pressable
                      key={loc.code}
                      onPress={() => setNewLocality(loc.code)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 14,
                        backgroundColor: isSel ? stitchTokens.wine : stitchTokens.parchment,
                        borderWidth: 1,
                        borderColor: isSel ? stitchTokens.wine : stitchTokens.peachBorder,
                      }}
                    >
                      <AppText
                        kind="small"
                        color={isSel ? stitchTokens.white : stitchTokens.darkWood}
                        style={{ fontSize: 11, fontWeight: isSel ? "700" : "500" }}
                      >
                        {loc.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <TextField
              label="Địa chỉ chi tiết *"
              value={newDetail}
              placeholder="Số nhà, tên đường, phường..."
              multiline
              onChangeText={setNewDetail}
              maxLength={300}
            />

            <Button
              wine
              title="Lưu & Sử dụng nơi gửi này"
              busy={createBusy}
              disabled={createBusy || !newRecipient.trim() || !newPhone.trim() || !newDetail.trim()}
              onPress={async () => {
                if (newRecipient.trim().length < 2) {
                  setCreateError("Họ tên người gửi cần ít nhất 2 ký tự.");
                  return;
                }
                if (!/^0\d{9}$/.test(newPhone.trim())) {
                  setCreateError("Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
                  return;
                }
                if (!newLocality) {
                  setCreateError("Vui lòng chọn khu vực luân chuyển.");
                  return;
                }
                if (newDetail.trim().length < 5) {
                  setCreateError("Địa chỉ chi tiết cần ít nhất 5 ký tự.");
                  return;
                }
                setCreateBusy(true);
                setCreateError("");
                try {
                  const receiptData = await client.request(
                    "/me/addresses",
                    addressReceipt,
                    {
                      method: "POST",
                      headers: { "Idempotency-Key": Crypto.randomUUID() },
                      body: JSON.stringify({
                        expectedBookVersion: book.data?.version ?? 0,
                        address: {
                          recipientName: newRecipient.trim(),
                          phone: newPhone.trim(),
                          serviceAreaCode: "HCM-DEMO-v1",
                          localityCode: newLocality,
                          detail: newDetail.trim(),
                        },
                        makeDefault: (book.data?.items.length ?? 0) === 0,
                      }),
                    },
                  );
                  await cache.invalidateQueries({ queryKey: ["address-book"] });
                  onChange({
                    originAddressId: receiptData.addressId,
                    originAddressVersion: receiptData.version,
                    method: "DirectDelivery",
                  });
                  setCreateOpen(false);
                  setNewRecipient("");
                  setNewPhone("");
                  setNewDetail("");
                } catch (e) {
                  setCreateError(photoError(e));
                } finally {
                  setCreateBusy(false);
                }
              }}
            />
          </View>
        </View>
      </AppModal>

      <Notice tone="info">
        Người mua có thể Mua ngay theo giá bạn niêm yết. Khi thanh toán thành công, đơn được chốt và bạn cam kết bàn giao sách trong 48 giờ, không có bước duyệt lại.
      </Notice>

      <AppText kind="small" color={colors.muted}>
        Địa chỉ chi tiết và số điện thoại chỉ dùng cho giao nhận nội bộ; người mua chỉ thấy khu vực luân chuyển.
      </AppText>
    </View>
  );
}
