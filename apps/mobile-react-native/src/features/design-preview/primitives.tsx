import { type ImageSource } from "expo-image";
import { type StyleProp, type ViewStyle } from "react-native";
import { BookCover } from "../../core/ui";
import { type Cover } from "./model";
export const covers: Record<Cover, ImageSource> = {
  pride: require("../../../assets/design/pride.jpg"),
  alice: require("../../../assets/design/alice.jpg"),
  oz: require("../../../assets/design/oz.jpg"),
};
export function CoverImage({
  cover,
  uri,
  ...props
}: {
  cover?: Cover;
  uri?: string;
  missing?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <BookCover
      source={uri ? { uri } : cover ? covers[cover] : undefined}
      {...props}
    />
  );
}
