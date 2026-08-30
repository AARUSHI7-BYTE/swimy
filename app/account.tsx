import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import { shareAsync } from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import { signOutUser } from "../firebaseconfig";
import { errorMessage } from "../lib/query-client";
import { useAuthReady, useMembershipsByPhoneQuery, useMembershipTiersQuery, usePauseMembershipMutation, usePoolQuery, useResumeMembershipMutation } from "../lib/queries";
import { Membership } from "../lib/memberships";
import { ageFromDateOfBirth } from "../lib/age";
import { buildMembershipQrValue, MembershipQrPayload } from "../lib/membership-qr";
import { buildIdCardHtml } from "../lib/id-card";

function formatPhone(digits: string) {
  if (!digits) return "";
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function membershipStatusLabel(membership: Membership, colors: ThemeColors, t: (key: string) => string): { label: string; color: string; softColor: string } {
  if (membership.status === "inactive") return { label: t("account.statusInactive"), color: colors.danger, softColor: colors.dangerSoft };
  if (membership.endDate < Date.now()) return { label: t("account.statusExpired"), color: colors.warning, softColor: colors.warningSoft };
  return { label: t("account.statusActive"), color: colors.success, softColor: colors.successSoft };
}

export default function Account() {
  const { userName, email, phoneNumber, profilePhotoUri, uid, gender, dateOfBirth, selectedPoolId, resetSession } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fullName = userName.trim() || t("home.guest");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [qrModalMembership, setQrModalMembership] = useState<Membership | null>(null);
  const [pauseModalMembership, setPauseModalMembership] = useState<Membership | null>(null);
  const [pauseDays, setPauseDays] = useState(1);
  const qrRefs = useRef<Record<string, { toDataURL: (callback: (base64: string) => void) => void } | null>>({});

  const authReady = useAuthReady();
  const membershipsQuery = useMembershipsByPhoneQuery(selectedPoolId, phoneNumber);
  const poolQuery = usePoolQuery(selectedPoolId);
  const tiersQuery = useMembershipTiersQuery(selectedPoolId);
  const pauseMutation = usePauseMembershipMutation();
  const resumeMutation = useResumeMembershipMutation();
  const memberships = membershipsQuery.data ?? [];
  const tiers = tiersQuery.data ?? [];
  const pool = poolQuery.data ?? null;
  const isLoading = membershipsQuery.isLoading || poolQuery.isLoading;

  // Tier's pauseDaysAllowed minus what this membership has already used -
  // null means the tier has no pause-day limit (unlimited).
  function pauseDaysRemaining(membership: Membership): number | null {
    const tier = tiers.find((t) => t.id === membership.tierId);
    if (!tier || tier.pauseDaysAllowed == null) return null;
    return Math.max(0, tier.pauseDaysAllowed - membership.totalPausedDays);
  }

  useFocusEffect(
    useCallback(() => {
      if (selectedPoolId && phoneNumber && authReady) membershipsQuery.refetch();
      if (selectedPoolId && authReady) poolQuery.refetch();
    }, [selectedPoolId, phoneNumber, authReady])
  );

  const activeCount = memberships.filter((membership) => membership.status === "active" && membership.endDate > Date.now()).length;

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

  function coachingFor(membership: Membership): boolean {
    const match = membership.members.find((member) => member.name.trim().toLowerCase() === fullName.trim().toLowerCase());
    return match?.coaching ?? false;
  }

  // Fixed for the life of the membership - the same QR is scanned at every
  // entry and exit (facility auto-detects which based on whether an entry is
  // already open). A renewed membership gets a new membershipId, so its card
  // naturally carries a different code once this one is used up or expires.
  function qrPayloadFor(membership: Membership): MembershipQrPayload {
    return {
      type: "swimy-membership",
      uid,
      phone: phoneNumber,
      poolId: membership.poolId,
      membershipId: membership.id,
      person: { name: fullName, age: ageFromDateOfBirth(dateOfBirth), gender },
    };
  }

  function viewQr(membership: Membership) {
    setQrModalMembership(membership);
  }

  function openPauseModal(membership: Membership) {
    const remaining = pauseDaysRemaining(membership);
    setPauseDays(remaining == null ? 1 : Math.min(1, remaining));
    setPauseModalMembership(membership);
  }

  async function confirmPause() {
    if (!pauseModalMembership) return;
    setTogglingId(pauseModalMembership.id);
    try {
      await pauseMutation.mutateAsync({ poolId: pauseModalMembership.poolId, membershipId: pauseModalMembership.id, plannedDays: pauseDays });
      setPauseModalMembership(null);
    } catch (error) {
      Alert.alert(t("common.error"), errorMessage(error, "Couldn't pause your membership."));
    } finally {
      setTogglingId(null);
    }
  }

  async function resumeNow(membership: Membership) {
    setTogglingId(membership.id);
    try {
      await resumeMutation.mutateAsync({ poolId: membership.poolId, membership, actor: { actorUid: uid, actorRole: "user" } });
    } catch (error) {
      Alert.alert(t("common.error"), errorMessage(error, "Couldn't resume your membership."));
    } finally {
      setTogglingId(null);
    }
  }

  async function downloadIdCard(membership: Membership) {
    if (!pool) return;
    const qrRef = qrRefs.current[membership.id];
    if (!qrRef) {
      Alert.alert(t("common.error"), errorMessage(null, "QR isn't ready yet - try again in a moment."));
      return;
    }
    setDownloadingId(membership.id);
    try {
      const qrDataUri = await new Promise<string>((resolve) => qrRef.toDataURL((base64) => resolve(`data:image/png;base64,${base64}`)));
      const html = buildIdCardHtml(pool, membership, {
        name: fullName,
        age: ageFromDateOfBirth(dateOfBirth),
        gender,
        phoneDigits: phoneNumber,
        photoUrl: profilePhotoUri,
        coaching: coachingFor(membership),
      }, qrDataUri);
      const { uri } = await Print.printToFileAsync({ html });
      await shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    } catch (error) {
      console.error("ID card generation failed", error);
      Alert.alert(t("common.error"), errorMessage(error, "Couldn't generate your ID card."));
    } finally {
      setDownloadingId(null);
    }
  }

  const accountLinks = [
    { icon: "time-outline" as const, label: t("home.recentVisits"), onPress: () => router.push("/visit-history") },
    { icon: "settings-outline" as const, label: t("account.settings"), onPress: () => router.push("/settings") },
    { icon: "log-out-outline" as const, label: t("account.logout"), onPress: confirmLogout, destructive: true },
  ];

  const hasError = membershipsQuery.isError || poolQuery.isError;
  const loadError = membershipsQuery.error ?? poolQuery.error;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {hasError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorBannerText}>{errorMessage(loadError, "Some account data couldn't load.")}</Text>
            <TouchableOpacity
              onPress={() => {
                if (selectedPoolId && phoneNumber && authReady) membershipsQuery.refetch();
                if (selectedPoolId && authReady) poolQuery.refetch();
              }}
            >
              <Text style={styles.errorBannerRetry}>{t("common.retry")}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.identityRow}>
          {profilePhotoUri ? <Image source={{ uri: profilePhotoUri }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={34} color={colors.textFaint} /></View>}
          <View style={styles.identityInfo}>
            <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
            {!!email && <View style={styles.metaRow}><Ionicons name="mail-outline" size={15} color={colors.textMuted} /><Text style={styles.metaText} numberOfLines={1}>{email}</Text></View>}
            {!!phoneNumber && <View style={styles.metaRow}><Ionicons name="call-outline" size={15} color={colors.textMuted} /><Text style={styles.metaText}>{formatPhone(phoneNumber)}</Text></View>}
          </View>
          <TouchableOpacity style={styles.editButton} onPress={() => router.push("/profile")} hitSlop={8}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("account.memberships")}</Text>
          {activeCount > 0 && (
            <View style={styles.activePill}><Text style={styles.activePillText}>{t("account.activeCount", { count: activeCount })}</Text></View>
          )}
        </View>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : memberships.length ? (
          memberships.map((membership) => {
            const status = membershipStatusLabel(membership, colors, t);
            const totalSessions = membership.sessions;
            const remaining = totalSessions == null ? 0 : Math.max(0, totalSessions - membership.sessionsUsed);
            const progress = totalSessions != null && totalSessions > 0 ? Math.min(1, remaining / totalSessions) : 0;
            const isToggling = togglingId === membership.id;
            return (
              <View key={membership.id} style={styles.membershipCard}>
                <View style={styles.membershipTopRow}>
                  <Text style={styles.membershipTier}>👑 {membership.tierName}</Text>
                  <View style={[styles.statusPill, { backgroundColor: status.softColor }]}>
                    <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                <View style={styles.membershipMetaRow}>
                  <Text style={styles.membershipMetaText}>
                    {totalSessions == null ? t("account.sessionsUsedUnlimited", { used: membership.sessionsUsed }) : t("account.sessionsRemaining", { remaining, total: totalSessions })}
                  </Text>
                  <Text style={styles.membershipMetaText}>{t("account.until", { date: formatDate(membership.endDate) })}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={styles.membershipActionsRow}>
                  <TouchableOpacity style={styles.outlineButton} activeOpacity={0.8} onPress={() => viewQr(membership)}>
                    <Ionicons name="qr-code-outline" size={16} color={colors.text} />
                    <Text style={styles.outlineButtonText}>{t("account.viewQr")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.outlineButton, styles.pauseButton, isToggling && styles.buttonDisabled]}
                    activeOpacity={0.8}
                    onPress={() => (membership.status === "active" ? openPauseModal(membership) : resumeNow(membership))}
                    disabled={isToggling}
                  >
                    {isToggling ? (
                      <ActivityIndicator size="small" color={colors.warning} />
                    ) : (
                      <>
                        <Ionicons name={membership.status === "active" ? "pause" : "play"} size={16} color={colors.warning} />
                        <Text style={styles.pauseButtonText}>{membership.status === "active" ? t("account.pause") : t("account.resume")}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.downloadButton, downloadingId === membership.id && styles.buttonDisabled]}
                  activeOpacity={0.8}
                  onPress={() => downloadIdCard(membership)}
                  disabled={downloadingId === membership.id}
                >
                  {downloadingId === membership.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={16} color={colors.primary} />
                      <Text style={styles.downloadButtonText}>{t("account.downloadIdCard")}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={styles.hiddenQr} pointerEvents="none">
                  <QRCode value={buildMembershipQrValue(qrPayloadFor(membership))} size={300} getRef={(ref) => { qrRefs.current[membership.id] = ref; }} />
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.noMembershipText}>
              {selectedPoolId ? t("account.noMembershipAtPool") : t("account.selectPoolMembership")}
            </Text>
          </View>
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

      <Modal visible={!!qrModalMembership} transparent animationType="fade" onRequestClose={() => setQrModalMembership(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.qrModalCard}>
            {qrModalMembership && (
              <>
                <Text style={styles.qrModalTitle}>{qrModalMembership.tierName}</Text>
                <View style={styles.qrModalFrame}>
                  <QRCode value={buildMembershipQrValue(qrPayloadFor(qrModalMembership))} size={210} color={colors.text} backgroundColor={colors.surface} />
                </View>
                <Text style={styles.qrModalCaption}>{t("account.qrModalCaption")}</Text>
              </>
            )}
            <TouchableOpacity style={styles.qrModalClose} onPress={() => setQrModalMembership(null)}>
              <Text style={styles.qrModalCloseText}>{t("common.done")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!pauseModalMembership} transparent animationType="fade" onRequestClose={() => setPauseModalMembership(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pauseModalCard}>
            {pauseModalMembership && (() => {
              const tier = tiers.find((t) => t.id === pauseModalMembership.tierId);
              const remaining = pauseDaysRemaining(pauseModalMembership);
              const usedUp = remaining === 0;
              return (
                <>
                  <Text style={styles.qrModalTitle}>{t("account.pauseModalTitle")}</Text>
                  <Text style={styles.pauseAllowanceText}>
                    {tier?.pauseDaysAllowed == null
                      ? t("account.pauseAllowanceUnlimited")
                      : usedUp
                        ? t("account.pauseAllowanceUsedUp", { total: tier.pauseDaysAllowed })
                        : t("account.pauseAllowanceRemaining", { remaining: remaining ?? 0, total: tier.pauseDaysAllowed })}
                  </Text>

                  {!usedUp && (
                    <>
                      <Text style={styles.pauseDaysLabel}>{t("account.pauseDaysLabel")}</Text>
                      <View style={styles.pauseStepperRow}>
                        <TouchableOpacity
                          style={styles.pauseStepperButton}
                          onPress={() => setPauseDays((d) => Math.max(1, d - 1))}
                          disabled={pauseDays <= 1}
                        >
                          <Ionicons name="remove" size={20} color={pauseDays <= 1 ? colors.textFaint : colors.text} />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.pauseStepperValue}
                          value={String(pauseDays)}
                          keyboardType="number-pad"
                          onChangeText={(v) => {
                            const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
                            if (Number.isNaN(n)) { setPauseDays(1); return; }
                            setPauseDays(remaining == null ? Math.max(1, n) : Math.min(Math.max(1, n), remaining));
                          }}
                        />
                        <TouchableOpacity
                          style={styles.pauseStepperButton}
                          onPress={() => setPauseDays((d) => (remaining == null ? d + 1 : Math.min(remaining, d + 1)))}
                          disabled={remaining != null && pauseDays >= remaining}
                        >
                          <Ionicons name="add" size={20} color={remaining != null && pauseDays >= remaining ? colors.textFaint : colors.text} />
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  <View style={styles.pauseModalActions}>
                    <TouchableOpacity style={styles.pauseModalCancel} onPress={() => setPauseModalMembership(null)} disabled={togglingId === pauseModalMembership.id}>
                      <Text style={styles.pauseModalCancelText}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    {!usedUp && (
                      <TouchableOpacity
                        style={[styles.pauseModalConfirm, togglingId === pauseModalMembership.id && styles.buttonDisabled]}
                        onPress={confirmPause}
                        disabled={togglingId === pauseModalMembership.id}
                      >
                        {togglingId === pauseModalMembership.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pauseModalConfirmText}>{t("account.pauseConfirm")}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 20, paddingTop: 71, paddingBottom: 120 },

    errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft, marginBottom: 16 },
    errorBannerText: { flex: 1, color: colors.danger, fontSize: 13 },
    errorBannerRetry: { color: colors.danger, fontSize: 13, fontWeight: "700" },
    identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
    avatar: { width: 72, height: 72, borderRadius: 36 },
    avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    identityInfo: { flex: 1, gap: 6 },
    name: { fontSize: 20, fontWeight: "700", color: colors.text },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    metaText: { color: colors.textMuted, fontSize: 13.5 },
    editButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },

    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 28, marginBottom: 13 },
    sectionTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    standaloneTitle: { marginTop: 28, marginBottom: 13 },
    activePill: { backgroundColor: colors.warningSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    activePillText: { color: colors.warning, fontSize: 12, fontWeight: "700" },

    membershipCard: { borderRadius: 16, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: colors.surface, padding: 16, marginBottom: 14, gap: 12 },
    membershipTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    membershipTier: { fontSize: 17, fontWeight: "700", color: colors.text },
    statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    statusPillText: { fontSize: 11.5, fontWeight: "700" },
    membershipMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    membershipMetaText: { color: colors.textMuted, fontSize: 12.5 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
    membershipActionsRow: { flexDirection: "row", gap: 10 },
    outlineButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    outlineButtonText: { color: colors.text, fontSize: 14, fontWeight: "700" },
    pauseButton: { borderColor: colors.warning },
    pauseButtonText: { color: colors.warning, fontSize: 14, fontWeight: "700" },
    buttonDisabled: { opacity: 0.6 },
    downloadButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.primary },
    downloadButtonText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
    hiddenQr: { position: "absolute", opacity: 0, width: 1, height: 1, overflow: "hidden" },

    modalOverlay: { flex: 1, backgroundColor: "rgba(17,20,28,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
    qrModalCard: { width: "100%", maxWidth: 340, backgroundColor: colors.surface, borderRadius: 22, padding: 24, alignItems: "center" },
    qrModalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 14 },
    qrModalFrame: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
    qrModalCaption: { color: colors.textMuted, fontSize: 13, marginTop: 16, textAlign: "center" },
    qrModalClose: { height: 50, borderRadius: 14, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 20, backgroundColor: colors.primary },
    qrModalCloseText: { color: "#fff", fontSize: 15.5, fontWeight: "700" },

    pauseModalCard: { width: "100%", maxWidth: 340, backgroundColor: colors.surface, borderRadius: 22, padding: 24 },
    pauseAllowanceText: { color: colors.textMuted, fontSize: 13.5, textAlign: "center" },
    pauseDaysLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 20, marginBottom: 10, textAlign: "center" },
    pauseStepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
    pauseStepperButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    pauseStepperValue: { minWidth: 56, textAlign: "center", fontSize: 22, fontWeight: "700", color: colors.text, paddingVertical: 0 },
    pauseModalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
    pauseModalCancel: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.border },
    pauseModalCancelText: { color: colors.text, fontSize: 15, fontWeight: "700" },
    pauseModalConfirm: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.warning },
    pauseModalConfirmText: { color: "#fff", fontSize: 15, fontWeight: "700" },

    emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 24, backgroundColor: colors.surface },
    noMembershipText: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 13.5, paddingHorizontal: 20 },

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
