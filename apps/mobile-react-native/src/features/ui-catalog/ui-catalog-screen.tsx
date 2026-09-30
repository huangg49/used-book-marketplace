import { useRef, useState } from "react";
import { View, type ScrollView } from "react-native";
import { Link } from "expo-router";
import {
  ActionBar,
  AppText,
  ActionRow,
  BackAction,
  BookCondition,
  BookCover,
  BookPrice,
  BookTradeBar,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  IconButton,
  Notice,
  Screen,
  SearchField,
  Sheet,
  StatePanel,
  TextField,
  TextScale,
  colors,
  layout,
  space,
} from "../../core/ui";

const sections = [
  "Nút",
  "Nhập liệu",
  "Phản hồi",
  "Hộp thoại",
  "Sách",
  "Chữ",
] as const;
type Section = (typeof sections)[number];
export function UiCatalogScreen() {
  const scroll = useRef<ScrollView>(null);
  const [section, setSection] = useState<Section>("Nút");
  const [large, setLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [fail, setFail] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<"loading" | "empty" | "error">("empty");
  return (
    <TextScale.Provider value={large ? 1.35 : 1}>
      <Screen
        scrollRef={scroll}
        compactFooter
        footer={
          section === "Sách" ? (
            <BookTradeBar sale={125000} exchange={150000}>
              <AppText kind="annotation" color={colors.muted}>
                Tiệm chưa nhận đơn ở bản này.
              </AppText>
            </BookTradeBar>
          ) : undefined
        }
      >
        <AppText kind="label" color={colors.rustText}>
          LẬT LẠI / THƯ VIỆN GIAO DIỆN
        </AppText>
        <AppText kind="title" color={colors.forest}>
          Cùng một nét,{"\n"}qua từng màn hình.
        </AppText>
        <AppText color={colors.muted}>
          Mẫu chạy trực tiếp từ component dùng chung. Các thao tác ở đây chỉ
          thay đổi dữ liệu mẫu trong phiên.
        </AppText>
        <Link href="/design" accessibilityLabel="Mở ba màn hình mẫu">
          <AppText
            color={colors.forest}
            style={{ textDecorationLine: "underline", paddingVertical: 12 }}
          >
            Xem ba màn hình ứng dụng →
          </AppText>
        </Link>
        <Checkbox
          title="Thử chữ lớn 135%"
          checked={large}
          onPress={() => setLarge((v) => !v)}
        />
        <AppText kind="small" color={colors.muted}>
          Kiểm Android: nhập ở nhóm Nhập liệu, đổi cỡ chữ trong cài đặt hệ thống
          rồi trở lại. Nội dung phải còn, nhãn nút phải hiện đầy đủ. Chế độ 135%
          ở đây không thay cho kiểm cỡ chữ hệ thống.
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {sections.map((item) => (
            <Chip
              key={item}
              title={item}
              selected={section === item}
              onPress={() => {
                setSection(item);
                setNotice("");
              }}
            />
          ))}
        </View>
        <View style={layout.rule} />
        <AppText kind="heading" accessibilityRole="header">
          {section}
        </AppText>
        {notice ? (
          <Notice tone="success" onDismiss={() => setNotice("")}>
            {notice}
          </Notice>
        ) : null}
        {section === "Nút" ? (
          <>
            <BackAction
              title="Về kệ sách"
              onPress={() =>
                setNotice("Thao tác quay lại mẫu; chưa điều hướng.")
              }
            />
            <BackAction
              title="Quay lại danh sách những cuốn sách đang chờ bạn đọc tiếp"
              disabled
              onPress={() => {}}
            />
            <Button
              title="Tiếp tục"
              onPress={() => setNotice("Đã nhận thao tác mẫu.")}
            />
            <Button
              title="Xem lại thông tin"
              secondary
              onPress={() => setNotice("Bạn có thể tiếp tục chỉnh sửa.")}
            />
            <Button title="Chưa đủ điều kiện" disabled onPress={() => {}} />
            <Checkbox
              title="Bật trạng thái đang xử lý"
              checked={busy}
              onPress={() => setBusy((v) => !v)}
            />
            <Button
              title="Gửi duyệt"
              busy={busy}
              onPress={() =>
                setNotice("Đây là thao tác mẫu, chưa gửi dữ liệu.")
              }
            />
            <AppText kind="bold">Thanh hành động cuối màn hình</AppText>
            <View
              style={{
                borderTopWidth: 1,
                borderColor: colors.rule,
                paddingTop: space.lg,
              }}
            >
              <ActionBar note={busy ? undefined : "Có thay đổi chưa lưu."}>
                <Button
                  key="save"
                  secondary
                  title="Lưu nháp"
                  onPress={() => setNotice("Đã lưu mẫu, chưa gửi dữ liệu.")}
                />
                <Button
                  key="next"
                  title="Tiếp tục"
                  busy={busy}
                  onPress={() => setNotice("Chuyển bước mẫu.")}
                />
              </ActionBar>
            </View>
            <AppText kind="small" color={colors.muted}>
              Dùng trong Screen.footer: hành động phụ bên trái, chính bên phải,
              luôn nằm trên bàn phím.
            </AppText>
            <View style={layout.row}>
              <IconButton
                name="bookmark"
                label={checked ? "Bỏ lưu sách mẫu" : "Lưu sách mẫu"}
                selected={checked}
                onPress={() => setChecked((v) => !v)}
              />
              <AppText style={{ flex: 1 }}>
                Nút biểu tượng luôn có tên cho trình đọc màn hình.
              </AppText>
            </View>
          </>
        ) : section === "Nhập liệu" ? (
          <>
            <SearchField
              label="Tìm sách mẫu"
              submitLabel="Tìm sách mẫu trên kệ"
              placeholder="Tên sách, tác giả hoặc ISBN"
              value={search}
              onChangeText={setSearch}
              maxLength={400}
              onSubmitEditing={() =>
                setNotice(
                  "Đã nhận tìm kiếm mẫu: " + (search.trim() || "tất cả sách"),
                )
              }
            />
            <TextField
              label="Tên người nhận"
              required
              value={name}
              onChangeText={setName}
              placeholder="Ví dụ: An"
              hint="Tên để người gửi biết bạn là ai. Dấu * là trường bắt buộc."
              error={
                attempted && !name.trim()
                  ? "Nhập tên người nhận trước khi tiếp tục."
                  : undefined
              }
            />
            <TextField
              label="Ghi chú"
              multiline
              placeholder="Điều bạn muốn nhắn lại…"
            />
            <TextField
              label="Thông tin chỉ đọc"
              value="Bản nháp mẫu"
              editable={false}
            />
            <Button
              title="Kiểm tra thông tin"
              onPress={() => {
                setAttempted(true);
                if (name.trim()) setNotice("Thông tin mẫu hợp lệ.");
              }}
            />
            <Checkbox
              title="Tôi đã kiểm tra lại thông tin."
              checked={checked}
              onPress={() => setChecked((v) => !v)}
            />
            <AppText kind="small">
              Trạng thái trình đọc màn hình: {checked ? "đã chọn" : "chưa chọn"}
              .
            </AppText>
            <Checkbox
              title="Lựa chọn đã lưu, đang khóa chỉnh sửa"
              checked
              disabled
              onPress={() => {}}
            />
          </>
        ) : section === "Phản hồi" ? (
          <>
            <Notice tone="info">
              Ảnh đầu tiên sẽ là ảnh đại diện của cuốn sách.
            </Notice>
            <Notice tone="success">Đã lưu sách trong phiên xem thử.</Notice>
            <Notice tone="warning">
              Sách đã có người giữ chỗ. Bạn vẫn có thể xem thông tin.
            </Notice>
            <Notice tone="error">
              Chưa gửi được. Nội dung đã nhập vẫn ở trên màn hình.
            </Notice>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip
                title="Đang tải"
                selected={state === "loading"}
                onPress={() => setState("loading")}
              />
              <Chip
                title="Rỗng"
                selected={state === "empty"}
                onPress={() => setState("empty")}
              />
              <Chip
                title="Lỗi tải"
                selected={state === "error"}
                onPress={() => setState("error")}
              />
            </View>
            {state === "loading" ? (
              <StatePanel loading title="Đang tải kệ sách" />
            ) : state === "empty" ? (
              <StatePanel
                icon="bookmark"
                title="Giữ lại một cuốn bạn thích."
                message="Chạm dấu trang trên bìa sách để lưu lại."
              />
            ) : (
              <StatePanel
                icon="wifi"
                title="Chưa kết nối được"
                message="Kiểm tra mạng rồi thử lại nhé."
                action={{
                  label: "Thử tải lại",
                  onPress: () => {
                    setState("empty");
                    setNotice("Đã thử lại bằng dữ liệu mẫu.");
                  },
                }}
              />
            )}
          </>
        ) : section === "Hộp thoại" ? (
          <>
            <AppText>
              Chỉ ngắt luồng khi cần một quyết định. Lỗi có thể sửa tại ô nhập
              hoặc vùng nội dung được hiển thị tại đó.
            </AppText>
            <Button
              title="Mở bảng thông tin"
              secondary
              onPress={() => setSheet(true)}
            />
            <Checkbox
              title="Mô phỏng lần xác nhận đầu thất bại"
              checked={fail}
              onPress={() => setFail((v) => !v)}
            />
            <Button
              title="Thử bỏ bản nháp mẫu"
              secondary
              onPress={() => {
                setError("");
                setConfirm(true);
              }}
            />
            <Sheet
              title="Trước khi chuyền tay"
              visible={sheet}
              onClose={() => setSheet(false)}
              footer={
                <Button title="Đã hiểu" onPress={() => setSheet(false)} />
              }
            >
              <AppText>
                Chụp rõ bìa, gáy sách và những trang có ghi chú. Người đọc sau
                cần thấy đúng tình trạng của cuốn sách.
              </AppText>
              {Array.from({ length: 8 }, (_, index) => (
                <AppText key={index}>
                  Mục minh họa {index + 1}: nội dung cuộn, nút Đã hiểu luôn ở
                  cuối bảng và không cuộn theo nội dung.
                </AppText>
              ))}
            </Sheet>
            <ActionRow
              title="Ví mô phỏng — dòng điều hướng mẫu"
              description="Biểu tượng, nhãn và mô tả; đây là dữ liệu mẫu."
              icon="wallet"
              onPress={() => setSheet(true)}
            />
            <ConfirmDialog
              title="Bỏ bản nháp mẫu?"
              message="Chỉ xóa nội dung minh họa của trang này. Bạn có thể quay lại để tiếp tục xem."
              visible={confirm}
              confirmLabel="Bỏ bản nháp mẫu"
              destructive
              error={error}
              onCancel={() => setConfirm(false)}
              onConfirm={() => {
                if (fail) {
                  setError(
                    "Chưa thể hoàn tất. Bản nháp mẫu vẫn được giữ; bạn có thể thử lại.",
                  );
                  setFail(false);
                  return;
                }
                setConfirm(false);
                setName("");
                setAttempted(false);
                setNotice("Đã bỏ bản nháp mẫu.");
              }}
            />
          </>
        ) : section === "Sách" ? (
          <>
            <BookCover
              source={require("../../../assets/design/pride.jpg")}
              label="Bìa lưu trữ Pride and Prejudice"
              cachePolicy="none"
              style={{ height: 240, padding: 16 }}
            />
            <AppText kind="small" color={colors.muted}>
              Ảnh lưu trữ National Library NZ, CC BY 2.0; nguồn đầy đủ ở màn
              hình chi tiết trong bản mẫu.
            </AppText>
            <BookCondition condition="Tốt" mode="Bán hoặc đổi" />
            <BookCondition stamp condition="Cũ nhiều" mode="Bán hoặc đổi" />
            <AppText kind="bookTitle">Phiếu sách · màn chuẩn UI-1</AppText>
            <AppText kind="reading">
              Gáy có nếp đọc, trang ngả vàng. Nội dung mẫu để kiểm chữ lớn.
            </AppText>
            <BookPrice reading sale={1000000} exchange={125000} />
            <AppText kind="card">
              Những ngày đi bộ qua thành phố và những câu chuyện còn ở lại trong
              một cuốn sổ
            </AppText>
            <BookPrice sale={1000000} exchange={125000} />
            <BookCover label="Sách chưa có ảnh" style={{ height: 160 }} />
            <BookCover
              source={{
                uri: "https://invalid.example.test/missing-cover.webp",
              }}
              cachePolicy="none"
              onError={() =>
                setNotice(
                  "Ảnh thử nghiệm không tải được; fallback vẫn giữ nhãn.",
                )
              }
              label="Ảnh cố ý lỗi để kiểm tra fallback"
              style={{ height: 160 }}
            />
          </>
        ) : (
          <>
            <AppText kind="title" color={colors.forest}>
              Sách cũ. Chương mới.
            </AppText>
            <AppText kind="heading">Đọc xong. Đọc tiếp.</AppText>
            <AppText>
              Ắ ằ Ặ ấ ễ ộ ớ ự · Lật lại · Nguyễn Nhật Ánh. Nội dung phải đọc rõ
              trước khi trở thành một chi tiết trang trí.
            </AppText>
            <AppText kind="price">1.000.000 ₫</AppText>
            <AppText kind="small" color={colors.muted}>
              Giá dùng Be Vietnam Pro để giữ đúng ký hiệu đồng.
            </AppText>
          </>
        )}
        <Button
          secondary
          selected={checked}
          title={checked ? "Lựa chọn đang bật" : "Bật lựa chọn"}
          onPress={() => setChecked((v) => !v)}
        />
        <Button
          secondary
          title="Về đầu nội dung"
          onPress={() => scroll.current?.scrollTo({ y: 0, animated: false })}
        />
      </Screen>
    </TextScale.Provider>
  );
}
