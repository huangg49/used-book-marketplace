import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { books, emptyDraft, sampleDraft, type Scenario } from "./model";
import {
  Button,
  Chip,
  Icon,
  Sheet,
  AppText as T,
  TextScale,
  colors as c,
  layout as s,
} from "../../core/ui";
import { ExploreScreen } from "./explore-screen";
import { DetailScreen } from "./detail-screen";
import { PublishScreen } from "./publish-screen";
type Screen = "explore" | "detail" | "publish" | "saved";
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const scenarios: { id: Scenario; name: string }[] = [
  { id: "normal", name: "Bình thường" },
  { id: "loading", name: "Đang tải" },
  { id: "offline", name: "Mất kết nối" },
  { id: "empty", name: "Không có kết quả" },
  { id: "missing", name: "Thiếu ảnh" },
  { id: "reserved", name: "Sách đã giữ chỗ" },
  { id: "restricted", name: "Tài khoản hạn chế" },
];
export function DesignPreview() {
  // Static export has no browser viewport. Match its first render before adding
  // the desktop review panel, otherwise React hydrates different text trees.
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const [screen, setScreen] = useState<Screen>("explore");
  const [returnShelf, setReturnShelf] = useState<"explore" | "saved">(
    "explore",
  );
  const [book, setBook] = useState(books[0]);
  const [saved, setSaved] = useState<string[]>([]);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [draft, setDraft] = useState(emptyDraft);
  const [lab, setLab] = useState(false);
  const [large, setLarge] = useState(false);
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "explore") return false;
      setScreen(screen === "detail" ? returnShelf : "explore");
      return true;
    });
    return () => listener.remove();
  }, [screen, returnShelf]);
  const save = (id: string) =>
    setSaved((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const navigate = (target: Screen) => {
    setScreen(target);
    setScenario("normal");
  };
  return (
    <TextScale.Provider value={large ? 1.35 : 1}>
      <SafeAreaView style={styles.outer} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <View style={styles.workspace}>
          {mounted && width >= 1080 ? (
            <View style={styles.context}>
              <T kind="label" color={c.rustText}>
                LẬT LẠI / THIẾT KẾ SẢN PHẨM
              </T>
              <T kind="title" color={c.forest}>
                Dấu chuyền tay,{"\n"}trên màn hình.
              </T>
              <T color={c.muted}>
                Ba màn hình React Native để kiểm chứng nhận diện bằng nội dung
                và thao tác.
              </T>
              {(
                [
                  ["explore", "01 · Khám phá sách"],
                  ["detail", "02 · Chi tiết listing"],
                  ["publish", "03 · Đăng sách"],
                ] as const
              ).map(([target, label]) => (
                <Button
                  key={target}
                  title={label}
                  secondary={screen !== target}
                  onPress={() => navigate(target)}
                />
              ))}
              <View style={s.rule} />
              <T kind="small" color={c.muted}>
                Dữ liệu mẫu, không tạo giao dịch. Ảnh sách lưu trữ được ghi
                nguồn ở màn hình chi tiết. Bản nháp và sách đã lưu chỉ giữ trong
                phiên.
              </T>
              <Button
                title="Tình huống kiểm thử"
                secondary
                onPress={() => setLab(true)}
              />
            </View>
          ) : null}
          <View style={styles.device}>
            <View style={styles.previewBar}>
              <T kind="label" color={c.muted} style={{ flex: 1 }}>
                THIẾT KẾ · DỮ LIỆU MẪU
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mở tình huống kiểm thử"
                onPress={() => setLab(true)}
                style={[s.row, { minHeight: 44 }]}
              >
                <T kind="small" color={c.forest}>
                  Kiểm thử
                </T>
                <Icon name="tune" size={16} />
              </Pressable>
            </View>
            <View
              style={{
                flex: 1,
                display:
                  screen === "explore" || screen === "saved" ? "flex" : "none",
              }}
            >
              <ExploreScreen
                onOpen={(b) => {
                  setReturnShelf(screen === "saved" ? "saved" : "explore");
                  setBook(b);
                  setScreen("detail");
                }}
                saved={saved}
                onSave={save}
                savedOnly={screen === "saved"}
                scenario={scenario}
                onRetry={() => setScenario("normal")}
              />
            </View>
            {screen === "detail" ? (
              <DetailScreen
                key={book.id}
                book={book}
                scenario={scenario}
                onBack={() => setScreen(returnShelf)}
                saved={saved.includes(book.id)}
                onSave={() => save(book.id)}
              />
            ) : null}
            <View
              style={{
                flex: 1,
                display: screen === "publish" ? "flex" : "none",
              }}
            >
              <PublishScreen
                draft={draft}
                setDraft={setDraft}
                scenario={scenario}
                onExit={() => navigate("explore")}
              />
            </View>
            {screen !== "detail" ? (
              <View accessibilityRole="tablist" style={styles.tabs}>
                {(
                  [
                    { id: "explore", name: "Khám phá", icon: "book" },
                    {
                      id: "saved",
                      name: `Đã lưu${saved.length ? ` (${saved.length})` : ""}`,
                      icon: "bookmark",
                    },
                    { id: "publish", name: "Đăng sách", icon: "plus" },
                  ] as const
                ).map((tab) => (
                  <Pressable
                    key={tab.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: screen === tab.id }}
                    onPress={() => navigate(tab.id)}
                    style={styles.tab}
                  >
                    <Icon
                      name={tab.icon}
                      color={screen === tab.id ? c.forest : c.muted}
                    />
                    <T
                      kind="small"
                      color={screen === tab.id ? c.forest : c.muted}
                    >
                      {tab.name}
                    </T>
                    <View
                      style={{
                        height: 2,
                        width: 20,
                        backgroundColor:
                          screen === tab.id ? c.terracotta : "transparent",
                      }}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <Sheet
          title="Tình huống kiểm thử"
          visible={lab}
          onClose={() => setLab(false)}
        >
          <T kind="small" color={c.muted}>
            Bảng điều khiển bản thiết kế. Không thay đổi tài khoản hay dữ liệu
            thật.
          </T>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {scenarios.map((item) => (
              <Chip
                key={item.id}
                title={item.name}
                selected={scenario === item.id}
                onPress={() => {
                  setScenario(item.id);
                  if (item.id === "reserved") setScreen("detail");
                  if (["loading", "empty"].includes(item.id))
                    setScreen("explore");
                  setLab(false);
                }}
              />
            ))}
          </View>
          <Chip
            title={large ? "Chữ lớn: đang bật (135%)" : "Thử chữ lớn (135%)"}
            selected={large}
            onPress={() => setLarge((v) => !v)}
          />
          <Button
            title="Điền bản nháp mẫu hợp lệ"
            secondary
            onPress={() => {
              setDraft(sampleDraft());
              setScenario("normal");
              setScreen("publish");
              setLab(false);
            }}
          />
          <T kind="small" color={c.muted}>
            Các trạng thái tải, mạng và quyền ở đây được mô phỏng. Bản thiết kế
            không gọi API marketplace.
          </T>
        </Sheet>
      </SafeAreaView>
    </TextScale.Provider>
  );
}
const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: c.paper },
  workspace: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 80,
  },
  context: {
    width: 340,
    justifyContent: "center",
    gap: 22,
    paddingVertical: 32,
  },
  device: {
    flex: 1,
    maxWidth: 480,
    backgroundColor: c.paper,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: c.rule,
  },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: c.successSurface,
    borderBottomWidth: 1,
    borderColor: c.rule,
  },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: c.rule,
    backgroundColor: c.paper,
    paddingVertical: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 58,
    paddingHorizontal: 4,
  },
});
