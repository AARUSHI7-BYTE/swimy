import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "./app-context";
import { LanguageProvider } from "./language-context";
import { ThemeProvider, useTheme } from "./theme-context";

function ThemedStack() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style={colors.statusBar} backgroundColor={colors.background} translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}

export default function Layout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppProvider>
          <ThemedStack />
        </AppProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
