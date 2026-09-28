import { Redirect, useLocalSearchParams } from "expo-router";
import { BookShowcase } from "../features/shelf-showcase/showcase-screen";

export default function ShowcaseBookRoute() {
  const { id, missing } = useLocalSearchParams<{
    id?: string;
    missing?: string;
  }>();
  if (!__DEV__ && process.env.EXPO_PUBLIC_DESIGN_PREVIEW !== "1")
    return <Redirect href="/" />;
  return (
    <BookShowcase
      id={typeof id === "string" ? id : ""}
      missing={missing === "1"}
    />
  );
}
