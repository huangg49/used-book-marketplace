import { useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import {
  AppText,
  BackAction,
  BookCover,
  BookTradeBar,
  Button,
  Chip,
  Notice,
  Screen,
  SearchField,
  Sheet,
  colors,
  space,
} from "../../core/ui";
import { ShelfGrid } from "../shelf/shelf-grid";
import { BookPresentation } from "../shelf/book-presentation";
import { BookGallery } from "../shelf/book-gallery";
import { ShelfHeader, ShelfStory } from "../shelf/shelf-controls";
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
  const scroll = useRef<ScrollView>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("");
  const [missing, setMissing] = useState(false);
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase();
  const items = showcaseBooks.filter(
    ({ listing }) =>
      (!mode || listing.mode === mode) &&
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
      scrollRef={scroll}
      header={
        <>
          <DemoBanner />
          <ShelfHeader />
        </>
      }
      footer={
        <BackAction title="Về kệ thật" onPress={() => router.replace("/")} />
      }
    >
      <SearchField
        label="Tìm trong dữ liệu mẫu"
        submitLabel="Tìm sách mẫu"
        placeholder="Tên sách, tác giả"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => setQuery(search)}
        maxLength={200}
      />
      {!query && !mode && <ShelfStory />}
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
          kind="heading"
          color={colors.forest}
          accessibilityRole="header"
        >
          Một cuốn. Một lần gặp.
        </AppText>
        <AppText kind="small" color={colors.muted}>
          {items.length} mẫu để xem bố cục · chạm bìa để mở
        </AppText>
      </View>
      <ShelfGrid
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
              style={{ width: "100%", height: 210 }}
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
        title={missing ? "Hiện lại ảnh tư liệu" : "Thử khi ảnh không tải được"}
        secondary
        onPress={() => setMissing((v) => !v)}
      />
      <AppText kind="small" color={colors.muted}>
        Giá, người đăng và tình trạng là dữ liệu mẫu. Nguồn ảnh và giấy phép nằm
        trong mỗi màn chi tiết. Các thành phần trình bày này cũng được dùng ở kệ
        thật.
      </AppText>
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
      compactFooter
      footer={
        sample ? (
          <BookTradeBar
            sale={sample.listing.salePrice ?? undefined}
            exchange={sample.listing.exchangeValue ?? undefined}
          >
            <AppText kind="annotation" color={colors.muted}>
              Dữ liệu mẫu · không nhận đơn
            </AppText>
          </BookTradeBar>
        ) : undefined
      }
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
                    style={{ width: "100%", height: 184 }}
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
