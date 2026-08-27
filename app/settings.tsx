import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors, ThemeMode } from "../lib/theme";
import { Language } from "../lib/i18n";
import { safeGoBack } from "../lib/navigation";

export default function Settings() {
  const { colors, mode, setMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const languageOptions: { value: Language; label: string }[] = [
    { value: "en", label: t("settings.english") },
    { value: "hi", label: t("settings.hindi") },
  ];

  const themeOptions: { value: ThemeMode; label: string; icon: "sunny" | "moon" }[] = [
    { value: "light", label: t("settings.lightMode"), icon: "sunny" },
    { value: "dark", label: t("settings.darkMode"), icon: "moon" },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backButton} onPress={safeGoBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <Text style={styles.title}>{t("settings.title")}</Text>

      <Text style={styles.sectionTitle}>{t("settings.languageSection")}</Text>
      <View style={styles.card}>
        {languageOptions.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.optionRow, index !== languageOptions.length - 1 && styles.optionRowDivider]}
            onPress={() => setLanguage(option.value)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionText}>{option.label}</Text>
            {language === option.value && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t("settings.themeSection")}</Text>
      <View style={styles.card}>
        {themeOptions.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.optionRow, index !== themeOptions.length - 1 && styles.optionRowDivider]}
            onPress={() => setMode(option.value)}
            activeOpacity={0.7}
          >
            <Ionicons name={option.icon} size={19} color={colors.textMuted} style={styles.optionIcon} />
            <Text style={styles.optionText}>{option.label}</Text>
            {mode === option.value && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 60 },
    backButton: { width: 42, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 21, alignItems: "center", justifyContent: "center" },
    title: { fontSize: 28, fontWeight: "700", color: colors.text, marginTop: 24, marginBottom: 24 },
    sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textMuted, marginBottom: 10 },
    sectionSpacing: { marginTop: 28 },
    card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    optionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 17, height: 58 },
    optionRowDivider: { borderBottomWidth: 1, borderColor: colors.border },
    optionIcon: { marginRight: 12 },
    optionText: { flex: 1, color: colors.text, fontSize: 15.5, fontWeight: "600" },
  });
}
