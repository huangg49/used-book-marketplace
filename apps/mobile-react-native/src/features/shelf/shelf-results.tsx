import { useContext, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { BookCard, TextScale, Toast } from "../../core/ui";
import { type Listing } from "./contracts";
import { useListingWishlist } from "../wishlist";

/** The API order is the reading order. Grid is retained only for the design comparison. */
export function ShelfResults({
  items,
  renderPhoto,
  onOpen,
  composition = "list",
}: {
  items: Listing[];
  renderPhoto: (item: Listing) => ReactNode;
  onOpen: (item: Listing) => void;
  composition?: "list" | "grid";
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = fontScale * useContext(TextScale);
  const grid = composition === "grid" && width >= 360 && scale < 1.29;
  const { isSaved, toggle, toastMessage, clearToast } = useListingWishlist();

  return (
    <>
      <View
        style={{
          flexDirection: grid ? "row" : "column",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {items.map((item) => (
          <BookCard
            key={item.id}
            item={item}
            photoNode={renderPhoto(item)}
            onOpen={() => onOpen(item)}
            style={{ width: grid ? "48.5%" : "100%" }}
            isSaved={isSaved(item.id)}
            onToggleSave={() => void toggle(item.id)}
          />
        ))}
      </View>
      <Toast
        visible={Boolean(toastMessage)}
        message={toastMessage ?? ""}
        onDismiss={clearToast}
        actionTitle="Xem"
        onAction={() => router.push("/wishlist")}
      />
    </>
  );
}
