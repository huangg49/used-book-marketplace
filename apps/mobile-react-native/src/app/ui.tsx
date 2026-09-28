import { Redirect } from "expo-router";
import { UiCatalogScreen } from "../features/ui-catalog/ui-catalog-screen";
export default function UiRoute() {
  if (process.env.EXPO_PUBLIC_DESIGN_PREVIEW !== "1")
    return <Redirect href="/" />;
  return <UiCatalogScreen />;
}
