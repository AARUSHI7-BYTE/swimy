import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import { useEntriesByUserQuery } from "../lib/queries";

function formatVisitDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function VisitHistory() {
  const { selectedPoolId, uid } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: visits = [], isLoading } = useEntriesByUserQuery(selectedPoolId, uid);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("home.recentVisits")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : visits.length > 0 ? (
          visits.map((visit) => (
            <View key={visit.id} style={styles.visitRow}>
              <View style={styles.visitIconCircle}>
                <Ionicons name={visit.exitedAt ? "checkmark-circle-outline" : "time-outline"} size={20} color={colors.primary} />
              </View>
              <View style={styles.visitCopy}>
                <Text style={styles.visitDate}>{formatVisitDate(visit.enteredAt)} · {formatTime(visit.enteredAt)}</Text>
                <Text style={styles.visitStatus}>{visit.exitedAt ? t("common.completed") : t("common.checkedIn")}</Text>
              </View>
              {visit.exitedAt && visit.price != null && <Text style={styles.visitPrice}>₹{visit.price}</Text>}
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <View style={styles.clockCircle}><Ionicons name="time-outline" size={43} color={colors.primary} /></View>
            <Text style={styles.noVisits}>{t("home.noVisits")}</Text>
            <Text style={styles.visitsDescription}>{t("home.noVisitsDesc")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { height: 57, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.border },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
    content: { padding: 20, paddingBottom: 60 },
    visitRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border },
    visitIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    visitCopy: { flex: 1 },
    visitDate: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
    visitStatus: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
    visitPrice: { color: colors.text, fontSize: 14, fontWeight: "700" },
    empty: { alignItems: "center", marginTop: 80 },
    clockCircle: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    noVisits: { textAlign: "center", fontSize: 18, color: colors.text, fontWeight: "700", marginTop: 15 },
    visitsDescription: { textAlign: "center", color: colors.textMuted, fontSize: 14, marginTop: 9, paddingHorizontal: 30 },
  });
}
