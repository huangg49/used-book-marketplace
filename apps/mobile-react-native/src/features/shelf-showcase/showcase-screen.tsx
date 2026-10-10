import { useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  AppText,
  BackAction,
  BookCover,
  Button,
  Chip,
  Notice,
  Screen,
  Sheet,
  colors,
  space,
} from "../../core/ui";
import { ShelfResults } from "../shelf/shelf-results";
import { BookPresentation } from "../shelf/book-presentation";
import { BookGallery } from "../shelf/book-gallery";
import { ShelfSearchHeader } from "../shelf/shelf-controls";
import { MemberNavigation } from "../navigation/member-navigation";
import { modes } from "../shelf/contracts";
import { showcaseBooks } from "./fixtures";

function DemoBanner() {
  return (
    <View
      style={{
        backgroundColor: colors.successSurface,
        paddingHorizontal: space.xl,
        paddingVertical: space.sm,
      }}
    >
      <AppText kind="label" color={colors.forest}>
        BẢN XEM THỬ · DỮ LIỆU MẪU
      </AppText>
      <AppText kind="small" color={colors.muted}>
        Ảnh tư liệu, không phải sách đang rao bán.
      </AppText>
    </View>
  );
}

export function ShelfShowcase() {
  const { composition } = useLocalSearchParams<{ composition?: string }>();
  const grid = composition === "grid";
  const scroll = useRef<ScrollView>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("");
  const [missing, setMissing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase();
  const items = showcaseBooks.filter(
    ({ listing }) =>
      (!mode ||
        listing.mode === mode ||
        (mode !== "Both" && listing.mode === "Both")) &&
      normalized(
        `${listing.book.title} ${listing.book.authors.join(" ")}`,
      ).includes(normalized(query.trim())),
  );
  const open = (id: string) =>
    router.push({
      pathname: "/showcase-book",
      params: { id, missing: missing ? "1" : "0" },
    });
  return (
    <Screen
      appearance="browse"
      scrollRef={scroll}
      header={
        <>
          <DemoBanner />
          <ShelfSearchHeader
            search={search}
            onSearchChange={setSearch}
            onSubmit={() => setQuery(search)}
            onFilter={() => setFilterOpen(true)}
            filterCount={mode ? 1 : 0}
          />
        </>
      }
      footer={<MemberNavigation current="/" />}
      footerAppearance="navigation"
      compactFooter
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {Object.entries({ "": "Tất cả", ...modes }).map(([key, title]) => (
          <Chip
            key={key}
            title={title}
            selected={mode === key}
            onPress={() => setMode(key)}
          />
        ))}
      </View>
      <View style={{ gap: space.sm }}>
        <AppText
          kind="bookHeading"
          color={colors.forest}
          accessibilityRole="header"
        >
          Sách đang có
        </AppText>
        <AppText kind="small" color={colors.muted}>
          Mới đăng · Trang 1
        </AppText>
      </View>
      <ShelfResults
        composition={grid ? "grid" : "list"}
        key={`${query}:${mode}`}
        items={items.map((x) => x.listing)}
        onOpen={(item) => open(item.id)}
        renderPhoto={(item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mở ảnh sách ${item.book.title}`}
            onPress={() => open(item.id)}
          >
            <BookCover
              source={
                showcaseBooks.find((x) => x.listing.id === item.id)?.cover
              }
              missing={missing}
              label={`Ảnh tư liệu ${item.book.title}`}
              style={{
                width: "100%",
                ...(grid ? { height: 160 } : { aspectRatio: 2 / 3 }),
                backgroundColor: colors.surface,
              }}
            />
          </Pressable>
        )}
      />
      {!items.length && (
        <Notice tone="info">
          Không có mẫu phù hợp. Thử bỏ từ khóa hoặc chọn Tất cả.
        </Notice>
      )}
      <Button
        title={grid ? "Xem phương án danh sách" : "Xem phương án lưới"}
        secondary
        onPress={() =>
          router.replace({
            pathname: "/showcase",
            params: { composition: grid ? "list" : "grid" },
          })
        }
      />
      <Button
        title={missing ? "Hiện lại ảnh tư liệu" : "Thử khi ảnh không tải được"}
        secondary
        onPress={() => setMissing((v) => !v)}
      />
      <AppText kind="small" color={colors.muted}>
        Giá, người đăng và tình trạng là dữ liệu mẫu. Nguồn ảnh và giấy phép nằm
        trong mỗi màn chi tiết. Các thành phần trình bày này cũng được dùng ở kệ
        thật.
      </AppText>
      <BackAction
        title="Về danh sách thật"
        onPress={() => router.replace("/")}
      />
      <Sheet
        title="Bộ lọc mẫu"
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
      >
        <AppText>Dữ liệu mẫu chỉ hỗ trợ hình thức và từ khóa.</AppText>
        {Object.entries({ "": "Tất cả", ...modes }).map(([key, title]) => (
          <Chip
            key={key}
            title={title}
            selected={mode === key}
            onPress={() => {
              setMode(key);
              setFilterOpen(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

export function BookShowcase({
  id,
  missing,
}: {
  id: string;
  missing: boolean;
}) {
  const sample = showcaseBooks.find((x) => x.listing.id === id);
  const [large, setLarge] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/showcase");
  };
  const openSource = async (url: string) => {
    try {
      setLinkError(false);
      await Linking.openURL(url);
    } catch {
      setLinkError(true);
    }
  };
  return (
    <Screen
      appearance="browse"
      header={
        <>
          <DemoBanner />
          <View style={{ paddingHorizontal: space.xl }}>
            <BackAction title="Về kệ mẫu" onPress={back} />
          </View>
        </>
      }
    >
      {sample ? (
        <>
          <BookPresentation
            item={sample.listing}
            gallery={(summary) => (
              <BookGallery
                summary={summary}
                count={1}
                selected={0}
                onSelect={() => {}}
                onEnlarge={() => setLarge(true)}
                caption="Ảnh bìa tư liệu để xem bố cục. Không chứng minh tình trạng sách; mọi giá và mô tả là mẫu."
                photo={
                  <BookCover
                    source={sample.cover}
                    missing={missing}
                    label={`Ảnh tư liệu ${sample.listing.book.title}`}
                    style={{
                      width: "100%",
                      aspectRatio: 2 / 3,
                      backgroundColor: colors.paper,
                    }}
                  />
                }
              />
            )}
          />
          <View
            style={{
              gap: space.sm,
              borderTopWidth: 1,
              borderColor: colors.rule,
              paddingTop: space.lg,
            }}
          >
            <AppText kind="card" color={colors.forest}>
              Nguồn ảnh
            </AppText>
            <AppText kind="small" color={colors.muted}>
              {sample.credit}
            </AppText>
            {sample.source && (
              <Button
                title="Mở hồ sơ nguồn ảnh"
                secondary
                onPress={() => void openSource(sample.source!)}
              />
            )}
            {sample.license && (
              <Button
                title="Xem giấy phép CC BY 2.0"
                secondary
                onPress={() => void openSource(sample.license!)}
              />
            )}
            {linkError && (
              <Notice tone="error">
                Chưa mở được liên kết nguồn. Bạn có thể thử lại.
              </Notice>
            )}
          </View>
          <Sheet
            title="Ảnh tư liệu · không phải bài đăng"
            visible={large}
            onClose={() => setLarge(false)}
          >
            <AppText kind="card">{sample.listing.book.title}</AppText>
            <BookCover
              source={sample.cover}
              missing={missing}
              label="Ảnh tư liệu phóng lớn"
              style={{ width: "100%", height: 420 }}
            />
            <AppText kind="small" color={colors.muted}>
              {sample.credit}
            </AppText>
          </Sheet>
        </>
      ) : (
        <Notice tone="info">
          Không tìm thấy mẫu này. Quay lại kệ mẫu để chọn sách.
        </Notice>
      )}
    </Screen>
  );
}
