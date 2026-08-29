import { Ionicons } from "@expo/vector-icons";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMemo } from "react";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";

const steps = [
  { source: require("../assets/images/image1.png"), ratio: 570 / 736 },
  { source: require("../assets/images/image2.png"), ratio: 686 / 772 },
  { source: require("../assets/images/image3.png"), ratio: 568 / 782 },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stepHeight = (width - 88) / steps.reduce((sum, s) => sum + s.ratio, 0);

  function goToLogin() {
    router.replace("/signin");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Image source={require("../assets/images/swim-icon.png")} style={styles.logoIcon} resizeMode="contain" />
          </View>
          <Text style={styles.brandText}>Swimy</Text>
        </View>
        <TouchableOpacity onPress={goToLogin} hitSlop={8}>
          <Text style={styles.skipText}>{t("onboarding.skip")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.illustrationCard}>
          <View style={styles.stepsRow}>
            {steps.map((step, index) => (
              <Image
                key={index}
                source={step.source}
                resizeMode="contain"
                style={{ height: stepHeight, width: stepHeight * step.ratio }}
              />
            ))}
          </View>
        </View>

        <Text style={styles.headline}>{t("onboarding.headline")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.subtitle")}</Text>

        <View style={styles.featureRow}>
          <View style={styles.featurePill}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.featurePillText}>{t("onboarding.featureNoFixedSlots")}</Text>
          </View>
          <View style={styles.featurePill}>
            <Ionicons name="card-outline" size={18} color={colors.primary} />
            <Text style={styles.featurePillText}>{t("onboarding.featurePayAtExit")}</Text>
          </View>
        </View>

        <View style={styles.dotsRow}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
        </View>

        <TouchableOpacity style={styles.getStartedButton} activeOpacity={0.85} onPress={goToLogin}>
          <Text style={styles.getStartedText}>{t("onboarding.getStarted")}</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surfaceAlt, paddingHorizontal: 24 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    logoBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    logoIcon: { width: 22, height: 22 },
    brandText: { color: colors.primary, fontSize: 23, fontWeight: "800" },
    skipText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },

    scrollContent: { flexGrow: 1, paddingBottom: 24 },

    illustrationCard: { marginTop: 36, borderRadius: 24, backgroundColor: colors.surface, paddingVertical: 64, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
    stepsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },

    headline: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", marginTop: 22 },
    subtitle: { color: colors.textMuted, fontSize: 15, marginTop: 10 },

    featureRow: { flexDirection: "row", gap: 12, marginTop: 22 },
    featurePill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: colors.border },
    featurePillText: { color: colors.text, fontSize: 14, fontWeight: "700" },

    dotsRow: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 6, paddingBottom: 16, minHeight: 20 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
    dotActive: { width: 24, backgroundColor: colors.primary },

    getStartedButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 72, borderRadius: 20, backgroundColor: colors.primary, marginBottom: 12 },
    getStartedText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  });
}
