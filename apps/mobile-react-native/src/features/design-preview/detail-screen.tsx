import { CoverImage } from "./primitives";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { type Book, type Scenario, modeLabel, money } from "./model";
import {
  Button,
  BookPrice,
  BookCondition,
  Icon,
  IconButton,
  Notice,
  Sheet,
  AppText as T,
  colors as c,
  layout as s,
} from "../../core/ui";
const attribution: Record<
  string,
  { name: string; url: string; license: string; licenseUrl: string }
> = {
  pride: {
    name: "National Library NZ on The Commons",
    url: "https://commons.wikimedia.org/wiki/File:AUSTEN(1894)_Pride_and_prejudice_(15811958311).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
  },
  alice: {
    name: "Lewis Carroll / Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_(1865).jpg",
    license: "Public domain",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  oz: {
    name: "W. W. Denslow / Wikimedia Commons",
    url: "https://commons.wikimedia.org/wiki/File:The_Wonderful_Wizard_of_Oz_first_edition_cover.jpg",
    license: "Public domain",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
};
export function DetailScreen({
  book,
  scenario,
  onBack,
  saved,
  onSave,
}: {
  book: Book;
  scenario: Scenario;
  onBack: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const [sheet, setSheet] = useState<
    "photo" | "buy" | "exchange" | "source" | null
  >(null);
  const blocked =
    scenario === "reserved" ||
    scenario === "restricted" ||
    scenario === "offline";
  const source = attribution[book.id];
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.row, s.pad, { paddingVertical: 8 }]}>
        <IconButton name="back" label="Quay lại kệ sách" onPress={onBack} />
        <T
          kind="small"
          color={c.muted}
          style={{ flex: 1, textAlign: "center" }}
        >
          MỘT CUỐN SÁCH / MỘT HÀNH TRÌNH
        </T>
        <IconButton
          name="bookmark"
          label={saved ? "Bỏ lưu sách" : "Lưu sách"}
          selected={saved}
          onPress={onSave}
        />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={styles.photoArea}>
          <CoverImage
            cover={book.cover}
            missing={scenario === "missing"}
            label={`Ảnh lưu trữ của ${book.title}`}
            style={{
              height: !book.cover || scenario === "missing" ? 180 : 300,
              width: "100%",
              padding: 20,
            }}
          />
          {book.cover && scenario !== "missing" ? (
            <View style={{ position: "absolute", bottom: 12, right: 16 }}>
              <IconButton
                name="image"
                label="Phóng to ảnh sách"
                onPress={() => setSheet("photo")}
              />
            </View>
          ) : null}
        </View>
        <View style={[s.pad, { gap: 18 }]}>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", flexWrap: "wrap" },
            ]}
          >
            <BookCondition
              condition={book.condition}
              mode={modeLabel[book.mode]}
            />
            <T kind="small" color={c.muted}>
              {book.category}
            </T>
          </View>
          <View style={{ gap: 6 }}>
            <T kind="title" color={c.forest}>
              {book.title}
            </T>
            <T>{book.author}</T>
            <T kind="small" color={c.muted}>
              {book.edition}
            </T>
          </View>
          <BookPrice sale={book.price} exchange={book.exchangeValue} />
          <T kind="small" color={c.muted}>
            Phí vận chuyển được xác định ở bước giao dịch.
          </T>
          {blocked ? (
            <Notice error>
              {scenario === "reserved"
                ? "Cuốn sách đã được giữ cho một giao dịch khác."
                : scenario === "restricted"
                  ? "Tài khoản đang hạn chế giao dịch. Bạn vẫn có thể xem sách."
                  : "Chưa có kết nối. Cần kiểm tra lại tình trạng sách trước khi giao dịch."}
            </Notice>
          ) : null}
          <View style={s.rule} />
          <T kind="heading" color={c.forest}>
            Trước khi chuyền tay
          </T>
          <T>{book.description}</T>
          {source ? (
            <Notice>
              Ảnh lưu trữ minh họa thiết kế. Đây không phải ảnh xác nhận tình
              trạng một bản sách đang bán.
            </Notice>
          ) : null}
          {source ? (
            <Button
              title="Nguồn ảnh & quyền sử dụng"
              secondary
              onPress={() => setSheet("source")}
            />
          ) : null}
          <View style={s.rule} />
          <View style={s.row}>
            <View style={styles.avatar}>
              <T kind="heading" color={c.forest}>
                {book.seller.charAt(0)}
              </T>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T kind="bold">{book.seller}</T>
              <View style={s.row}>
                <Icon name="pin" size={14} />
                <T kind="small" color={c.muted}>
                  {book.location}
                </T>
              </View>
            </View>
          </View>
          <T kind="small" color={c.muted}>
            Chưa có đánh giá trong dữ liệu mẫu.
          </T>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        {book.mode !== "sale" ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Đề nghị đổi"
              secondary={book.mode === "both"}
              disabled={blocked}
              onPress={() => {
                if (!blocked) setSheet("exchange");
              }}
            />
          </View>
        ) : null}
        {book.mode !== "exchange" ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Chọn mua"
              disabled={blocked}
              onPress={() => {
                if (!blocked) setSheet("buy");
              }}
            />
          </View>
        ) : null}
      </View>
      <Sheet
        title={
          sheet === "photo"
            ? "Xem ảnh sách"
            : sheet === "source"
              ? "Nguồn ảnh"
              : sheet === "buy"
                ? "Bạn muốn đọc cuốn này?"
                : "Đổi sách, đọc tiếp"
        }
        visible={sheet !== null}
        onClose={() => setSheet(null)}
      >
        {sheet === "photo" ? (
          <CoverImage
            cover={book.cover}
            label={`Ảnh lớn ${book.title}`}
            style={{ height: 400 }}
          />
        ) : sheet === "source" && source ? (
          <>
            <T>{source.name}</T>
            <T kind="small">
              {source.license} · Tệp gốc không chỉnh sửa. Chỉ thay đổi kích
              thước hiển thị.
            </T>
            <Button
              title="Xem trang nguồn"
              onPress={() => {
                void Linking.openURL(source.url);
              }}
            />
            <Button
              title="Xem quyền sử dụng"
              secondary
              onPress={() => {
                void Linking.openURL(source.licenseUrl);
              }}
            />
          </>
        ) : (
          <>
            <T kind="heading">{book.title}</T>
            <T>
              {sheet === "buy"
                ? `Giá sách: ${money(book.price ?? 0)}. Bước tiếp theo sẽ chọn địa chỉ, kiểm tra phí và tình trạng sách.`
                : "Bước tiếp theo sẽ chọn một cuốn sách của bạn để đề nghị trao đổi. Chưa có sách nào được giữ chỗ."}
            </T>
            <Notice>
              Bạn đang xem thiết kế. Chưa tạo đơn, đề nghị đổi hoặc thanh toán.
            </Notice>
            <Button title="Quay lại xem sách" onPress={() => setSheet(null)} />
          </>
        )}
      </Sheet>
    </View>
  );
}
const styles = StyleSheet.create({
  photoArea: {
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderColor: c.rule,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.leaf,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    backgroundColor: c.paper,
    borderTopWidth: 1,
    borderColor: c.rule,
  },
});
