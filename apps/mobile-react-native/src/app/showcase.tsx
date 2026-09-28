import { Redirect } from "expo-router";
import { ShelfShowcase } from "../features/shelf-showcase/showcase-screen";

export default function ShowcaseRoute() {
  // Explicit internal route, never linked from member navigation.
  if (!__DEV__ && process.env.EXPO_PUBLIC_DESIGN_PREVIEW !== "1")
    return <Redirect href="/" />;
  return <ShelfShowcase />;
}
