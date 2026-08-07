import { Redirect } from "expo-router";

// Default entry: land directly on the tabs (home) — no forced login.
// Users can browse as guests; login is only needed for checkout/orders.
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
