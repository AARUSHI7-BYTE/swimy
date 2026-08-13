import { router } from "expo-router";

export function safeGoBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/welcome");
  }
}
