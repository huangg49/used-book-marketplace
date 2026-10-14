import { WishlistScreen } from "../features/wishlist";
import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";

export default function WishlistRoute() {
  const { state } = useSession();
  
  if (state.status !== "authenticated") {
    return <Redirect href="/" />;
  }
  
  return <WishlistScreen />;
}
