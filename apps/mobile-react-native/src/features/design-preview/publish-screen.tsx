import { CoverImage } from "./primitives";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  books,
  modeLabel,
  money,
  normalize,
  validateStep,
  type Condition,
  type Draft,
  type Mode,
  type Scenario,
} from "./model";
import {
  Button,
  Chip,
  Icon,
  IconButton,
  Notice,
  TextField,
  SearchField,
  Checkbox as Check,
  Sheet,
  AppText as T,
  colors as c,
  layout as s,
} from "../../core/ui";
const steps = [
  "Chọn đầu sách",
  "Ảnh & tình trạng",
  "Bán hoặc đổi",
  "Kiểm tra lại",
];
export function PublishScreen({
  draft,
  setDraft,
  scenario,
  onExit,
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  scenario: Scenario;
  onExit: () => void;
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const selected = books.find((b) => b.id === draft.bookId);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors([]);
  };
  const move = (next: number) => {
    setStep(next);
    setErrors([]);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const advance = () => {
    const nextErrors = validateStep(draft, step);
    if (nextErrors.length) {
      setErrors(nextErrors);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (step < 3) {
      move(step + 1);
      return;
    }
    if (scenario === "restricted") {
      setErrors(["Tài khoản đang hạn chế đăng sách."]);
      return;
    }
    if (scenario === "offline") {
      setErrors([
        "Chưa có kết nối. Nội dung đang được giữ trong phiên xem thử; thử lại khi kết nối trở lại.",
      ]);
      return;
    }
    setDone(true);
  };
  const pick = async () => {
    if (picking || draft.photos.length >= 8) return;
    setPicking(true);
    setPhotoError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 8 - draft.photos.length,
        quality: 1,
      });
      if (!result.canceled) {
        const assets = result.assets.filter((a) => a.type !== "video");
        const oversized = assets.some(
          (a) => (a.fileSize ?? 0) > 10 * 1024 * 1024,
        );
        if (oversized) {
          setPhotoError("Ảnh cần nhỏ hơn hoặc bằng 10 MB trong bản xem thử.");
          return;
        }
        setDraft((d) => ({
          ...d,
          photos: [
            ...d.photos,
            ...assets.map((a, i) => ({ id: `${Date.now()}-${i}`, uri: a.uri })),
          ].slice(0, 8),
        }));
        setErrors([]);
      }
    } catch {
      setPhotoError(
        "Chưa mở được thư viện ảnh. Kiểm tra quyền truy cập ảnh rồi thử lại.",
      );
    } finally {
      setPicking(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[s.row, s.pad, { paddingVertical: 8 }]}>
        <IconButton
          name="back"
          label={step ? "Về bước trước" : "Về khám phá"}
          onPress={() => (step ? move(step - 1) : onExit())}
        />
        <T kind="heading" color={c.forest} style={{ flex: 1 }}>
          Đăng sách
        </T>
        <T
          kind="small"
          color={c.muted}
          style={{ flexShrink: 1, textAlign: "right" }}
        >
          Nháp trong phiên
        </T>
      </View>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 20,
          gap: 12,
        }}
      >
        <View style={s.row}>
          <T kind="label" color={c.rustText}>
            0{step + 1} / 04
          </T>
          <T kind="bold" style={{ flex: 1 }}>
            {steps[step]}
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {steps.map((label, i) => (
            <View
              key={label}
              style={{
                height: 3,
                flex: 1,
                backgroundColor: i <= step ? c.forest : c.rule,
              }}
            />
          ))}
        </View>
      </View>
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          s.pad,
          { paddingTop: 0, gap: 20, paddingBottom: 32 },
        ]}
      >
        {errors.length ? <Notice error>{errors.join("\n")}</Notice> : null}
        {scenario === "restricted" ? (
          <Notice error>
            Tài khoản đang hạn chế đăng sách. Bạn có thể xem bản nháp, nhưng
            chưa thể gửi duyệt.
          </Notice>
        ) : null}
        {step === 0 ? (
          <>
            <View style={{ gap: 8 }}>
              <T kind="title" color={c.forest}>
                Cuốn sách nào sẽ{"\n"}được đọc tiếp?
              </T>
              <T color={c.muted}>
                Chọn đúng đầu sách và ấn bản. Tình trạng của riêng cuốn sách này
                sẽ được thêm ở bước sau.
              </T>
            </View>
            <SearchField
              label="Tìm đầu sách để đăng"
              value={query}
              onChangeText={setQuery}
              placeholder="Tên sách hoặc tác giả"
            />
            {books
              .filter((b) =>
                normalize(b.title + " " + b.author).includes(normalize(query)),
              )
              .map((b) => (
                <Pressable
                  key={b.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: draft.bookId === b.id }}
                  accessibilityLabel={`Chọn ${b.title}`}
                  onPress={() => update("bookId", b.id)}
                  style={[
                    styles.catalog,
                    draft.bookId === b.id && {
                      borderColor: c.forest,
                      backgroundColor: c.successSurface,
                    },
                  ]}
                >
                  <CoverImage
                    cover={b.cover}
                    label={`Bìa ${b.title}`}
                    style={{ width: 52, height: 74 }}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <T kind="card" color={c.forest}>
                      {b.title}
                    </T>
                    <T kind="small" color={c.muted}>
                      {b.author}
                    </T>
                    <T kind="small" color={c.muted}>
                      {b.edition}
                    </T>
                  </View>
                  <Icon
                    name={draft.bookId === b.id ? "check" : "plus"}
                    size={20}
                  />
                </Pressable>
              ))}
            {!books.some((b) =>
              normalize(b.title + " " + b.author).includes(normalize(query)),
            ) ? (
              <Notice>
                Chưa có đầu sách phù hợp trong dữ liệu mẫu. Thử tìm “Jane” hoặc
                “Alice”.
              </Notice>
            ) : null}
          </>
        ) : step === 1 ? (
          <>
            <View style={{ gap: 8 }}>
              <T kind="heading" color={c.forest}>
                Để người đọc sau thấy rõ.
              </T>
              <T color={c.muted}>
                Chụp bìa, gáy sách và những trang có ghi chú. Ảnh đầu tiên là
                ảnh đại diện.
              </T>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {draft.photos.map((p, i) => (
                <View key={p.id} style={{ width: 94 }}>
                  <CoverImage
                    cover={p.cover}
                    uri={p.uri}
                    label={`Ảnh sách ${i + 1}`}
                    style={{ height: 116 }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ảnh ${i + 1}`}
                    onPress={() =>
                      update(
                        "photos",
                        draft.photos.filter((x) => x.id !== p.id),
                      )
                    }
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <T kind="small" color={c.rustText}>
                      Xóa ảnh {i + 1}
                    </T>
                  </Pressable>
                </View>
              ))}
              {draft.photos.length < 8 ? (
                <Pressable
                  disabled={picking}
                  accessibilityRole="button"
                  accessibilityLabel="Thêm ảnh sách"
                  onPress={() => {
                    void pick();
                  }}
                  style={styles.addPhoto}
                >
                  <Icon name="plus" />
                  <T kind="small">{picking ? "Đang mở…" : "Thêm ảnh"}</T>
                  <T kind="small" color={c.muted}>
                    {draft.photos.length}/8
                  </T>
                </Pressable>
              ) : null}
            </View>
            {photoError ? <Notice error>{photoError}</Notice> : null}
            <T kind="small" color={c.muted}>
              Ảnh được xem tại thiết bị; bản thử chưa tải ảnh lên máy chủ. Tải
              lại sẽ xóa nháp.
            </T>
            <T kind="bold">Tình trạng tổng thể</T>
            <View style={styles.choices}>
              {(["Như mới", "Tốt", "Khá", "Cũ"] as Condition[]).map((v) => (
                <Chip
                  key={v}
                  title={v}
                  selected={draft.condition === v}
                  onPress={() => update("condition", v)}
                />
              ))}
            </View>
            <TextField
              label="Trang sách"
              placeholder="Ví dụ: Đủ trang, có vài trang ố nhẹ"
              value={draft.pages}
              onChangeText={(v) => update("pages", v)}
            />
            <TextField
              label="Bìa và gáy"
              placeholder="Nếp gấp, trầy xước, tình trạng gáy…"
              value={draft.coverNote}
              onChangeText={(v) => update("coverNote", v)}
            />
            <TextField
              label="Ghi chú trong sách"
              placeholder="Nếu không có, ghi “Không có”"
              value={draft.notes}
              onChangeText={(v) => update("notes", v)}
            />
            <TextField
              label="Phụ kiện đi kèm"
              placeholder="Bìa áo, bookmark hoặc không có"
              value={draft.accessories}
              onChangeText={(v) => update("accessories", v)}
            />
            <Check
              title="Sách thiếu trang hoặc phần nội dung trọng yếu"
              checked={draft.missingPages}
              onPress={() => update("missingPages", !draft.missingPages)}
            />
          </>
        ) : step === 2 ? (
          <>
            <T kind="heading" color={c.forest}>
              Bạn muốn chuyền tay thế nào?
            </T>
            <View style={styles.choices}>
              {(["sale", "exchange", "both"] as Mode[]).map((v) => (
                <Chip
                  key={v}
                  title={modeLabel[v]}
                  selected={draft.mode === v}
                  onPress={() => update("mode", v)}
                />
              ))}
            </View>
            {draft.mode !== "exchange" ? (
              <TextField
                label="Giá bán (đồng)"
                placeholder="125000"
                keyboardType="number-pad"
                value={draft.price}
                onChangeText={(v) => update("price", v)}
              />
            ) : null}
            {draft.mode !== "sale" ? (
              <TextField
                label="Giá trị đổi (đồng)"
                placeholder="125000"
                keyboardType="number-pad"
                value={draft.exchangeValue}
                onChangeText={(v) => update("exchangeValue", v)}
              />
            ) : null}
            <T kind="small" color={c.muted}>
              Nhập số tiền từ 10.000 đến 1.000.000 đồng. Giá trị đổi không phải
              tiền bán.
            </T>
            <TextField
              label="Thông tin thêm"
              placeholder="Điều người mua nên biết hoặc loại sách bạn muốn đổi…"
              multiline
              value={draft.description}
              onChangeText={(v) => update("description", v)}
            />
          </>
        ) : (
          <>
            <T kind="heading" color={c.forest}>
              Xem lại trước khi gửi.
            </T>
            <View style={[s.row, { alignItems: "flex-start" }]}>
              <CoverImage
                cover={draft.photos[0]?.cover}
                uri={draft.photos[0]?.uri}
                label="Ảnh đại diện bản nháp"
                style={{ width: 90, height: 126 }}
              />
              <View style={{ flex: 1, gap: 6 }}>
                <T kind="card" color={c.forest}>
                  {selected?.title}
                </T>
                <T kind="small">{selected?.author}</T>
                <T kind="small" color={c.rustText}>
                  {draft.condition} · {modeLabel[draft.mode]}
                </T>
                {draft.mode !== "exchange" ? (
                  <T kind="bold">Bán: {money(Number(draft.price))}</T>
                ) : null}
                {draft.mode !== "sale" ? (
                  <T kind="bold">Đổi: {money(Number(draft.exchangeValue))}</T>
                ) : null}
              </View>
            </View>
            <View style={s.rule} />
            {[
              ["Trang sách", draft.pages],
              ["Bìa và gáy", draft.coverNote],
              ["Ghi chú", draft.notes],
              ["Phụ kiện", draft.accessories],
              ["Thông tin thêm", draft.description],
            ].map(([label, value]) => (
              <View key={label} style={{ gap: 3 }}>
                <T kind="small" color={c.muted}>
                  {label}
                </T>
                <T>{value}</T>
              </View>
            ))}
            <Check
              title="Tôi có quyền đăng cuốn sách này và đã mô tả đúng tình trạng."
              checked={draft.ownsBook}
              onPress={() => update("ownsBook", !draft.ownsBook)}
            />
            <Notice>
              Listing cần được kiểm duyệt trước khi xuất hiện công khai. Bản
              thiết kế này chỉ mô phỏng bước gửi, không tạo listing thật.
            </Notice>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={step === 3 ? "Gửi duyệt thử" : "Tiếp tục"}
          disabled={step === 3 && scenario === "restricted"}
          onPress={advance}
        />
      </View>
      <Sheet
        title="Đã hoàn tất bản xem thử"
        visible={done}
        onClose={() => setDone(false)}
      >
        <Icon name="check" size={36} />
        <T kind="heading">Sẵn sàng cho người đọc tiếp theo.</T>
        <T>
          Trong sản phẩm, cuốn sách sẽ chuyển sang “Chờ duyệt”. Phiên thử này
          chưa gửi ảnh hay nội dung đến máy chủ.
        </T>
        <Button
          title="Về kệ sách"
          onPress={() => {
            setDone(false);
            onExit();
          }}
        />
        <Button
          title="Xem lại bản nháp"
          secondary
          onPress={() => setDone(false)}
        />
      </Sheet>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  catalog: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: c.rule,
    backgroundColor: c.surface,
    borderRadius: 6,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addPhoto: {
    width: 94,
    minHeight: 116,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: c.rule,
    backgroundColor: c.paper,
  },
});
