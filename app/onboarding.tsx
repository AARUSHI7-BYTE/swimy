import { Ionicons } from "@expo/vector-icons";
import { Image, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";

const steps = [
  { source: require("../assets/images/image1.png"), ratio: 570 / 736 },
  { source: require("../assets/images/image2.png"), ratio: 686 / 772 },
  { source: require("../assets/images/image3.png"), ratio: 568 / 782 },
];

const groupIllustration = { source: require("../assets/images/onboarding-group.png"), ratio: 607 / 576 };

export default function Onboarding() {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cardHeight = Math.min(height * 0.36, 340);
  const stepHeight = cardHeight * 0.42;
  const groupHeight = Math.min(cardHeight * 0.84, (width - 88) / groupIllustration.ratio);

  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);

  function goToLogin() {
    router.replace("/signin");
  }

  function goToPage(index: number) {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPageIndex(index);
  }

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setPageIndex(index);
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
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.pager}
      >
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.illustrationCard, { height: cardHeight }]}>
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
          </ScrollView>
        </View>

        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.illustrationCard, { height: cardHeight }]}>
              <Image
                source={groupIllustration.source}
                resizeMode="contain"
                style={{ height: groupHeight, width: groupHeight * groupIllustration.ratio }}
              />
            </View>

            <Text style={styles.headline}>{t("onboarding.headline2")}</Text>
            <Text style={styles.subtitle}>{t("onboarding.subtitle2")}</Text>

            <View style={styles.featureRow}>
              <View style={styles.featurePill}>
                <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
                <Text style={styles.featurePillText}>{t("onboarding.featureWallet")}</Text>
              </View>
              <View style={styles.featurePill}>
                <Ionicons name="cash-outline" size={18} color={colors.primary} />
                <Text style={styles.featurePillText}>{t("onboarding.featureCash")}</Text>
              </View>
              <View style={styles.featurePill}>
                <Ionicons name="grid-outline" size={18} color={colors.primary} />
                <Text style={styles.featurePillText}>{t("onboarding.featureUpi")}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      <View style={styles.dotsRow}>
        <View style={[styles.dot, pageIndex === 0 && styles.dotActive]} />
        <View style={[styles.dot, pageIndex === 1 && styles.dotActive]} />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.getStartedButton} activeOpacity={0.85} onPress={goToLogin}>
          <Text style={styles.getStartedText}>{pageIndex === 0 ? t("onboarding.getStarted") : t("onboarding.signIn")}</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => goToPage(1)}
          disabled={pageIndex !== 0}
          style={pageIndex !== 0 && styles.learnMoreHidden}
        >
          <Text style={styles.learnMoreText}>{t("onboarding.learnMore")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surfaceAlt },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingHorizontal: 24 },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    logoBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    logoIcon: { width: 22, height: 22 },
    brandText: { color: colors.primary, fontSize: 23, fontWeight: "800" },

    pager: { flex: 1 },
    pageContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 12 },

    illustrationCard: { marginTop: 36, borderRadius: 24, backgroundColor: colors.surface, paddingVertical: 24, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
    stepsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },

    headline: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", marginTop: 22 },
    subtitle: { color: colors.textMuted, fontSize: 15, marginTop: 10 },

    featureRow: { flexDirection: "row", gap: 12, marginTop: 22, flexWrap: "wrap" },
    featurePill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: colors.border },
    featurePillText: { color: colors.text, fontSize: 14, fontWeight: "700" },

    dotsRow: { flexDirection: "row", alignSelf: "center", gap: 8, marginTop: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
    dotActive: { width: 24, backgroundColor: colors.primary },

    footer: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, alignItems: "center" },
    getStartedButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 72, borderRadius: 20, backgroundColor: colors.primary, width: "100%" },
    getStartedText: { color: "#fff", fontSize: 18, fontWeight: "700" },
    learnMoreText: { color: colors.textMuted, fontSize: 14, fontWeight: "600", marginTop: 14 },
    learnMoreHidden: { opacity: 0 },
  });
}
