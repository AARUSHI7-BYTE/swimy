import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { Member, useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import { Pool } from "../lib/firestore";
import { ageFromDateOfBirth } from "../lib/age";
import { computeDue, extractPricingConfig, PricingConfig } from "../lib/pricing";
import { activeRulesAt, segmentLabel } from "../lib/restrictedTimings";
import { useEntriesByUserQuery, useLatestEntryQuery, useMembershipsByPhoneQuery, usePoolQuery, useRestrictedRulesQuery } from "../lib/queries";

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatVisitDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDuration(startMs: number, endMs: number) {
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function EntryQrCode({ value, colors, styles }: { value: string; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.qrFrame}>
      <QRCode value={value} size={190} color={colors.text} backgroundColor={colors.surface} />
    </View>
  );
}

type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function slotAndOverage(config: PricingConfig): { slot: number; overage: number } | null {
  if (config.model === "A") {
    return { slot: config.baseCharge + config.perMinCharge * 60, overage: config.perMinCharge };
  }
  if (config.model === "B") {
    return { slot: config.slotPrice, overage: config.overagePerMin };
  }
  if (config.model === "C") {
    const slab = config.slabs[0];
    if (!slab) return null;
    return { slot: slab.price, overage: config.lateExitPerMin };
  }
  return null;
}

function PricingCard({ pool, colors, styles, t }: { pool: Pool; colors: ThemeColors; styles: ReturnType<typeof createStyles>; t: TFunction }) {
  const config = extractPricingConfig(pool);
  const rates = slotAndOverage(config);

  if (!rates) {
    return (
      <View style={styles.pricingCard}>
        <Text style={styles.pricingUnavailable}>{t("home.pricingUnavailable")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.pricingCard}>
      <View style={styles.pricingRow}>
        <View style={styles.pricingCol}>
          <Text style={styles.pricingLabel}>{t("home.pricingSlot")}</Text>
          <Text style={styles.pricingValue}>₹{rates.slot}</Text>
          <Text style={styles.pricingCaption}>{t("home.pricingFlatRate")}</Text>
        </View>
        <View style={styles.pricingDivider} />
        <View style={styles.pricingCol}>
          <Text style={styles.pricingLabel}>{t("home.pricingOverage")}</Text>
          <Text style={styles.pricingValue}>₹{rates.overage}</Text>
          <Text style={styles.pricingCaption}>{t("home.pricingOverageCaption")}</Text>
        </View>
      </View>
      <View style={styles.pricingFooter}>
        <Text style={styles.pricingFooterText}>{t("home.pricingNoteB")}</Text>
      </View>
    </View>
  );
}

export default function Home() {
  const {
    userName,
    locationLabel,
    members,
    profilePhotoUri,
    uid,
    phoneNumber,
    selectedPoolId,
    gender,
    dateOfBirth,
    dismissedEntryKey: dismissedKey,
    setDismissedEntryKey: setDismissedKey,
  } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selfIncluded, setSelfIncluded] = useState(true);
  const { data: selectedPool = null, isLoading: isPoolLoading, isError: isPoolError, refetch: refetchPool } = usePoolQuery(selectedPoolId);
  const { data: latestEntry = null } = useLatestEntryQuery(selectedPool?.id, uid, (entry) => {
    setDismissedKey(entry ? `${entry.id}:${entry.exitedAt ? "exit" : "entry"}` : null);
  });
  const { data: recentVisitsAll = [] } = useEntriesByUserQuery(selectedPool?.id, uid);
  const recentVisits = useMemo(() => recentVisitsAll.slice(0, 3), [recentVisitsAll]);
  const { data: restrictedRules = [] } = useRestrictedRulesQuery(selectedPool?.id);
  const { data: memberships = [] } = useMembershipsByPhoneQuery(selectedPool?.id, phoneNumber);
  const exitedMembership = latestEntry?.membershipId ? memberships.find((membership) => membership.id === latestEntry.membershipId) ?? null : null;
  const fullName = userName.trim() || t("home.guest");
  const firstName = fullName.split(" ")[0];
  const totalPeople = (selfIncluded ? 1 : 0) + selectedMemberIds.length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("home.greetingMorning") : hour < 17 ? t("home.greetingAfternoon") : t("home.greetingEvening");

  function toggleMember(member: Member) {
    setSelectedMemberIds((selected) => selected.includes(member.id) ? selected.filter((id) => id !== member.id) : [...selected, member.id]);
  }

  const activeEntryKey = latestEntry ? `${latestEntry.id}:${latestEntry.exitedAt ? "exit" : "entry"}` : null;
  const hasActiveEntry = !!latestEntry && !latestEntry.exitedAt;
  const showEntryModal = hasActiveEntry && activeEntryKey !== dismissedKey;
  const showExitModal = !!latestEntry && !!latestEntry.exitedAt && activeEntryKey !== dismissedKey;
  const due =
    latestEntry?.exitedAt && selectedPool
      ? computeDue(latestEntry.pricingSnapshot ?? extractPricingConfig(selectedPool), latestEntry.enteredAt, latestEntry.exitedAt, Math.max(1, latestEntry.people.length))
      : null;

  const activeRestrictedWindows = useMemo(() => activeRulesAt(restrictedRules, new Date()), [restrictedRules]);

  const entryToken = useMemo(() => {
    if (!selectedPool) return "";
    const selectedMembers = members.filter((member) => selectedMemberIds.includes(member.id));
    const people = [
      ...(selfIncluded ? [{ name: fullName, age: ageFromDateOfBirth(dateOfBirth), gender }] : []),
      ...selectedMembers.map((member) => ({
        name: member.name,
        age: ageFromDateOfBirth(member.dateOfBirth),
        gender: member.gender,
      })),
    ];
    return JSON.stringify({
      type: "swimy-entry",
      uid,
      phone: phoneNumber,
      poolId: selectedPool.id,
      people,
      ts: Date.now(),
    });
  }, [selectedPool, uid, phoneNumber, fullName, members, selectedMemberIds, gender, dateOfBirth, selfIncluded]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.locationSelector} activeOpacity={0.75} onPress={() => router.push("/location")}>
            <Ionicons name="location" size={19} color={colors.danger} />
            <Text style={styles.locationName} numberOfLines={1}>{locationLabel || t("home.setLocation")}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity hitSlop={8} onPress={() => router.push("/account")}>{profilePhotoUri ? <Image source={{ uri: profilePhotoUri }} style={styles.headerPhoto} /> : <Ionicons name="person-circle" size={46} color={colors.primary} />}</TouchableOpacity>
          </View>
        </View>

        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.userName}>{firstName} <Text style={styles.wave}>👋</Text></Text>

        <View style={styles.entryCard}>
          <Text style={styles.entryLabel}>{t("home.poolEntryLabel")}</Text>
          {isPoolLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
          ) : isPoolError ? (
            <View style={styles.entryEmpty}>
              <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
              <Text style={styles.entryEmptyTitle}>{t("home.poolLoadError")}</Text>
              <TouchableOpacity style={styles.choosePoolButton} onPress={() => refetchPool()}>
                <Text style={styles.choosePoolText}>{t("common.retry")}</Text>
              </TouchableOpacity>
            </View>
          ) : selectedPool ? (
            <>
              <Text style={styles.entryPoolName}>{selectedPool.name}</Text>
              {activeRestrictedWindows.length > 0 && (
                <Text style={styles.restrictedNotice}>
                  {t("home.restrictedNow", { segments: activeRestrictedWindows.map((rule) => segmentLabel(rule.segment)).join(" / ") })}
                </Text>
              )}
              <EntryQrCode value={entryToken} colors={colors} styles={styles} />
              <View style={styles.scanStatus}><View style={styles.statusDot} /><Text style={styles.statusText}>{t("home.readyToScan")}</Text></View>
            </>
          ) : (
            <View style={styles.entryEmpty}>
              <Ionicons name="qr-code-outline" size={44} color={colors.textFaint} />
              <Text style={styles.entryEmptyTitle}>{t("home.noPoolTitle")}</Text>
              <Text style={styles.entryEmptyText}>{t("home.noPoolText")}</Text>
              <TouchableOpacity style={styles.choosePoolButton} onPress={() => router.push("/pools")}>
                <Text style={styles.choosePoolText}>{t("home.choosePool")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.membersCard}>
          <View style={styles.membersHeader}>
            <View><Text style={styles.membersTitle}>{t("home.whosJoining")}</Text><Text style={styles.membersSubtitle}>{t("home.selectMembers")}</Text></View>
            <View style={styles.countPill}><Text style={styles.countText}>{totalPeople} {totalPeople === 1 ? t("common.person") : t("common.people")}</Text></View>
          </View>

          <MemberRow name={fullName} subtitle={t("home.you")} checked={selfIncluded} onPress={hasActiveEntry ? undefined : () => setSelfIncluded((included) => !included)} colors={colors} styles={styles} />
          {members.map((member) => <MemberRow key={member.id} name={member.name} subtitle={member.relationship} checked={selectedMemberIds.includes(member.id)} onPress={hasActiveEntry ? undefined : () => toggleMember(member)} colors={colors} styles={styles} />)}

          {hasActiveEntry ? (
            <Text style={styles.membersLockedNote}>{t("home.membersLocked")}</Text>
          ) : (
            <TouchableOpacity style={styles.addMember} onPress={() => router.push("/member")}>
              <Ionicons name="add" size={21} color={colors.primary} /><Text style={styles.addMemberText}>{t("home.addMember")}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.visitsCard}>
          <View style={styles.visitsHeader}>
            <Text style={styles.visitsTitle}>{t("home.recentVisits")}</Text>
            {recentVisits.length > 0 && (
              <TouchableOpacity onPress={() => router.push("/account")}><Text style={styles.seeAll}>{t("common.seeAll")}</Text></TouchableOpacity>
            )}
          </View>
          {recentVisits.length > 0 ? (
            recentVisits.map((visit) => (
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
            <>
              <View style={styles.clockCircle}><Ionicons name="time-outline" size={43} color={colors.primary} /></View>
              <Text style={styles.noVisits}>{t("home.noVisits")}</Text>
              <Text style={styles.visitsDescription}>{t("home.noVisitsDesc")}</Text>
            </>
          )}
        </View>

        {selectedPool && (
          <View style={styles.pricingSection}>
            <Text style={styles.pricingTitle}>{t("home.pricingAt", { pool: selectedPool.name })}</Text>
            <PricingCard pool={selectedPool} colors={colors} styles={styles} t={t} />
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}><Ionicons name="home-outline" size={31} color={colors.primary} /><Text style={[styles.navText, styles.navTextActive]}>{t("common.navHome")}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push("/pools")}><Ionicons name="water-outline" size={31} color={colors.icon} /><Text style={styles.navText}>{t("common.navPool")}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push("/account")}><Ionicons name="person-outline" size={31} color={colors.icon} /><Text style={styles.navText}>{t("common.navProfile")}</Text></TouchableOpacity>
      </View>

      <Modal visible={showEntryModal || showExitModal} transparent animationType="fade" onRequestClose={() => setDismissedKey(activeEntryKey)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {showEntryModal ? (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleGreen]}>
                  <Ionicons name="checkmark" size={30} color={colors.success} />
                </View>
                <Text style={styles.modalTitle}>{t("home.entryConfirmed")}</Text>
                <Text style={styles.modalSubtitle}>{t("home.checkedInAt", { pool: selectedPool?.name ?? "" })}</Text>
                {latestEntry && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>{t("home.entryTime")}</Text>
                    <Text style={styles.modalRowValue}>{formatTime(latestEntry.enteredAt)}</Text>
                  </View>
                )}
              </>
            ) : latestEntry?.membershipId ? (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleGreen]}>
                  <Ionicons name="checkmark" size={30} color={colors.success} />
                </View>
                <Text style={styles.modalTitle}>{t("home.sessionCompleted")}</Text>
                {latestEntry.exitedAt && (
                  <>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>{t("home.entryTime")}</Text>
                      <Text style={styles.modalRowValue}>{formatTime(latestEntry.enteredAt)}</Text>
                    </View>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>{t("home.exitTime")}</Text>
                      <Text style={styles.modalRowValue}>{formatTime(latestEntry.exitedAt)}</Text>
                    </View>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>{t("home.timeInPool")}</Text>
                      <Text style={styles.modalRowValue}>{formatDuration(latestEntry.enteredAt, latestEntry.exitedAt)}</Text>
                    </View>
                  </>
                )}
                {exitedMembership && (
                  <>
                    <View style={styles.modalDivider} />
                    <Text style={styles.modalNote}>
                      {exitedMembership.sessions == null
                        ? t("home.sessionUsedNoteUnlimited", { used: exitedMembership.sessionsUsed })
                        : t("home.sessionUsedNote", {
                            remaining: Math.max(0, exitedMembership.sessions - exitedMembership.sessionsUsed),
                            total: exitedMembership.sessions,
                          })}
                    </Text>
                  </>
                )}
              </>
            ) : (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleBlue]}>
                  <Text style={styles.modalRupee}>₹</Text>
                </View>
                <Text style={styles.modalTitle}>{t("home.paymentDue")}</Text>
                {latestEntry?.exitedAt && (
                  <>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>{t("home.entryTime")}</Text>
                      <Text style={styles.modalRowValue}>{formatTime(latestEntry.enteredAt)}</Text>
                    </View>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>{t("home.exitTime")}</Text>
                      <Text style={styles.modalRowValue}>{formatTime(latestEntry.exitedAt)}</Text>
                    </View>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>{t("home.timeInPool")}</Text>
                      <Text style={styles.modalRowValue}>{formatDuration(latestEntry.enteredAt, latestEntry.exitedAt)}</Text>
                    </View>
                    <View style={styles.modalDivider} />
                    {due && (
                      <>
                        {due.lines.map((line, index) => (
                          <View key={index} style={styles.modalRow}>
                            <Text style={styles.modalRowLabel}>{line.label}</Text>
                            <Text style={styles.modalRowValue}>₹{line.amount}</Text>
                          </View>
                        ))}
                        <Text style={styles.modalNote}>{due.note}</Text>
                        <View style={styles.modalDivider} />
                      </>
                    )}
                    <View style={styles.modalRow}>
                      <Text style={styles.modalTotalLabel}>{t("home.totalPaid")}</Text>
                      <Text style={styles.modalTotalValue}>₹{latestEntry.price ?? due?.total ?? 0}</Text>
                    </View>
                  </>
                )}
              </>
            )}
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={() => setDismissedKey(activeEntryKey)}>
              <Text style={styles.modalPrimaryButtonText}>{t("common.ok")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MemberRow({ name, subtitle, checked, onPress, colors, styles }: { name: string; subtitle: string; checked: boolean; onPress?: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return (
    <TouchableOpacity style={styles.memberRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={28} color={checked ? colors.primary : colors.textFaint} />
      <Text style={styles.memberName}>{name}</Text>
      <View style={styles.memberPill}><Text style={styles.memberPillText}>{subtitle}</Text></View>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, container: { flex: 1, backgroundColor: colors.background }, content: { padding: 28, paddingTop: 18, paddingBottom: 124, backgroundColor: colors.background },
  topBar: { height: 57, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  locationSelector: { maxWidth: "62%", height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  locationName: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 14 }, headerActions: { flexDirection: "row", alignItems: "center", gap: 23 }, headerPhoto: { width: 43, height: 43, borderRadius: 22, borderWidth: 2, borderColor: colors.primary },
  greeting: { color: colors.text, fontSize: 24, fontWeight: "700", marginTop: 29 }, userName: { color: colors.text, fontSize: 35, lineHeight: 42, fontWeight: "700", marginTop: 2 }, wave: { fontSize: 28 },
  entryCard: { marginTop: 21, minHeight: 374, borderRadius: 19, borderWidth: 1, borderColor: colors.border, shadowColor: colors.border, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3, alignItems: "center", paddingTop: 30 },
  entryLabel: { color: colors.primary, fontSize: 14, letterSpacing: 1.7, fontWeight: "800" }, entryPoolName: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 10 }, restrictedNotice: { color: colors.danger, fontSize: 12.5, fontWeight: "600", marginTop: 6, textAlign: "center", paddingHorizontal: 16 }, qrFrame: { marginTop: 23, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  scanStatus: { flexDirection: "row", alignItems: "center", marginTop: 24, gap: 8 }, statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }, statusText: { color: colors.success, fontSize: 16, fontWeight: "700" },
  entryEmpty: { alignItems: "center", marginTop: 50, paddingHorizontal: 20, gap: 6 }, entryEmptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 8 }, entryEmptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center" }, choosePoolButton: { marginTop: 16, backgroundColor: colors.primary, height: 46, borderRadius: 12, paddingHorizontal: 22, justifyContent: "center", alignItems: "center" }, choosePoolText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  membersCard: { marginTop: 25, borderRadius: 19, borderWidth: 1, borderColor: colors.border, shadowColor: colors.border, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2, padding: 20 }, membersHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, membersTitle: { color: colors.text, fontSize: 20, fontWeight: "700" }, membersSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 6 }, countPill: { backgroundColor: colors.primary, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 }, countText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  memberRow: { height: 64, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 15, borderBottomWidth: 1, borderColor: colors.border }, memberName: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "700" }, memberPill: { backgroundColor: colors.primarySoft, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 5 }, memberPillText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  addMember: { height: 52, flexDirection: "row", alignItems: "center", gap: 7 }, addMemberText: { color: colors.primary, fontSize: 17, fontWeight: "700" },
  membersLockedNote: { color: colors.textMuted, fontSize: 13, fontStyle: "italic", marginTop: 14 },
  visitsCard: { marginTop: 25, borderRadius: 19, borderWidth: 1, borderColor: colors.border, shadowColor: colors.border, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2, padding: 20, minHeight: 247 }, visitsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, visitsTitle: { color: colors.text, fontSize: 20, fontWeight: "700" }, seeAll: { color: colors.primary, fontSize: 15, fontWeight: "700" }, clockCircle: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 20 }, noVisits: { textAlign: "center", fontSize: 18, color: colors.text, fontWeight: "700", marginTop: 15 }, visitsDescription: { textAlign: "center", color: colors.textMuted, fontSize: 14, marginTop: 9 },
  visitRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }, visitIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, visitCopy: { flex: 1 }, visitDate: { color: colors.text, fontSize: 14.5, fontWeight: "700" }, visitStatus: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 }, visitPrice: { color: colors.text, fontSize: 14, fontWeight: "700" },

  pricingSection: { marginTop: 25 },
  pricingTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 14 },
  pricingCard: { borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  pricingRow: { flexDirection: "row" },
  pricingCol: { flex: 1, alignItems: "center", paddingVertical: 22, paddingHorizontal: 10 },
  pricingDivider: { width: 1, backgroundColor: colors.border },
  pricingLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8 },
  pricingValue: { color: colors.primary, fontSize: 26, fontWeight: "800", marginTop: 8 },
  pricingCaption: { color: colors.textMuted, fontSize: 12.5, marginTop: 4 },
  pricingFooter: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceAlt, paddingVertical: 12, paddingHorizontal: 16 },
  pricingFooterText: { color: colors.textMuted, fontSize: 12.5, textAlign: "center" },
  pricingUnavailable: { color: colors.textMuted, fontSize: 14, textAlign: "center", paddingVertical: 24, paddingHorizontal: 16 },
  bottomNav: { height: 92, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: "row", justifyContent: "space-around", paddingTop: 12, shadowColor: colors.background, elevation: 0 }, navItem: { width: 78, alignItems: "center", gap: 4 }, navText: { fontSize: 13, color: colors.icon, fontWeight: "600" }, navTextActive: { color: colors.primary, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(17,20,28,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 22, padding: 24, alignItems: "center" },
  modalIconCircle: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  modalIconCircleGreen: { backgroundColor: colors.successSoft },
  modalIconCircleBlue: { backgroundColor: colors.primarySoft },
  modalRupee: { fontSize: 28, fontWeight: "800", color: colors.primary },
  modalTitle: { fontSize: 19, fontWeight: "800", color: colors.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 13.5, color: colors.textMuted, textAlign: "center", marginBottom: 14 },
  modalDivider: { height: 1, backgroundColor: colors.border, alignSelf: "stretch", marginVertical: 12 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignSelf: "stretch", paddingVertical: 4 },
  modalRowLabel: { fontSize: 13.5, color: colors.textMuted },
  modalRowValue: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  modalNote: { fontSize: 12, color: colors.primary, alignSelf: "stretch", marginTop: 4 },
  modalTotalLabel: { fontSize: 16, fontWeight: "800", color: colors.text },
  modalTotalValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
  modalPrimaryButton: { height: 52, borderRadius: 14, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 18, backgroundColor: colors.primary },
  modalPrimaryButtonText: { color: "#fff", fontSize: 15.5, fontWeight: "700" },
  });
}
