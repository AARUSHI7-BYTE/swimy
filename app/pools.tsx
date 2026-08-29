import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pool } from "../lib/firestore";
import { getPoolImage } from "../lib/pool-images";
import { errorMessage } from "../lib/query-client";
import { usePoolsQuery } from "../lib/queries";
import { ThemeColors } from "../lib/theme";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";

function matchesFilter(pool: Pool, filter: string) {
  if (filter === "Covered") return pool.covered;
  if (filter === "Kids Pool") return pool.kidsPool;
  return pool.size === filter;
}

export default function Pools() {
  const { setSelectedPoolId } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const filters = [
    { key: "Covered", label: t("pools.filterCovered") },
    { key: "Kids Pool", label: t("pools.filterKidsPool") },
    { key: "Medium", label: t("pools.filterMedium") },
  ];
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const { data: pools = [], isLoading, isError, error, refetch } = usePoolsQuery();

  const filteredPools = useMemo(() => pools.filter((pool) => (!activeFilter || matchesFilter(pool, activeFilter)) && pool.name.toLowerCase().includes(query.toLowerCase())), [pools, query, activeFilter]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t("pools.title")}</Text>
        <View style={styles.search}><Ionicons name="search" size={23} color={colors.textMuted} /><TextInput style={styles.searchInput} placeholder={t("pools.searchPlaceholder")} placeholderTextColor={colors.textFaint} value={query} onChangeText={setQuery} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((filter) => <TouchableOpacity key={filter.key} style={[styles.filter, activeFilter === filter.key && styles.filterActive]} onPress={() => setActiveFilter(activeFilter === filter.key ? null : filter.key)}><Text style={[styles.filterText, activeFilter === filter.key && styles.filterTextActive]}>{filter.label}</Text></TouchableOpacity>)}
        </ScrollView>

        <SectionTitle title={t("pools.featuredPools")} styles={styles} t={t} />
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : isError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage(error, "Couldn't load pools.")}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryText}>{t("common.retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : filteredPools.length ? (
          filteredPools.map((pool) => (
            <NearbyCard
              key={pool.id}
              pool={pool}
              onSelect={() => { setSelectedPoolId(pool.id); router.replace("/home"); }}
              onOpenDetail={() => router.push({ pathname: "/pool-detail", params: { poolId: pool.id } })}
              styles={styles}
              t={t}
            />
          ))
        ) : (
          <Text style={styles.empty}>{t("pools.noPoolsMatch")}</Text>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace("/home")}><Ionicons name="home-outline" size={30} color={colors.icon} /><Text style={styles.navText}>{t("common.navHome")}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Ionicons name="water-outline" size={30} color={colors.primary} /><Text style={[styles.navText, styles.navTextActive]}>{t("common.navPool")}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push("/account")}><Ionicons name="person-outline" size={30} color={colors.icon} /><Text style={styles.navText}>{t("common.navProfile")}</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function SectionTitle({ title, styles, t }: { title: string; styles: ReturnType<typeof createStyles>; t: TFunction }) { return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><TouchableOpacity><Text style={styles.seeAll}>{t("common.seeAll")}</Text></TouchableOpacity></View>; }
function PoolMeta({ pool, styles, t }: { pool: Pool; styles: ReturnType<typeof createStyles>; t: TFunction }) { return <Text style={styles.meta}>{pool.location}  ·  {pool.covered ? t("pools.indoor") : t("pools.outdoor")}{pool.kidsPool ? `  ·  ${t("pools.kidsPool")}` : ""}  ·  {pool.size}</Text>; }
function NearbyCard({ pool, onSelect, onOpenDetail, styles, t }: { pool: Pool; onSelect: () => void; onOpenDetail: () => void; styles: ReturnType<typeof createStyles>; t: TFunction }) { return <TouchableOpacity style={styles.nearbyCard} activeOpacity={0.85} onPress={onOpenDetail}><Image source={pool.imageUrl ? { uri: pool.imageUrl } : getPoolImage(pool.imageKey)} style={styles.nearbyImage} /><View style={styles.nearbyCopy}><Text style={styles.nearbyName} numberOfLines={1}>{pool.name}</Text><PoolMeta pool={pool} styles={styles} t={t} /></View><TouchableOpacity style={styles.bookButton} onPress={onSelect}><Text style={styles.bookText}>{t("pools.book")}</Text></TouchableOpacity></TouchableOpacity>; }

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, container: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 120 },
  title: { fontSize: 27, fontWeight: "700", color: colors.text, marginBottom: 18 }, search: { height: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 13, flexDirection: "row", alignItems: "center", paddingHorizontal: 15, gap: 10, backgroundColor: colors.surface }, searchInput: { flex: 1, fontSize: 16, color: colors.text },
  filterRow: { gap: 10, paddingTop: 13, paddingBottom: 24 }, filter: { paddingHorizontal: 16, height: 37, borderRadius: 19, backgroundColor: colors.surfaceAlt, justifyContent: "center" }, filterActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary }, filterText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" }, filterTextActive: { color: colors.primary },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }, sectionTitle: { fontSize: 21, fontWeight: "700", color: colors.text }, seeAll: { fontSize: 15, color: colors.primary, fontWeight: "700" }, meta: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  nearbyCard: { minHeight: 123, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 12, backgroundColor: colors.surface, shadowColor: colors.border, shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 }, nearbyImage: { width: 91, height: 99, borderRadius: 12 }, nearbyCopy: { flex: 1, alignSelf: "stretch", paddingLeft: 12, paddingTop: 6 }, nearbyName: { color: colors.text, fontSize: 16, fontWeight: "700" }, bookButton: { backgroundColor: colors.primary, height: 42, borderRadius: 12, paddingHorizontal: 15, justifyContent: "center", alignItems: "center", alignSelf: "flex-end", marginBottom: 5 }, bookText: { color: "#fff", fontSize: 14, fontWeight: "700" }, empty: { color: colors.textMuted, fontSize: 15, textAlign: "center", marginTop: 20 },
  errorBox: { alignItems: "center", gap: 12, marginTop: 20, paddingVertical: 20 }, errorText: { color: colors.danger, fontSize: 14, textAlign: "center" }, retryButton: { paddingHorizontal: 18, height: 40, borderRadius: 10, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center" }, retryText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  bottomNav: { height: 92, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: "row", justifyContent: "space-around", paddingTop: 12 }, navItem: { width: 78, alignItems: "center", gap: 4 }, navText: { fontSize: 13, color: colors.icon, fontWeight: "600" }, navTextActive: { color: colors.primary, fontWeight: "700" },
  });
}
