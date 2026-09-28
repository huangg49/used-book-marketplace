import { Redirect } from "expo-router";
import { DesignPreview } from "../features/design-preview/design-preview";

export default function DesignRoute() {
  if (process.env.EXPO_PUBLIC_DESIGN_PREVIEW !== "1")
    return <Redirect href="/" />;
  return <DesignPreview />;
}
