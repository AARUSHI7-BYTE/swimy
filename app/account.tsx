import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAppContext } from "./app-context";
import { useLanguage } from "./language-context";
import { useTheme } from "./theme-context";
import { ThemeColors } from "../lib/theme";
import { signOutUser } from "../firebaseconfig";
import { getPoolById, Pool } from "../lib/firestore";
import { listMembershipsByPhone, Membership } from "../lib/memberships";
import { Entry, listEntriesByUser } from "../lib/entries";

function formatPhone(digits: string) {
  if (!digits) return "";
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function membershipStatusLabel(membership: Membership, colors: ThemeColors, t: (key: string) => string): { label: string; color: string } {
  if (membership.status === "inactive") return { label: t("account.statusInactive"), color: colors.danger };
  if (membership.endDate < Date.now()) return { label: t("account.statusExpired"), color: colors.warning };
  return { label: t("account.statusActive"), color: colors.success };
}

export default function Account() {
  const { userName, email, phoneNumber, profilePhotoUri, uid, selectedPoolId, resetSession } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fullName = userName.trim() || t("home.guest");

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!selectedPoolId || !phoneNumber || !uid) {
        setMemberships([]);
        setEntries([]);
        setPool(null);
        return;
      }
      let cancelled = false;
      setIsLoading(true);
      Promise.all([
        listMembershipsByPhone(selectedPoolId, phoneNumber),
        listEntriesByUser(selectedPoolId, uid),
        getPoolById(selectedPoolId),
      ])
        .then(([membershipResults, entryResults, poolResult]) => {
          if (cancelled) return;
          setMemberships(membershipResults);
          setEntries(entryResults);
          setPool(poolResult);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [selectedPoolId, phoneNumber, uid])
  );

  const currentMembership = memberships[0] ?? null;
  const previousMemberships = memberships.slice(1);
  const currentStatus = currentMembership ? membershipStatusLabel(currentMembership, colors, t) : null;
  const membershipStats = currentMembership
    ? [
        { icon: "calendar-outline" as const, label: t("account.memberSince"), value: formatDate(currentMembership.startDate) },
        { icon: "ribbon-outline" as const, label: t("account.plan"), value: currentMembership.tierName },
        { icon: "calendar-outline" as const, label: t("account.validTillLabel"), value: formatDate(currentMembership.endDate) },
        { icon: "shield-checkmark-outline" as const, label: t("account.status"), value: currentStatus!.label, valueColor: currentStatus!.color },
      ]
    : [];

  function confirmLogout() {
    Alert.alert(t("account.logoutConfirmTitle"), t("account.logoutConfirmMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("account.logout"), style: "destructive", onPress: handleLogout },
    ]);
  }

  async function handleLogout() {
    try {
      await signOutUser();
    } catch (error) {
      console.error("Sign out failed", error);
    }
    resetSession();
    router.replace("/welcome");
  }

  const accountLinks = [
    { icon: "calendar-outline" as const, label: t("account.myVisits") },
    { icon: "ribbon-outline" as const, label: t("account.membership") },
    { icon: "settings-outline" as const, label: t("account.settings"), onPress: () => router.push("/settings") },
    { icon: "log-out-outline" as const, label: t("account.logout"), onPress: confirmLogout, destructive: true },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityRow}>
          {profilePhotoUri ? <Image source={{ uri: profilePhotoUri }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={34} color={colors.textFaint} /></View>}
          <View style={styles.identityInfo}>
            <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
            {currentMembership && <View style={styles.memberPill}><Text style={styles.memberPillText}>{t("account.memberBadge", { status: currentStatus!.label })}</Text></View>}
            {!!email && <View style={styles.metaRow}><Ionicons name="mail-outline" size={15} color={colors.textMuted} /><Text style={styles.metaText} numberOfLines={1}>{email}</Text></View>}
            {!!phoneNumber && <View style={styles.metaRow}><Ionicons name="call-outline" size={15} color={colors.textMuted} /><Text style={styles.metaText}>{formatPhone(phoneNumber)}</Text></View>}
          </View>
          <TouchableOpacity style={styles.editButton} onPress={() => router.push("/profile")} hitSlop={8}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {currentMembership && (
          <TouchableOpacity style={styles.membershipCard} activeOpacity={0.85}>
            <View style={styles.membershipTop}>
              <View style={styles.crownCircle}><Ionicons name="ribbon" size={22} color="#fff" /></View>
              <View style={styles.membershipCopy}>
                <Text style={styles.membershipTitle}>{t("account.membershipTitle", { tier: currentMembership.tierName })}</Text>
                <Text style={styles.membershipSubtitle}>
                  {currentMembership.status === "inactive" ? t("account.deactivated") : t("account.validTill", { date: formatDate(currentMembership.endDate) })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </View>
            <TouchableOpacity style={styles.benefitsButton} activeOpacity={0.8}>
              <Text style={styles.benefitsText}>{t("account.viewBenefits")}</Text>
              <Ionicons name="chevron-forward" size={15} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("account.myVisits")}</Text>
        </View>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : entries.length ? (
          entries.map((entry) => {
            const isComplete = !!entry.exitedAt;
            return (
              <View key={entry.id} style={styles.swimCard}>
                <Image source={require("../assets/images/pool.jpg")} style={styles.swimImage} />
                <View style={styles.swimCopy}>
                  <View style={styles.swimTopRow}>
                    <Text style={styles.swimName} numberOfLines={1}>{pool?.name ?? t("account.poolVisit")}</Text>
                    <View style={[styles.statusPill, isComplete ? styles.statusPillDone : styles.statusPillOpen]}>
                      <Text style={[styles.statusPillText, { color: isComplete ? colors.success : colors.primary }]}>
                        {isComplete ? t("common.completed") : t("common.checkedIn")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.swimMetaRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.swimMetaText}>{formatDate(entry.enteredAt)}</Text>
                    <Text style={styles.swimDot}>·</Text>
                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.swimMetaText}>{formatTime(entry.enteredAt)}</Text>
                  </View>
                  <View style={styles.swimMetaRow}>
                    <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.swimMetaText}>{entry.people.length || 1} {entry.people.length === 1 ? t("common.person") : t("common.people")}</Text>
                    {isComplete && entry.price != null && (
                      <>
                        <Text style={styles.swimDot}>·</Text>
                        <Text style={styles.swimMetaText}>₹{entry.price}</Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.noMembershipText}>
              {selectedPoolId ? t("account.noSwimsAtPool") : t("account.selectPoolSwims")}
            </Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, styles.standaloneTitle]}>{t("account.membershipDetails")}</Text>
        {currentMembership ? (
          <View style={styles.statsCard}>
            {membershipStats.map((stat, index) => (
              <View key={stat.label} style={[styles.statCell, index !== membershipStats.length - 1 && styles.statCellDivider]}>
                <View style={styles.statIconCircle}><Ionicons name={stat.icon} size={19} color={colors.primary} /></View>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[styles.statValue, stat.valueColor ? { color: stat.valueColor } : null]}>{stat.value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.noMembershipText}>
              {selectedPoolId ? t("account.noMembershipAtPool") : t("account.selectPoolMembership")}
            </Text>
          </View>
        )}

        {previousMemberships.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.standaloneTitle]}>{t("account.previousMemberships")}</Text>
            <View style={styles.historyCard}>
              {previousMemberships.map((past, index) => {
                const pastStatus = membershipStatusLabel(past, colors, t);
                return (
                  <View key={past.id} style={[styles.historyRow, index !== previousMemberships.length - 1 && styles.historyRowDivider]}>
                    <View style={styles.historyIconCircle}><Ionicons name="ribbon-outline" size={17} color={colors.primary} /></View>
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyTitle}>{past.tierName}</Text>
                      <Text style={styles.historyMeta}>{formatDate(past.startDate)} – {formatDate(past.endDate)}</Text>
                    </View>
                    <Text style={[styles.historyStatus, { color: pastStatus.color }]}>{pastStatus.label}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, styles.standaloneTitle]}>{t("account.accountSection")}</Text>
        <View style={styles.linksCard}>
          {accountLinks.map((link, index) => (
            <TouchableOpacity
              key={link.label}
              style={[styles.linkRow, index !== accountLinks.length - 1 && styles.linkRowDivider]}
              activeOpacity={0.7}
              onPress={link.onPress}
            >
              <Ionicons name={link.icon} size={20} color={link.destructive ? colors.danger : colors.text} />
              <Text style={[styles.linkLabel, link.destructive && styles.linkLabelDestructive]}>{link.label}</Text>
              {!link.destructive && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace("/home")}><Ionicons name="home-outline" size={30} color={colors.icon} /><Text style={styles.navText}>{t("common.navHome")}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push("/pools")}><Ionicons name="water-outline" size={30} color={colors.icon} /><Text style={styles.navText}>{t("common.navPool")}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem}><Ionicons name="person" size={30} color={colors.primary} /><Text style={[styles.navText, styles.navTextActive]}>{t("common.navProfile")}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: 71, paddingBottom: 120 },

    identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
    avatar: { width: 72, height: 72, borderRadius: 36 },
    avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    identityInfo: { flex: 1, gap: 6 },
    name: { fontSize: 20, fontWeight: "700", color: colors.text },
    memberPill: { alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 4 },
    memberPillText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    metaText: { color: colors.textMuted, fontSize: 13.5 },
    editButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },

    membershipCard: { marginTop: 24, borderRadius: 18, backgroundColor: colors.primary, padding: 20, shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    membershipTop: { flexDirection: "row", alignItems: "center", gap: 14 },
    crownCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
    membershipCopy: { flex: 1 },
    membershipTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
    membershipSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 3 },
    benefitsButton: { marginTop: 18, alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
    benefitsText: { color: "#fff", fontSize: 13, fontWeight: "700" },

    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 13 },
    sectionTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    standaloneTitle: { marginTop: 28, marginBottom: 13 },
    viewAll: { fontSize: 14, color: colors.primary, fontWeight: "700" },

    swimCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 11, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginBottom: 10 },
    swimImage: { width: 78, height: 78, borderRadius: 12 },
    swimCopy: { flex: 1, paddingLeft: 12, gap: 6 },
    swimTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    swimName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "700" },
    statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    statusPillDone: { backgroundColor: colors.successSoft },
    statusPillOpen: { backgroundColor: colors.primarySoft },
    statusPillText: { fontSize: 11.5, fontWeight: "700" },
    swimMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    swimMetaText: { color: colors.textMuted, fontSize: 12.5 },
    swimDot: { color: colors.textMuted, fontSize: 12.5, marginHorizontal: 1 },

    emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 24, backgroundColor: colors.surface },
    statsCard: { flexDirection: "row", borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 18, backgroundColor: colors.surface },
    noMembershipText: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 13.5, paddingHorizontal: 20 },
    statCell: { flex: 1, alignItems: "center", gap: 6, paddingHorizontal: 4 },
    statCellDivider: { borderRightWidth: 1, borderColor: colors.border },
    statIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    statLabel: { color: colors.textMuted, fontSize: 11, textAlign: "center" },
    statValue: { color: colors.text, fontSize: 12.5, fontWeight: "700", textAlign: "center" },

    historyCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    historyRowDivider: { borderBottomWidth: 1, borderColor: colors.border },
    historyIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    historyCopy: { flex: 1 },
    historyTitle: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
    historyMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    historyStatus: { fontSize: 12.5, fontWeight: "700" },

    linksCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 17, height: 58 },
    linkRowDivider: { borderBottomWidth: 1, borderColor: colors.border },
    linkLabel: { flex: 1, color: colors.text, fontSize: 15.5, fontWeight: "600" },
    linkLabelDestructive: { color: colors.danger },

    bottomNav: { height: 92, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: "row", justifyContent: "space-around", paddingTop: 12 },
    navItem: { width: 78, alignItems: "center", gap: 4 },
    navText: { fontSize: 13, color: colors.icon, fontWeight: "600" },
    navTextActive: { color: colors.primary, fontWeight: "700" },
  });
}
