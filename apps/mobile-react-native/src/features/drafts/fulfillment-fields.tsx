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
  Icon,
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

  if (summary) {
    if (book.isPending) {
      return (
        <View
          style={{
            marginTop: space.xs,
            padding: space.sm,
            borderRadius: 12,
            backgroundColor: stitchTokens.warmIvory,
            borderWidth: 1,
            borderColor: stitchTokens.borderWarm,
          }}
        >
          <AppText kind="small" color={stitchTokens.slateWarm}>
            Đang tải thông tin nơi gửi...
          </AppText>
        </View>
      );
    }

    if (!value || !current || book.isError) {
      return (
        <View
          style={{
            marginTop: space.xs,
            padding: space.sm,
            borderRadius: 12,
            backgroundColor: stitchTokens.warmIvory,
            borderWidth: 1,
            borderColor: stitchTokens.borderWarm,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
          }}
        >
          <Icon name="truck" size={16} color={stitchTokens.subtleGray} />
          <AppText kind="small" color={stitchTokens.slateWarm} style={{ flex: 1, fontSize: 12 }}>
            {value && !current
              ? "Nơi gửi đã được cập nhật hoặc thay đổi trong sổ địa chỉ."
              : "Chưa thiết lập nơi gửi sách (giao dịch chưa mở)."}
          </AppText>
        </View>
      );
    }

    return (
      <View
        style={{
          marginTop: space.xs,
          padding: space.sm,
          borderRadius: 12,
          backgroundColor: stitchTokens.warmIvory,
          borderWidth: 1,
          borderColor: stitchTokens.borderWarm,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="truck" size={15} color={stitchTokens.wine} />
            <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 13 }}>
              Nơi gửi sách (Lấy hàng)
            </AppText>
          </View>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 8,
              backgroundColor: stitchTokens.parchment,
              borderWidth: 1,
              borderColor: stitchTokens.peachBorder,
            }}
          >
            <AppText kind="small" color={stitchTokens.wineDark} style={{ fontSize: 10, fontWeight: "700" }}>
              Giao trực tiếp
            </AppText>
          </View>
        </View>

        <View style={{ paddingLeft: 21, gap: 2 }}>
          <AppText kind="bold" color={stitchTokens.darkWood} style={{ fontSize: 13 }}>
            {selected.recipientName}
          </AppText>
          <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 12 }}>
            {selected.detail}
          </AppText>
          <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontSize: 11, marginTop: 2 }}>
            ⚡ Cam kết giao cho shipper trong 48h khi có đơn · Địa chỉ bảo mật nội bộ
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        gap: space.md,
        paddingTop: space.md,
        borderTopWidth: 1,
        borderColor: stitchTokens.parchment,
      }}
    >
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText kind="heading" color={stitchTokens.wineDark} style={{ fontSize: 17 }}>
            Sách sẽ đi từ đâu?
          </AppText>
          {value && current ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                backgroundColor: colors.successSurface,
                borderWidth: 1,
                borderColor: stitchTokens.greenBorderSoft,
              }}
            >
              <Icon name="check" size={11} color={stitchTokens.verifiedGreen} />
              <AppText kind="small" color={stitchTokens.verifiedGreen} style={{ fontSize: 10, fontWeight: "700" }}>
                Đã chọn nơi gửi
              </AppText>
            </View>
          ) : (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                backgroundColor: stitchTokens.parchment,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
              }}
            >
              <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontSize: 10, fontWeight: "600" }}>
                Chưa chọn
              </AppText>
            </View>
          )}
        </View>

        <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 12 }}>
          Chọn địa chỉ để đối tác vận chuyển đến nhận sách khi có người đặt mua.
        </AppText>
      </View>

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
          Nơi gửi đã được sửa hoặc xóa. Chọn lại địa chỉ trước khi lưu hoặc gửi duyệt; bản đã lưu không tự đổi theo sổ địa chỉ.
        </Notice>
      ) : null}

      {!summary && !disabled && book.data && !book.isError ? (
        <View style={{ gap: space.sm }}>
          {!book.data.items.length ? (
            <StatePanel
              title="Sổ địa chỉ còn trống"
              message="Thêm nơi gửi sách để người giao hàng đến lấy sách của bạn."
            />
          ) : null}

          {/* Address Cards */}
          {[...book.data.items]
            .sort((x, y) => Number(y.isDefault) - Number(x.isDefault))
            .map((a) => {
              const isSelected = value?.originAddressId === a.id && current;

              return (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${isSelected ? "Đã chọn nơi gửi" : "Chọn nơi gửi"}: ${a.recipientName} · ${a.detail}${a.isDefault ? " · Mặc định" : ""}`}
                  disabled={book.isFetching || disabled}
                  onPress={() =>
                    onChange({
                      originAddressId: a.id,
                      originAddressVersion: a.version,
                      method: "DirectDelivery",
                    })
                  }
                  style={({ pressed }) => [
                    {
                      padding: space.md,
                      borderRadius: 14,
                      backgroundColor: isSelected ? stitchTokens.roseWarmSurface : stitchTokens.warmIvory,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? stitchTokens.wine : stitchTokens.borderWarm,
                      gap: 6,
                      shadowColor: isSelected ? stitchTokens.wine : stitchTokens.black,
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: isSelected ? 0.08 : 0.03,
                      shadowRadius: 3,
                      elevation: isSelected ? 2 : 1,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {/* Radio Circle Indicator */}
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: isSelected ? 5 : 2,
                          borderColor: isSelected ? stitchTokens.wine : stitchTokens.borderWarm,
                          backgroundColor: stitchTokens.white,
                        }}
                      />
                      <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 14 }}>
                        {a.recipientName}
                      </AppText>
                      {a.isDefault ? (
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 1.5,
                            borderRadius: 6,
                            backgroundColor: stitchTokens.goldLight,
                            borderWidth: 1,
                            borderColor: stitchTokens.goldDark,
                          }}
                        >
                          <AppText kind="small" color={stitchTokens.wineDark} style={{ fontSize: 9.5, fontWeight: "700" }}>
                            Mặc định
                          </AppText>
                        </View>
                      ) : null}
                    </View>

                    {isSelected ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Icon name="check" size={13} color={stitchTokens.verifiedGreen} />
                        <AppText kind="small" color={stitchTokens.verifiedGreen} style={{ fontSize: 11, fontWeight: "700" }}>
                          Đang chọn
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ paddingLeft: 26, gap: 2 }}>
                    <AppText kind="small" color={stitchTokens.darkWood} style={{ fontSize: 12.5 }}>
                      {a.detail}
                    </AppText>
                    <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                      {a.phone ? `${a.phone} · ` : ""}TP.HCM · Giao trực tiếp
                    </AppText>
                  </View>
                </Pressable>
              );
            })}

          {/* Action Row */}
          <View style={{ gap: space.sm, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="+ Thêm nơi gửi sách mới"
              disabled={disabled}
              onPress={() => setCreateOpen(true)}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: stitchTokens.wine,
                  backgroundColor: stitchTokens.parchment,
                },
                pressed && { opacity: 0.8, backgroundColor: stitchTokens.roseWarmSurface },
              ]}
            >
              <Icon name="plus" size={15} color={stitchTokens.wine} />
              <AppText kind="bold" color={stitchTokens.wine} style={{ fontSize: 13 }}>
                Thêm nơi gửi sách mới
              </AppText>
            </Pressable>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 2 }}>
              {value ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bỏ lựa chọn nơi gửi"
                  onPress={() => onChange(null)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <AppText kind="small" color={colors.rustText} style={{ fontWeight: "600", fontSize: 12 }}>
                    Bỏ chọn nơi gửi
                  </AppText>
                </Pressable>
              ) : <View />}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quản lý sổ địa chỉ"
                disabled={disabled}
                onPress={() => router.push("./addresses")}
                style={({ pressed }) => [
                  { flexDirection: "row", alignItems: "center", gap: 4 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <AppText kind="small" color={stitchTokens.wine} style={{ fontWeight: "600", fontSize: 12 }}>
                  Quản lý sổ địa chỉ →
                </AppText>
              </Pressable>
            </View>
          </View>
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
        Người mua có thể Mua ngay theo giá bạn niêm yết (cam kết giao sách trong 48 giờ). Địa chỉ chi tiết và số điện thoại chỉ dùng cho giao nhận nội bộ.
      </Notice>
    </View>
  );
}
