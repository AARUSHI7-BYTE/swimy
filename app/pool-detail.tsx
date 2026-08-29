import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import { getPoolImage } from "../lib/pool-images";
import { errorMessage } from "../lib/query-client";
import { usePoolQuery, useRestrictedRulesQuery } from "../lib/queries";
import { formatRule } from "../lib/restrictedTimings";
import { safeGoBack } from "../lib/navigation";

export default function PoolDetail() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setSelectedPoolId } = useAppContext();
  const { data: pool, isLoading, isError, error, refetch } = usePoolQuery(poolId);
  const { data: rules = [], refetch: refetchRules } = useRestrictedRulesQuery(poolId);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchRules()]);
    } finally {
      setRefreshing(false);
    }
  }

  function selectPool() {
    if (!pool) return;
    setSelectedPoolId(pool.id);
    router.replace("/home");
  }

  const photos = pool?.photos && pool.photos.length > 0 ? pool.photos : pool ? [pool.imageUrl] : [];
  const isFull = !!pool?.maxOccupancy && (pool.liveOccupancy ?? 0) >= pool.maxOccupancy;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <TouchableOpacity style={styles.backButton} onPress={safeGoBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : isError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage(error, "Couldn't load this pool.")}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryText}>{t("common.retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : !pool ? (
          <Text style={styles.emptyText}>{t("poolDetail.notFound")}</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.length > 0 ? (
                photos.map((uri, index) => <Image key={index} source={uri ? { uri } : getPoolImage(pool.imageKey)} style={styles.photo} />)
              ) : (
                <Image source={getPoolImage(pool.imageKey)} style={styles.photo} />
              )}
            </ScrollView>

            <Text style={styles.title}>{pool.name}</Text>
            <Text style={styles.meta}>
              {pool.location} · {pool.covered ? t("pools.indoor") : t("pools.outdoor")}
              {pool.kidsPool ? ` · ${t("pools.kidsPool")}` : ""}
            </Text>

            {pool.operatingHours ? (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>{t("poolDetail.operatingHours")}</Text>
                  <Text style={styles.infoValue}>{pool.operatingHours}</Text>
                </View>
              </View>
            ) : null}

            {pool.contactInfo ? (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>{t("poolDetail.contact")}</Text>
                  <Text style={styles.infoValue}>{pool.contactInfo}</Text>
                </View>
              </View>
            ) : null}

            {typeof pool.maxOccupancy === "number" && pool.maxOccupancy > 0 ? (
              <View style={styles.infoRow}>
                <Ionicons name="people-outline" size={18} color={isFull ? colors.danger : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>{t("poolDetail.capacity")}</Text>
                  <Text style={[styles.infoValue, isFull && { color: colors.danger }]}>
                    {Math.max(0, pool.liveOccupancy ?? 0)}/{pool.maxOccupancy} {isFull ? `· ${t("poolDetail.full")}` : ""}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>{t("poolDetail.restrictedTimings")}</Text>
            {rules.length === 0 ? (
              <Text style={styles.emptyText}>{t("poolDetail.noRestrictedTimings")}</Text>
            ) : (
              rules.map((rule) => (
                <View key={rule.id} style={styles.ruleRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={styles.ruleText}>{formatRule(rule)}</Text>
                </View>
              ))
            )}

            <TouchableOpacity style={styles.selectButton} onPress={selectPool}>
              <Text style={styles.selectButtonText}>{t("poolDetail.selectPool")}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 60 },
    backButton: { width: 42, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    photoScroll: { marginBottom: 16 },
    photo: { width: 280, height: 180, borderRadius: 16, marginRight: 12, backgroundColor: colors.surfaceAlt },
    title: { fontSize: 26, fontWeight: "700", color: colors.text },
    meta: { color: colors.textMuted, fontSize: 14, marginTop: 6, marginBottom: 18 },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border },
    infoLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
    infoValue: { color: colors.text, fontSize: 15, fontWeight: "600", marginTop: 2 },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 22, marginBottom: 10 },
    emptyText: { color: colors.textMuted, fontSize: 14 },
    ruleRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    ruleText: { color: colors.text, fontSize: 13.5, flex: 1 },
    selectButton: { height: 56, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 26 },
    selectButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    errorBox: { alignItems: "center", gap: 12, marginTop: 60 },
    errorText: { color: colors.danger, fontSize: 14, textAlign: "center" },
    retryButton: { paddingHorizontal: 18, height: 40, borderRadius: 10, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center" },
    retryText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  });
}
