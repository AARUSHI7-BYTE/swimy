import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { createContext, Fragment, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { signOutUser } from "../firebaseconfig";
import { ThemeColors } from "../lib/theme";
import { getUserById, getUserByPhone, Pool, PricingUpdate } from "../lib/firestore";
import { Entry, EntryPerson, getOpenEntry } from "../lib/entries";
import { MembershipQrPayload, parseMembershipQrPayload } from "../lib/membership-qr";
import { computeDue, DueBreakdown, extractPricingConfig, PricingSlab } from "../lib/pricing";
import {
  activeRulesAt,
  evaluateEntry,
  formatRule,
  NewRestrictedRule,
  RestrictedRule,
  Segment,
  segmentLabel,
} from "../lib/restrictedTimings";
import {
  getMembershipById,
  listMembershipsByPhone,
  Membership,
  MembershipMember,
  usableMembership,
} from "../lib/memberships";
import { MembershipAuditType } from "../lib/membershipAuditLog";
import { MembershipTier } from "../lib/membershipTiers";
import { uploadMemberPhoto, uploadPoolPhoto } from "../lib/storage";
import {
  useAddMembershipMutation,
  useAddRuleMutation,
  useAddTierMutation,
  useCheckInMutation,
  useCheckOutMutation,
  useDeleteRuleMutation,
  useEditMembershipMutation,
  useEntriesRangeQuery,
  useMembershipAuditLogQuery,
  useMembershipsByPoolQuery,
  useMembershipTiersQuery,
  usePauseMembershipMutation,
  usePoolsByIdsQuery,
  useRecordMembershipVisitMutation,
  useResumeMembershipMutation,
  useRestrictedRulesQuery,
  useSetTierArchivedMutation,
  useTodayEntriesQuery,
  useUpdatePoolCapacityMutation,
  useUpdatePoolPricingMutation,
  useUpdatePoolProfileMutation,
  useUpdateTierMutation,
} from "../lib/queries";

type ScanMode = "entry" | "exit";
type ConsoleTab = "staff" | "membership" | "settings" | "admin";

type EntryPayload = {
  type: string;
  uid: string;
  phone?: string;
  poolId: string;
  people: EntryPerson[];
  ts: number;
};

function parseEntryPayload(raw: string): EntryPayload | null {
  try {
    const data = JSON.parse(raw);
    if (data && data.type === "swimy-entry" && typeof data.poolId === "string" && typeof data.uid === "string" && Array.isArray(data.people)) {
      return data as EntryPayload;
    }
  } catch {
    // not a Swimy entry QR
  }
  return null;
}

function initialOf(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

function sessionsLabel(sessions: number | null, t: FacilityUIValue["t"]) {
  return sessions == null ? t("facility.membership.sessionsUnlimited") : t("facility.membership.sessions", { count: sessions });
}

function sessionsRemainingLabel(sessions: number | null, sessionsUsed: number, t: FacilityUIValue["t"]) {
  if (sessions == null) return t("facility.staff.sessionsUsedUnlimited", { used: sessionsUsed });
  return t("facility.staff.sessionsRemainingValue", { remaining: Math.max(0, sessions - sessionsUsed), total: sessions });
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startMs: number, endMs: number) {
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatValidUntil(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type FacilityUIValue = {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const FacilityUIContext = createContext<FacilityUIValue | null>(null);

function useFacilityUI() {
  const context = useContext(FacilityUIContext);
  if (!context) {
    throw new Error("useFacilityUI must be used within FacilityConsole");
  }
  return context;
}

function personLine(entry: Entry, t: FacilityUIValue["t"]) {
  const [first, ...rest] = entry.people;
  if (!first) return { name: "Guest", meta: "" };
  const parts = [first.age ? `${first.age} yrs` : null, first.gender || null].filter(Boolean);
  const name = rest.length ? entry.people.map((person) => person.name).join(", ") : first.name;
  return { name, meta: parts.join(" · ") };
}

export default function FacilityConsole() {
  const { role, poolIds, resetSession } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uiValue = useMemo<FacilityUIValue>(() => ({ colors, styles, t }), [colors, styles, t]);

  const { data: pools = [], isLoading, isError, error, refetch } = usePoolsByIdsQuery(poolIds);
  const [activePoolId, setActivePoolId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ConsoleTab>("staff");

  useEffect(() => {
    if (role !== "facility") {
      router.replace("/admin-login");
    }
  }, [role]);

  useEffect(() => {
    setActivePoolId((current) => current ?? pools[0]?.id ?? null);
  }, [pools]);

  function confirmLogout() {
    Alert.alert(t("facility.logoutConfirmTitle"), t("facility.logoutConfirmMsg"), [
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

  if (role !== "facility") {
    return null;
  }

  const activePool = pools.find((pool) => pool.id === activePoolId) ?? null;

  return (
    <FacilityUIContext.Provider value={uiValue}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.logoutCircle} onPress={confirmLogout} hitSlop={8}>
            <Ionicons name="power" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : isError ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text style={styles.emptyTitle}>{t("facility.poolsLoadError")}</Text>
            <Text style={styles.emptyText}>{error instanceof Error ? error.message : ""}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : pools.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="water-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>{t("facility.noPoolTitle")}</Text>
            <Text style={styles.emptyText}>{t("facility.noPoolText")}</Text>
          </View>
        ) : (
          <>
            {pools.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.poolChipRow}>
                {pools.map((pool) => (
                  <TouchableOpacity
                    key={pool.id}
                    style={[styles.poolChip, activePoolId === pool.id && styles.poolChipActive]}
                    onPress={() => setActivePoolId(pool.id)}
                  >
                    <Text style={[styles.poolChipText, activePoolId === pool.id && styles.poolChipTextActive]}>{pool.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.body}>
              {activeTab === "staff" && activePool && <StaffTab pool={activePool} />}
              {activeTab === "membership" && activePool && <MembershipTab pool={activePool} />}
              {activeTab === "settings" && activePool && <SettingsTab pool={activePool} onNavigateTab={setActiveTab} />}
              {activeTab === "admin" && activePool && <AdminTab pool={activePool} />}
            </View>
          </>
        )}

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("staff")}>
            <Ionicons name="people-outline" size={26} color={activeTab === "staff" ? colors.primary : colors.icon} />
            <Text style={[styles.navText, activeTab === "staff" && styles.navTextActive]}>{t("facility.navStaff")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("membership")}>
            <Ionicons name="card-outline" size={26} color={activeTab === "membership" ? colors.primary : colors.icon} />
            <Text style={[styles.navText, activeTab === "membership" && styles.navTextActive]}>{t("facility.navMembership")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("settings")}>
            <Ionicons name="settings-outline" size={26} color={activeTab === "settings" ? colors.primary : colors.icon} />
            <Text style={[styles.navText, activeTab === "settings" && styles.navTextActive]}>{t("facility.navSettings")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("admin")}>
            <Ionicons name="bar-chart-outline" size={26} color={activeTab === "admin" ? colors.primary : colors.icon} />
            <Text style={[styles.navText, activeTab === "admin" && styles.navTextActive]}>{t("facility.navAdmin")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </FacilityUIContext.Provider>
  );
}

function StaffTab({ pool }: { pool: Pool }) {
  const { colors, styles, t } = useFacilityUI();
  const [mode, setMode] = useState<ScanMode>("entry");
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const { data: entries = [] } = useTodayEntriesQuery(pool.id);
  const { data: restrictedRules = [] } = useRestrictedRulesQuery(pool.id);
  const checkInMutation = useCheckInMutation();
  const checkOutMutation = useCheckOutMutation();
  const recordMembershipVisitMutation = useRecordMembershipVisitMutation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [inPoolQuery, setInPoolQuery] = useState("");
  const [enteredQuery, setEnteredQuery] = useState("");
  const [exitedQuery, setExitedQuery] = useState("");
  const [pendingEntry, setPendingEntry] = useState<{ payload: EntryPayload; scannedAt: number } | null>(null);
  const [pendingMemberEntry, setPendingMemberEntry] = useState<{ payload: EntryPayload; membership: Membership; photoUrl?: string; scannedAt: number } | null>(null);
  const [pendingExit, setPendingExit] = useState<{ payload: EntryPayload; entry: Entry; exitedAt: number; due: DueBreakdown } | null>(null);
  const [pendingMemberExit, setPendingMemberExit] = useState<{ payload: EntryPayload; entry: Entry; membership: Membership; photoUrl?: string; exitedAt: number } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 2200);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, permission?.canAskAgain]);

  // Best-effort: coaching enrollment isn't tied to a per-dependent uid
  // anywhere in this codebase, so match by name against the scanning uid's
  // own phone number's memberships. Only resolved when a coaching rule is
  // actually active, to avoid an extra read on every scan.
  async function resolveCoachingByName(uid: string): Promise<(name: string) => boolean> {
    try {
      const user = await getUserById(uid);
      if (!user?.phoneNumber) return () => false;
      const rawPhone = user.phoneNumber.replace(/^\+91/, "");
      const memberships = await listMembershipsByPhone(pool.id, rawPhone);
      const coachingNames = new Set(
        memberships
          .filter((membership) => membership.status === "active")
          .flatMap((membership) => membership.members.filter((member) => member.coaching).map((member) => member.name.trim().toLowerCase()))
      );
      return (name: string) => coachingNames.has((name || "").trim().toLowerCase());
    } catch {
      return () => false;
    }
  }

  // The membership ID card carries one fixed QR for the whole membership
  // (unlike the per-visit home screen QR) - it's scanned at both entry and
  // exit, so this ignores the entry/exit mode toggle entirely and decides
  // which one it is from whether an entry is already open.
  async function handleMembershipScan(scan: MembershipQrPayload) {
    if (scan.poolId !== pool.id) {
      setResult({ success: false, message: t("facility.staff.wrongPool") });
      return;
    }
    setIsProcessing(true);
    try {
      const membership = await getMembershipById(pool.id, scan.membershipId);
      if (!membership || membership.phone !== scan.phone) {
        setResult({ success: false, message: t("facility.staff.invalidQr") });
        return;
      }

      const openEntry = await getOpenEntry(pool.id, scan.uid);
      if (openEntry) {
        const exitedAt = Date.now();
        const user = await getUserById(scan.uid);
        setPendingMemberExit({
          payload: { type: "swimy-entry", uid: scan.uid, phone: scan.phone, poolId: pool.id, people: openEntry.people, ts: Date.now() },
          entry: openEntry,
          membership,
          photoUrl: user?.photoUrl,
          exitedAt,
        });
        return;
      }

      if (!usableMembership([membership])) {
        setResult({ success: false, message: t("facility.staff.membershipNotUsable") });
        return;
      }

      const person: EntryPerson = scan.person ?? { name: "Guest" };
      const now = new Date();
      const activeNow = activeRulesAt(restrictedRules, now);
      const coachingByName = activeNow.some((rule) => rule.segment === "coaching")
        ? await resolveCoachingByName(scan.uid)
        : () => false;
      const segmentCheck = evaluateEntry(restrictedRules, [person], now, coachingByName);
      if (!segmentCheck.allowed) {
        setResult({ success: false, message: segmentCheck.reason ?? t("facility.staff.genericError") });
        return;
      }
      if (typeof pool.maxOccupancy === "number" && pool.maxOccupancy > 0 && inPoolNow.length + 1 > pool.maxOccupancy) {
        setResult({ success: false, message: t("facility.staff.poolFull", { count: inPoolNow.length, max: pool.maxOccupancy }) });
        return;
      }

      const user = await getUserById(scan.uid);
      setPendingMemberEntry({
        payload: { type: "swimy-entry", uid: scan.uid, phone: scan.phone, poolId: pool.id, people: [person], ts: Date.now() },
        membership,
        photoUrl: user?.photoUrl,
        scannedAt: Date.now(),
      });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : t("facility.staff.genericError") });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleScanned({ data }: { data: string }) {
    if (result || isProcessing || pendingEntry || pendingExit || pendingMemberEntry || pendingMemberExit) return;

    const membershipScan = parseMembershipQrPayload(data);
    if (membershipScan) {
      await handleMembershipScan(membershipScan);
      return;
    }

    const payload = parseEntryPayload(data);
    if (!payload) {
      setResult({ success: false, message: t("facility.staff.invalidQr") });
      return;
    }
    if (payload.poolId !== pool.id) {
      setResult({ success: false, message: t("facility.staff.wrongPool") });
      return;
    }

    if (mode === "entry") {
      setIsProcessing(true);
      try {
        const openEntry = await getOpenEntry(pool.id, payload.uid);
        if (openEntry) {
          const name = payload.people[0]?.name ?? "Guest";
          setResult({ success: false, message: t("facility.staff.alreadyCheckedIn", { name }) });
          return;
        }
        const now = new Date();
        const activeNow = activeRulesAt(restrictedRules, now);
        const coachingByName = activeNow.some((rule) => rule.segment === "coaching")
          ? await resolveCoachingByName(payload.uid)
          : () => false;
        const segmentCheck = evaluateEntry(restrictedRules, payload.people, now, coachingByName);
        if (!segmentCheck.allowed) {
          setResult({ success: false, message: segmentCheck.reason ?? t("facility.staff.genericError") });
          return;
        }
        if (typeof pool.maxOccupancy === "number" && pool.maxOccupancy > 0) {
          const wouldBe = inPoolNow.length + payload.people.length;
          if (wouldBe > pool.maxOccupancy) {
            setResult({ success: false, message: t("facility.staff.poolFull", { count: inPoolNow.length, max: pool.maxOccupancy }) });
            return;
          }
        }

        const membership = payload.phone ? usableMembership(await listMembershipsByPhone(pool.id, payload.phone)) : null;
        if (membership) {
          const user = await getUserById(payload.uid);
          setPendingMemberEntry({ payload, membership, photoUrl: user?.photoUrl, scannedAt: Date.now() });
        } else {
          setPendingEntry({ payload, scannedAt: Date.now() });
        }
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const openEntry = await getOpenEntry(pool.id, payload.uid);
      if (!openEntry) {
        setResult({ success: false, message: t("facility.staff.noOpenEntry") });
        return;
      }
      const exitedAt = Date.now();
      if (openEntry.membershipId) {
        const membership = await getMembershipById(pool.id, openEntry.membershipId);
        if (membership) {
          const user = await getUserById(payload.uid);
          setPendingMemberExit({ payload, entry: openEntry, membership, photoUrl: user?.photoUrl, exitedAt });
          return;
        }
      }
      const due = computeDue(openEntry.pricingSnapshot ?? extractPricingConfig(pool), openEntry.enteredAt, exitedAt, Math.max(1, openEntry.people.length));
      setPendingExit({ payload, entry: openEntry, exitedAt, due });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : t("facility.staff.genericError") });
    } finally {
      setIsProcessing(false);
    }
  }

  async function confirmEntry() {
    if (!pendingEntry) return;
    setIsConfirming(true);
    try {
      await checkInMutation.mutateAsync({
        poolId: pool.id,
        uid: pendingEntry.payload.uid,
        people: pendingEntry.payload.people,
        pricingSnapshot: extractPricingConfig(pool),
      });
      const name = pendingEntry.payload.people[0]?.name ?? "Guest";
      setResult({ success: true, message: t("facility.staff.checkedIn", { name }) });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : t("facility.staff.genericError") });
    } finally {
      setIsConfirming(false);
      setPendingEntry(null);
    }
  }

  async function confirmExit() {
    if (!pendingExit) return;
    setIsConfirming(true);
    try {
      await checkOutMutation.mutateAsync({ poolId: pool.id, uid: pendingExit.payload.uid, price: pendingExit.due.total });
      const name = pendingExit.payload.people[0]?.name ?? "Guest";
      setResult({ success: true, message: t("facility.staff.checkedOut", { name }) });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : t("facility.staff.genericError") });
    } finally {
      setIsConfirming(false);
      setPendingExit(null);
    }
  }

  async function confirmMemberEntry() {
    if (!pendingMemberEntry) return;
    setIsConfirming(true);
    try {
      await checkInMutation.mutateAsync({
        poolId: pool.id,
        uid: pendingMemberEntry.payload.uid,
        people: pendingMemberEntry.payload.people,
        pricingSnapshot: extractPricingConfig(pool),
        membershipId: pendingMemberEntry.membership.id,
      });
      const name = pendingMemberEntry.payload.people[0]?.name ?? "Guest";
      setResult({ success: true, message: t("facility.staff.checkedIn", { name }) });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : t("facility.staff.genericError") });
    } finally {
      setIsConfirming(false);
      setPendingMemberEntry(null);
    }
  }

  async function confirmMemberExit() {
    if (!pendingMemberExit) return;
    setIsConfirming(true);
    try {
      await checkOutMutation.mutateAsync({ poolId: pool.id, uid: pendingMemberExit.payload.uid, price: 0 });
      await recordMembershipVisitMutation.mutateAsync({
        poolId: pool.id,
        membershipId: pendingMemberExit.membership.id,
        nextSessionsUsed: pendingMemberExit.membership.sessionsUsed + 1,
      });
      const name = pendingMemberExit.payload.people[0]?.name ?? "Guest";
      setResult({ success: true, message: t("facility.staff.checkedOut", { name }) });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : t("facility.staff.genericError") });
    } finally {
      setIsConfirming(false);
      setPendingMemberExit(null);
    }
  }

  const inPoolNow = useMemo(() => entries.filter((entry) => !entry.exitedAt), [entries]);
  const exitedToday = useMemo(() => entries.filter((entry) => entry.exitedAt), [entries]);

  const filteredInPool = useFilteredEntries(inPoolNow, inPoolQuery);
  const filteredEntered = useFilteredEntries(entries, enteredQuery);
  const filteredExited = useFilteredEntries(exitedToday, exitedQuery);

  return (
    <ScrollView style={styles.staffLayout} contentContainerStyle={styles.staffContent} showsVerticalScrollIndicator={false}>
      <View style={styles.modeToggle}>
        <TouchableOpacity style={[styles.modeButton, mode === "entry" && styles.modeButtonActive]} onPress={() => setMode("entry")}>
          <Ionicons name="arrow-up" size={16} color={mode === "entry" ? "#fff" : colors.textMuted} />
          <Text style={[styles.modeButtonText, mode === "entry" && styles.modeButtonTextActive]}>{t("facility.staff.entry")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeButton, mode === "exit" && styles.modeButtonActive]} onPress={() => setMode("exit")}>
          <Ionicons name="arrow-down" size={16} color={mode === "exit" ? "#fff" : colors.textMuted} />
          <Text style={[styles.modeButtonText, mode === "exit" && styles.modeButtonTextActive]}>{t("facility.staff.exit")}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scannerCard}>
        <Text style={styles.scanTitle}>{t("facility.staff.scanTitle", { mode: mode === "entry" ? t("facility.staff.entry") : t("facility.staff.exit") })}</Text>

        <View style={styles.cameraFrame}>
          {!permission ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
          ) : !permission.granted ? (
            <View style={styles.permissionState}>
              <Ionicons name="camera-outline" size={38} color={colors.textFaint} />
              <Text style={styles.permissionText}>{t("facility.staff.cameraPermissionText")}</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>{t("facility.staff.grantAccess")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={torchOn}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={result || isProcessing || pendingEntry || pendingExit || pendingMemberEntry || pendingMemberExit ? undefined : handleScanned}
              />
              <View style={styles.cornerTL} pointerEvents="none" />
              <View style={styles.cornerTR} pointerEvents="none" />
              <View style={styles.cornerBL} pointerEvents="none" />
              <View style={styles.cornerBR} pointerEvents="none" />
              {result && (
                <View style={styles.resultOverlay}>
                  <Ionicons name={result.success ? "checkmark-circle" : "close-circle"} size={46} color={result.success ? colors.success : colors.danger} />
                  <Text style={styles.resultText}>{result.message}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {permission?.granted && (
          <TouchableOpacity style={styles.flashlightRow} onPress={() => setTorchOn((on) => !on)}>
            <Ionicons name="flashlight-outline" size={17} color={colors.primary} />
            <Text style={styles.flashlightText}>{torchOn ? t("facility.staff.torchOff") : t("facility.staff.torchOn")}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ListSection icon="water-outline" iconColor={colors.primary} emptyIcon="water-outline" title={t("facility.staff.inPoolNow")} count={inPoolNow.length} query={inPoolQuery} onQueryChange={setInPoolQuery} emptyText={t("facility.staff.emptyInPool")}>
        {filteredInPool.map((entry) => {
          const { name, meta } = personLine(entry, t);
          return (
            <EntryRow key={entry.id} name={name} meta={meta} right={<Text style={styles.rowTime}>{formatTime(entry.enteredAt)}</Text>} />
          );
        })}
      </ListSection>

      <ListSection icon="arrow-up-outline" iconColor={colors.text} emptyIcon="people-outline" title={t("facility.staff.enteredToday")} count={entries.length} query={enteredQuery} onQueryChange={setEnteredQuery} emptyText={t("facility.staff.emptyEntered")}>
        {filteredEntered.map((entry) => {
          const { name, meta } = personLine(entry, t);
          return (
            <EntryRow
              key={entry.id}
              name={name}
              meta={meta}
              right={
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowTime}>{formatTime(entry.enteredAt)}</Text>
                  <Text style={styles.rowSubText}>{t("facility.staff.entered")}</Text>
                </View>
              }
            />
          );
        })}
      </ListSection>

      <ListSection icon="arrow-down-outline" iconColor={colors.text} emptyIcon="exit-outline" title={t("facility.staff.exitedToday")} count={exitedToday.length} query={exitedQuery} onQueryChange={setExitedQuery} emptyText={t("facility.staff.emptyExited")}>
        {filteredExited.map((entry) => {
          const { name, meta } = personLine(entry, t);
          return (
            <EntryRow
              key={entry.id}
              name={name}
              meta={meta}
              right={
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowTime}>{formatTime(entry.exitedAt as number)}</Text>
                  <Text style={styles.rowSubText}>{formatDuration(entry.enteredAt, entry.exitedAt as number)}</Text>
                  {entry.price != null && <View style={styles.pricePill}><Text style={styles.pricePillText}>₹{entry.price}</Text></View>}
                </View>
              }
            />
          );
        })}
      </ListSection>

      <Modal
        visible={!!pendingEntry || !!pendingExit || !!pendingMemberEntry || !!pendingMemberExit}
        transparent
        animationType="fade"
        onRequestClose={() => { setPendingEntry(null); setPendingExit(null); setPendingMemberEntry(null); setPendingMemberExit(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {pendingEntry && (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleGreen]}>
                  <Ionicons name="checkmark" size={30} color={colors.success} />
                </View>
                <Text style={styles.modalTitle}>{t("facility.staff.entryConfirmed")}</Text>
                <View style={styles.modalAvatar}>
                  <Text style={styles.modalAvatarText}>{initialOf(pendingEntry.payload.people[0]?.name ?? "?")}</Text>
                </View>
                <Text style={styles.modalName}>{pendingEntry.payload.people[0]?.name ?? "Guest"}</Text>
                {pendingEntry.payload.people.length > 1 && (
                  <Text style={styles.modalExtraNames}>
                    {t("facility.staff.withOthers", { names: pendingEntry.payload.people.slice(1).map((person) => person.name).join(", ") })}
                  </Text>
                )}
                <View style={styles.modalPillRow}>
                  {pendingEntry.payload.people[0]?.age ? (
                    <View style={styles.modalPill}><Text style={styles.modalPillText}>{pendingEntry.payload.people[0].age} yrs</Text></View>
                  ) : null}
                  {pendingEntry.payload.people[0]?.gender ? (
                    <View style={[styles.modalPill, styles.modalPillPink]}><Text style={[styles.modalPillText, styles.modalPillTextPink]}>{pendingEntry.payload.people[0].gender}</Text></View>
                  ) : null}
                </View>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.entryTime")}</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingEntry.scannedAt)}</Text>
                </View>

                <TouchableOpacity style={[styles.modalPrimaryButton, styles.modalPrimaryButtonGreen, isConfirming && styles.primaryButtonDisabled]} onPress={confirmEntry} disabled={isConfirming}>
                  {isConfirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryButtonText}>{t("facility.staff.allowEntry")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalDismiss} onPress={() => setPendingEntry(null)} disabled={isConfirming}>
                  <Text style={styles.modalDismissText}>{t("facility.staff.dismiss")}</Text>
                </TouchableOpacity>
              </>
            )}

            {pendingExit && (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleBlue]}>
                  <Text style={styles.modalRupee}>₹</Text>
                </View>
                <Text style={styles.modalTitle}>{t("facility.staff.paymentDue")}</Text>
                <View style={styles.modalAvatar}>
                  <Text style={styles.modalAvatarText}>{initialOf(pendingExit.payload.people[0]?.name ?? "?")}</Text>
                </View>
                <Text style={styles.modalName}>{pendingExit.payload.people[0]?.name ?? "Guest"}</Text>
                {pendingExit.payload.people.length > 1 && (
                  <Text style={styles.modalExtraNames}>
                    {t("facility.staff.withOthers", { names: pendingExit.payload.people.slice(1).map((person) => person.name).join(", ") })}
                  </Text>
                )}
                <View style={styles.modalPillRow}>
                  {pendingExit.payload.people[0]?.age ? (
                    <View style={styles.modalPill}><Text style={styles.modalPillText}>{pendingExit.payload.people[0].age} yrs</Text></View>
                  ) : null}
                  {pendingExit.payload.people[0]?.gender ? (
                    <View style={[styles.modalPill, styles.modalPillPink]}><Text style={[styles.modalPillText, styles.modalPillTextPink]}>{pendingExit.payload.people[0].gender}</Text></View>
                  ) : null}
                </View>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.entryTime")}</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingExit.entry.enteredAt)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.exitTime")}</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingExit.exitedAt)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.timeInPool")}</Text>
                  <Text style={styles.modalRowValue}>{formatDuration(pendingExit.entry.enteredAt, pendingExit.exitedAt)}</Text>
                </View>

                <View style={styles.modalDivider} />
                {pendingExit.due.lines.map((line, index) => (
                  <View key={index} style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>{line.label}</Text>
                    <Text style={styles.modalRowValue}>₹{line.amount}</Text>
                  </View>
                ))}
                <Text style={styles.modalNote}>{pendingExit.due.note}</Text>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalTotalLabel}>{t("facility.staff.totalDue")}</Text>
                  <Text style={styles.modalTotalValue}>₹{pendingExit.due.total}</Text>
                </View>

                <TouchableOpacity style={[styles.modalPrimaryButton, styles.modalPrimaryButtonGreen, isConfirming && styles.primaryButtonDisabled]} onPress={confirmExit} disabled={isConfirming}>
                  {isConfirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryButtonText}>{t("facility.staff.confirmPayment")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalDismiss} onPress={() => setPendingExit(null)} disabled={isConfirming}>
                  <Text style={styles.modalDismissText}>{t("facility.staff.dismiss")}</Text>
                </TouchableOpacity>
              </>
            )}

            {pendingMemberEntry && (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleAmber]}>
                  <Text style={styles.modalRupee}>👑</Text>
                </View>
                <Text style={styles.modalTitle}>{t("facility.staff.vipMemberEntry")}</Text>
                {pendingMemberEntry.photoUrl ? (
                  <Image source={{ uri: pendingMemberEntry.photoUrl }} style={styles.modalPhoto} />
                ) : (
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>{initialOf(pendingMemberEntry.payload.people[0]?.name ?? "?")}</Text>
                  </View>
                )}
                <Text style={styles.modalName}>{pendingMemberEntry.payload.people[0]?.name ?? "Guest"}</Text>
                {pendingMemberEntry.payload.people.length > 1 && (
                  <Text style={styles.modalExtraNames}>
                    {t("facility.staff.withOthers", { names: pendingMemberEntry.payload.people.slice(1).map((person) => person.name).join(", ") })}
                  </Text>
                )}
                <View style={styles.modalPillRow}>
                  <View style={[styles.modalPill, styles.modalPillAmber]}>
                    <Text style={[styles.modalPillText, styles.modalPillTextAmber]}>🥇 {pendingMemberEntry.membership.tierName}</Text>
                  </View>
                  {pendingMemberEntry.payload.people[0]?.age ? (
                    <View style={styles.modalPill}><Text style={styles.modalPillText}>{pendingMemberEntry.payload.people[0].age} yrs</Text></View>
                  ) : null}
                  {pendingMemberEntry.payload.people[0]?.gender ? (
                    <View style={[styles.modalPill, styles.modalPillPink]}><Text style={[styles.modalPillText, styles.modalPillTextPink]}>{pendingMemberEntry.payload.people[0].gender}</Text></View>
                  ) : null}
                </View>

                <View style={styles.modalInfoBox}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>{t("facility.staff.sessionsRemaining")}</Text>
                    <Text style={styles.modalRowValue}>
                      {sessionsRemainingLabel(pendingMemberEntry.membership.sessions, pendingMemberEntry.membership.sessionsUsed, t)}
                    </Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>{t("facility.staff.validUntil")}</Text>
                    <Text style={styles.modalRowValue}>{formatValidUntil(pendingMemberEntry.membership.endDate)}</Text>
                  </View>
                </View>

                <View style={styles.modalFreeBox}>
                  <Text style={styles.modalFreeBoxTitle}>{t("facility.staff.memberEntryFree")}</Text>
                  <Text style={styles.modalFreeBoxSubtitle}>{t("facility.staff.memberEntryFreeNote")}</Text>
                </View>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.entryTime")}</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingMemberEntry.scannedAt)}</Text>
                </View>

                <TouchableOpacity style={[styles.modalPrimaryButton, styles.modalPrimaryButtonAmber, isConfirming && styles.primaryButtonDisabled]} onPress={confirmMemberEntry} disabled={isConfirming}>
                  {isConfirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryButtonText}>{t("facility.staff.allowMemberEntry")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalDismiss} onPress={() => setPendingMemberEntry(null)} disabled={isConfirming}>
                  <Text style={styles.modalDismissText}>{t("facility.staff.dismiss")}</Text>
                </TouchableOpacity>
              </>
            )}

            {pendingMemberExit && (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleAmber]}>
                  <Text style={styles.modalRupee}>👑</Text>
                </View>
                <Text style={styles.modalTitle}>{t("facility.staff.vipMemberExit")}</Text>
                {pendingMemberExit.photoUrl ? (
                  <Image source={{ uri: pendingMemberExit.photoUrl }} style={styles.modalPhoto} />
                ) : (
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>{initialOf(pendingMemberExit.payload.people[0]?.name ?? "?")}</Text>
                  </View>
                )}
                <Text style={styles.modalName}>{pendingMemberExit.payload.people[0]?.name ?? "Guest"}</Text>
                {pendingMemberExit.payload.people.length > 1 && (
                  <Text style={styles.modalExtraNames}>
                    {t("facility.staff.withOthers", { names: pendingMemberExit.payload.people.slice(1).map((person) => person.name).join(", ") })}
                  </Text>
                )}
                <View style={styles.modalPillRow}>
                  <View style={[styles.modalPill, styles.modalPillAmber]}>
                    <Text style={[styles.modalPillText, styles.modalPillTextAmber]}>🥇 {pendingMemberExit.membership.tierName}</Text>
                  </View>
                </View>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.entryTime")}</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingMemberExit.entry.enteredAt)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.exitTime")}</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingMemberExit.exitedAt)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>{t("facility.staff.timeInPool")}</Text>
                  <Text style={styles.modalRowValue}>{formatDuration(pendingMemberExit.entry.enteredAt, pendingMemberExit.exitedAt)}</Text>
                </View>

                <View style={styles.modalFreeBox}>
                  <Text style={styles.modalFreeBoxTitle}>{t("facility.staff.memberExitFree")}</Text>
                  <Text style={styles.modalFreeBoxSubtitle}>
                    {pendingMemberExit.membership.sessions == null
                      ? t("facility.staff.memberExitFreeNoteUnlimited", { used: pendingMemberExit.membership.sessionsUsed + 1 })
                      : t("facility.staff.memberExitFreeNote", { used: pendingMemberExit.membership.sessionsUsed + 1, total: pendingMemberExit.membership.sessions })}
                  </Text>
                </View>

                <TouchableOpacity style={[styles.modalPrimaryButton, styles.modalPrimaryButtonAmber, isConfirming && styles.primaryButtonDisabled]} onPress={confirmMemberExit} disabled={isConfirming}>
                  {isConfirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryButtonText}>{t("facility.staff.confirmMemberExit")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalDismiss} onPress={() => setPendingMemberExit(null)} disabled={isConfirming}>
                  <Text style={styles.modalDismissText}>{t("facility.staff.dismiss")}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function useFilteredEntries(entries: Entry[], query: string) {
  return useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return entries;
    return entries.filter((entry) => entry.people.some((person) => person.name.toLowerCase().includes(trimmed)));
  }, [entries, query]);
}

function ListSection({
  icon,
  iconColor,
  emptyIcon,
  title,
  count,
  query,
  onQueryChange,
  emptyText,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  title: string;
  count: number;
  query: string;
  onQueryChange: (value: string) => void;
  emptyText: string;
  children: ReactNode;
}) {
  const { colors, styles, t } = useFacilityUI();
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name={icon} size={16} color={iconColor ?? colors.text} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.countPill}><Text style={styles.countPillText}>{count} {count === 1 ? t("facility.staff.person") : t("facility.staff.people")}</Text></View>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput style={styles.searchInput} placeholder={t("facility.staff.filterPlaceholder")} placeholderTextColor={colors.textFaint} value={query} onChangeText={onQueryChange} />
      </View>
      {hasChildren ? (
        children
      ) : (
        <View style={styles.emptySection}>
          <View style={styles.emptyIconCircle}><Ionicons name={emptyIcon} size={26} color={colors.primary} /></View>
          <Text style={styles.sectionEmpty}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

function EntryRow({ name, meta, right }: { name: string; meta: string; right: ReactNode }) {
  const { styles } = useFacilityUI();
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryAvatar}><Text style={styles.entryAvatarText}>{initialOf(name)}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName}>{name}</Text>
        {!!meta && <Text style={styles.entryMeta}>{meta}</Text>}
      </View>
      {right}
    </View>
  );
}

type WizardStep = 1 | 2 | 3 | 4;

type DraftMember = {
  key: string;
  photoUri: string | null;
  name: string;
  age: string;
  gender: string;
  canSwim: boolean;
  coaching: boolean;
  includeInMembership: boolean;
};

function newDraftMember(): DraftMember {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    photoUri: null,
    name: "",
    age: "",
    gender: "Female",
    canSwim: true,
    coaching: false,
    includeInMembership: true,
  };
}

function Stepper({ step }: { step: WizardStep }) {
  const { styles, t } = useFacilityUI();
  const stepItems: { n: WizardStep; label: string }[] = [
    { n: 1, label: t("facility.membership.stepPhone") },
    { n: 2, label: t("facility.membership.stepDetails") },
    { n: 3, label: t("facility.membership.stepTier") },
    { n: 4, label: t("facility.membership.stepReview") },
  ];
  return (
    <View style={styles.stepperRow}>
      {stepItems.map((item, idx) => (
        <Fragment key={item.n}>
          <View style={styles.stepperItem}>
            <View style={[styles.stepCircle, step === item.n && styles.stepCircleActive, step > item.n && styles.stepCircleDone]}>
              {step > item.n ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Text style={[styles.stepCircleText, step === item.n && styles.stepCircleTextActive]}>{item.n}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, step === item.n && styles.stepLabelActive]}>{item.label}</Text>
          </View>
          {idx < stepItems.length - 1 && <View style={[styles.stepLine, step > item.n && styles.stepLineDone]} />}
        </Fragment>
      ))}
    </View>
  );
}

function MembershipTab({ pool }: { pool: Pool }) {
  const { colors, styles, t } = useFacilityUI();
  const { uid, role } = useAppContext();
  const { data: memberships = [], isLoading, isError, error, refetch } = useMembershipsByPoolQuery(pool.id);
  const { data: tiers = [] } = useMembershipTiersQuery(pool.id);
  const availableTiers = useMemo(() => tiers.filter((tier) => !tier.archived), [tiers]);
  const addMembershipMutation = useAddMembershipMutation();
  const pauseMembershipMutation = usePauseMembershipMutation();
  const resumeMembershipMutation = useResumeMembershipMutation();

  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: phone
  const [phone, setPhone] = useState("");
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [existingAccountFound, setExistingAccountFound] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");

  // Step 2: member details
  const [members, setMembers] = useState<DraftMember[]>([newDraftMember()]);
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [acceptRules, setAcceptRules] = useState(false);

  // Step 3: tier
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  // Step 4: review / save
  const [isSaving, setIsSaving] = useState(false);

  async function toggleMembershipStatus(membership: Membership) {
    try {
      if (membership.status === "inactive") {
        await resumeMembershipMutation.mutateAsync({ poolId: pool.id, membership, actor: { actorUid: uid, actorRole: role } });
      } else {
        await pauseMembershipMutation.mutateAsync({ poolId: pool.id, membershipId: membership.id });
      }
    } catch (error) {
      Alert.alert(t("facility.membership.updateFailed"), error instanceof Error ? error.message : t("facility.staff.genericError"));
    }
  }

  function resetWizard() {
    setStep(1);
    setPhone("");
    setPhoneError("");
    setExistingAccountFound(false);
    setVerifiedPhone("");
    setMembers([newDraftMember()]);
    setAcceptRisk(false);
    setAcceptRules(false);
    setSelectedTierId(null);
  }

  async function handleContinueFromPhone() {
    if (phone.trim().length !== 10) {
      setPhoneError(t("facility.membership.mobileNumberError"));
      return;
    }
    setPhoneError("");
    const trimmedPhone = phone.trim();

    setIsCheckingPhone(true);
    setVerifiedPhone(trimmedPhone);
    try {
      const existingUser = await getUserByPhone(`+91${trimmedPhone}`);
      setExistingAccountFound(!!existingUser);
    } catch (error) {
      // Detecting a returning member is a nice-to-have, not a gate - don't
      // block staff from continuing the sign-up if the lookup fails.
      console.error("Existing account lookup failed", error);
      setExistingAccountFound(false);
    } finally {
      setStep(2);
      setIsCheckingPhone(false);
    }
  }

  function updateMember(key: string, patch: Partial<DraftMember>) {
    setMembers((current) => current.map((member) => (member.key === key ? { ...member, ...patch } : member)));
  }

  function removeMember(key: string) {
    setMembers((current) => current.filter((member) => member.key !== key));
  }

  async function takeMemberPhoto(key: string) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("facility.membership.cameraNeeded"), t("facility.membership.cameraNeededDesc"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) updateMember(key, { photoUri: result.assets[0].uri });
  }

  const membersValid = members.length > 0 && members.every((member) => !member.includeInMembership || member.name.trim());
  const declarationsValid = acceptRisk && acceptRules;
  const canProceedFromDetails = membersValid && declarationsValid;

  function handleShowTerms() {
    Alert.alert(t("facility.membership.termsTitle"), t("facility.membership.termsBody"));
  }

  const selectedTier = availableTiers.find((tier) => tier.id === selectedTierId) ?? null;
  const includedMemberCount = members.filter((member) => member.includeInMembership && member.name.trim()).length;
  const totalPrice = selectedTier ? selectedTier.price * Math.max(includedMemberCount, 1) : 0;

  async function handleConfirm() {
    if (!selectedTier) return;
    setIsSaving(true);
    try {
      const includedMembers = members.filter((member) => member.includeInMembership && member.name.trim());
      const uploadedMembers: MembershipMember[] = await Promise.all(
        includedMembers.map(async (member, index) => {
          let photoUrl: string | undefined;
          if (member.photoUri) {
            try {
              photoUrl = await uploadMemberPhoto(pool.id, verifiedPhone, index, member.photoUri);
            } catch (error) {
              console.error("Member photo upload failed", error);
            }
          }
          return {
            name: member.name.trim(),
            age: Number(member.age) || 0,
            gender: member.gender,
            canSwim: member.canSwim,
            coaching: member.coaching,
            includeInMembership: member.includeInMembership,
            ...(photoUrl ? { photoUrl } : {}),
          };
        })
      );

      await addMembershipMutation.mutateAsync({
        membership: {
          poolId: pool.id,
          phone: verifiedPhone,
          isOfflineMember: false,
          members: uploadedMembers,
          tierId: selectedTier.id,
          tierName: selectedTier.name,
          price: totalPrice,
          durationDays: selectedTier.durationDays,
          sessions: selectedTier.sessions,
        },
        actor: { actorUid: uid, actorRole: role },
      });

      Alert.alert(t("facility.membership.createdTitle"), t("facility.membership.createdMsg", { tier: selectedTier.name, count: uploadedMembers.length, plural: uploadedMembers.length === 1 ? "" : "s" }));
      resetWizard();
    } catch (error) {
      Alert.alert(t("facility.membership.createFailed"), error instanceof Error ? error.message : t("facility.staff.genericError"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.tabTitle}>{t("facility.membership.title")}</Text>
      <Stepper step={step} />

      {step === 1 && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>{t("facility.membership.mobileNumber")}</Text>
          <Text style={styles.wizardSubtitle}>{t("facility.membership.mobileNumberDesc")}</Text>

          <Text style={styles.fieldLabel}>{t("facility.membership.mobileNumberLabel")}</Text>
          <View style={styles.phoneInputRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={styles.phoneInputField}
              placeholder={t("facility.membership.mobileNumberPlaceholder")}
              placeholderTextColor={colors.textFaint}
              value={phone}
              onChangeText={(value) => { setPhone(value.replace(/\D/g, "").slice(0, 10)); setPhoneError(""); }}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, (phone.trim().length !== 10 || isCheckingPhone) && styles.primaryButtonDisabled]}
            onPress={handleContinueFromPhone}
            disabled={phone.trim().length !== 10 || isCheckingPhone}
          >
            {isCheckingPhone ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("facility.membership.continue")}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {step === 2 && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>{t("facility.membership.memberDetails")}</Text>
          <Text style={styles.wizardSubtitle}>
            {t("facility.membership.phonePrefix", { phone: verifiedPhone })}
            {existingAccountFound ? <Text style={styles.existingAccountText}>{t("facility.membership.existingAccountFound")}</Text> : null}
          </Text>

          {members.map((member, index) => (
            <MemberDetailsCard
              key={member.key}
              member={member}
              isPrimary={index === 0}
              onChange={(patch) => updateMember(member.key, patch)}
              onRemove={() => removeMember(member.key)}
              onTakePhoto={() => takeMemberPhoto(member.key)}
            />
          ))}

          <TouchableOpacity style={styles.addMemberButton} onPress={() => setMembers((current) => [...current, newDraftMember()])}>
            <Text style={styles.addMemberButtonText}>{t("facility.membership.addMember")}</Text>
          </TouchableOpacity>

          <View style={styles.declarationsCard}>
            <Text style={styles.declarationsTitle}>{t("facility.membership.declarations")}</Text>
            <TouchableOpacity style={styles.declarationRow} onPress={() => setAcceptRisk((value) => !value)} activeOpacity={0.8}>
              <View style={[styles.checkbox, acceptRisk && styles.checkboxChecked]}>{acceptRisk && <Ionicons name="checkmark" size={13} color="#fff" />}</View>
              <Text style={styles.declarationText}>{t("facility.membership.declareRisk")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declarationRow} onPress={() => setAcceptRules((value) => !value)} activeOpacity={0.8}>
              <View style={[styles.checkbox, acceptRules && styles.checkboxChecked]}>{acceptRules && <Ionicons name="checkmark" size={13} color="#fff" />}</View>
              <Text style={styles.declarationText}>
                {t("facility.membership.declareRulesPrefix")}
                <Text style={styles.linkInlineText} onPress={handleShowTerms}>{t("facility.membership.viewTerms")}</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.primaryButton, !canProceedFromDetails && styles.primaryButtonDisabled]} onPress={() => setStep(3)} disabled={!canProceedFromDetails}>
            <Text style={styles.primaryButtonText}>{t("facility.membership.next")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setStep(1)}>
            <Text style={styles.linkText}>{t("facility.membership.back")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 3 && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>{t("facility.membership.selectTier")}</Text>
          <Text style={styles.wizardSubtitle}>{t("facility.membership.selectTierDesc")}</Text>

          {availableTiers.length === 0 ? (
            <Text style={styles.sectionEmpty}>{t("facility.membership.noTiersConfigured")}</Text>
          ) : (
            availableTiers.map((tier) => {
              const selected = selectedTierId === tier.id;
              return (
                <TouchableOpacity key={tier.id} style={[styles.tierCard, selected && styles.tierCardSelected]} onPress={() => setSelectedTierId(tier.id)} activeOpacity={0.85}>
                  {selected && (
                    <View style={styles.tierCheckBadge}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.tierName}>{tier.name}</Text>
                  <View style={styles.tierMetaRow}>
                    <Text style={styles.tierMetaText}>{t("facility.membership.days", { count: tier.durationDays })}</Text>
                    <Text style={styles.tierMetaText}>{sessionsLabel(tier.sessions, t)}</Text>
                  </View>
                  <Text style={styles.tierPrice}>₹{tier.price.toLocaleString("en-IN")}</Text>
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity style={[styles.primaryButton, !selectedTierId && styles.primaryButtonDisabled]} onPress={() => setStep(4)} disabled={!selectedTierId}>
            <Text style={styles.primaryButtonText}>{t("facility.membership.next")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setStep(2)}>
            <Text style={styles.linkText}>{t("facility.membership.back")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 4 && selectedTier && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>{t("facility.membership.reviewTitle")}</Text>
          <Text style={styles.wizardSubtitle}>{t("facility.membership.reviewDesc")}</Text>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionLabel}>{t("facility.membership.members")}</Text>
            {members.filter((member) => member.includeInMembership && member.name.trim()).map((member, index) => (
              <View key={member.key} style={styles.reviewMemberRow}>
                {member.photoUri ? (
                  <Image source={{ uri: member.photoUri }} style={styles.reviewMemberPhoto} />
                ) : (
                  <View style={styles.reviewMemberPhotoPlaceholder}><Ionicons name="help" size={16} color={colors.primary} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{member.name}</Text>
                  <Text style={styles.entryMeta}>
                    {member.age ? `${member.age} yrs · ` : ""}{member.gender} · {member.canSwim ? t("facility.membership.canSwim") : t("facility.membership.cannotSwim")}{member.coaching ? ` · ${t("facility.membership.coaching")}` : ""}
                  </Text>
                </View>
                <View style={styles.memberRolePill}>
                  <Text style={styles.memberRolePillText}>{index === 0 ? t("facility.membership.member") : t("facility.membership.dependent")}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.selectedPlanCard}>
            <Text style={styles.reviewSectionLabel}>{t("facility.membership.selectedPlan")}</Text>
            <Text style={styles.reviewTierName}>{selectedTier.name}</Text>
            <Text style={styles.wizardSubtitle}>{t("facility.membership.days", { count: selectedTier.durationDays })} · {sessionsLabel(selectedTier.sessions, t)}</Text>
            <View style={styles.selectedPlanPriceRow}>
              <Text style={styles.selectedPlanQty}>{includedMemberCount} × ₹{selectedTier.price.toLocaleString("en-IN")}</Text>
              <Text style={styles.tierPrice}>₹{totalPrice.toLocaleString("en-IN")}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.confirmButton, isSaving && styles.primaryButtonDisabled]} onPress={handleConfirm} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmButtonText}>{t("facility.membership.confirmActivate")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setStep(3)} disabled={isSaving}>
            <Text style={styles.linkText}>{t("facility.membership.back")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.tabTitle, { marginTop: 30 }]}>{t("facility.membership.activeMemberships")}</Text>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : isError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error instanceof Error ? error.message : t("facility.membership.loadError")}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : memberships.length === 0 ? (
        <Text style={styles.sectionEmpty}>{t("facility.membership.noMemberships")}</Text>
      ) : (
        memberships.map((membership) => {
          const isDeactivated = membership.status === "inactive";
          const isActive = !isDeactivated && membership.endDate > Date.now();
          const primaryName = membership.members[0]?.name ?? "Member";
          const extra = membership.members.length > 1 ? ` +${membership.members.length - 1}` : "";
          return (
            <View key={membership.id} style={styles.membershipCard}>
              <View style={styles.entryAvatar}><Text style={styles.entryAvatarText}>{initialOf(primaryName)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{primaryName}{extra}</Text>
                <Text style={styles.entryMeta}>{membership.tierName} · ₹{membership.price} · {t("facility.membership.till", { date: new Date(membership.endDate).toLocaleDateString() })}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={[styles.statusPill, isActive ? styles.statusActive : styles.statusExpired]}>
                  <Text style={[styles.statusPillText, isActive ? styles.statusActiveText : styles.statusExpiredText]}>
                    {isDeactivated ? t("facility.membership.inactive") : isActive ? t("facility.membership.active") : t("facility.membership.expired")}
                  </Text>
                </View>
                <TouchableOpacity style={styles.inactiveButton} onPress={() => toggleMembershipStatus(membership)}>
                  <Text style={styles.inactiveButtonText}>{isDeactivated ? t("facility.membership.reactivate") : t("facility.membership.inactive")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const genderChoices = ["Female", "Male", "Other"];

function MemberDetailsCard({
  member,
  isPrimary,
  onChange,
  onRemove,
  onTakePhoto,
}: {
  member: DraftMember;
  isPrimary: boolean;
  onChange: (patch: Partial<DraftMember>) => void;
  onRemove: () => void;
  onTakePhoto: () => void;
}) {
  const { colors, styles, t } = useFacilityUI();
  const [showGenderMenu, setShowGenderMenu] = useState(false);

  return (
    <View style={styles.memberCard}>
      {!isPrimary && (
        <TouchableOpacity style={styles.removeMemberButton} onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color={colors.textFaint} />
        </TouchableOpacity>
      )}

      <View style={styles.photoRow}>
        <TouchableOpacity style={styles.memberPhotoButton} onPress={onTakePhoto} activeOpacity={0.8}>
          {member.photoUri ? <Image source={{ uri: member.photoUri }} style={styles.memberPhoto} /> : <View style={styles.memberPhotoPlaceholder}><Ionicons name="person" size={26} color={colors.textFaint} /></View>}
        </TouchableOpacity>
        <View>
          <TouchableOpacity style={styles.retakeButton} onPress={onTakePhoto}>
            <Text style={styles.retakeButtonText}>{member.photoUri ? t("facility.membership.retakePhoto") : t("facility.membership.takePhoto")}</Text>
          </TouchableOpacity>
          <Text style={styles.cameraHint}>{t("facility.membership.cameraOnly")}</Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>{t("facility.membership.fullName")}</Text>
      <TextInput style={styles.formInput} placeholder={t("facility.membership.fullNamePlaceholder")} placeholderTextColor={colors.textFaint} value={member.name} onChangeText={(value) => onChange({ name: value })} />

      <View style={styles.formRow}>
        <View style={styles.formRowInput}>
          <Text style={styles.fieldLabel}>{t("facility.membership.age")}</Text>
          <TextInput style={styles.formInput} placeholder={t("facility.membership.agePlaceholder")} placeholderTextColor={colors.textFaint} value={member.age} onChangeText={(value) => onChange({ age: value.replace(/\D/g, "").slice(0, 3) })} keyboardType="number-pad" />
        </View>
        <View style={[styles.formRowInput, { position: "relative" }]}>
          <Text style={styles.fieldLabel}>{t("facility.membership.gender")}</Text>
          <TouchableOpacity style={styles.genderSelect} onPress={() => setShowGenderMenu((value) => !value)}>
            <Text style={styles.genderSelectText}>{member.gender}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {showGenderMenu && (
            <View style={styles.genderMenu}>
              {genderChoices.map((option) => (
                <TouchableOpacity key={option} style={styles.genderChoice} onPress={() => { onChange({ gender: option }); setShowGenderMenu(false); }}>
                  <Text style={styles.genderChoiceText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <Text style={styles.fieldLabel}>{t("facility.membership.swimmingAbility")}</Text>
      <View style={styles.formRow}>
        <TouchableOpacity style={[styles.abilityOption, member.canSwim && styles.abilityOptionSelected]} onPress={() => onChange({ canSwim: true })}>
          <Text style={[styles.abilityOptionText, member.canSwim && styles.abilityOptionTextSelected]}>{t("facility.membership.canSwim")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.abilityOption, !member.canSwim && styles.abilityOptionSelected]} onPress={() => onChange({ canSwim: false })}>
          <Text style={[styles.abilityOptionText, !member.canSwim && styles.abilityOptionTextSelected]}>{t("facility.membership.cannotSwim")}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>{t("facility.membership.includeCoaching")}</Text>
          <Text style={styles.switchSubtitle}>{t("facility.membership.includeCoachingDesc")}</Text>
        </View>
        <Switch value={member.coaching} onValueChange={(value) => onChange({ coaching: value })} trackColor={{ false: colors.border, true: colors.primary }} />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchTitle}>{t("facility.membership.includeInMembership")}</Text>
        <Switch value={member.includeInMembership} onValueChange={(value) => onChange({ includeInMembership: value })} trackColor={{ false: colors.border, true: colors.primary }} />
      </View>
    </View>
  );
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function formatDateDMY(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd} / ${mm} / ${date.getFullYear()}`;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

const CHART_DAYS = 7;

function AdminTab({ pool }: { pool: Pool }) {
  const { colors, styles, t } = useFacilityUI();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  const today = startOfDay(new Date());
  const isToday = isSameDay(selectedDate, today);

  const dayStart = selectedDate.getTime();
  const dayEnd = useMemo(() => addDays(selectedDate, 1).getTime(), [selectedDate]);
  const rangeStart = useMemo(() => addDays(selectedDate, -(CHART_DAYS - 1)).getTime(), [selectedDate]);

  const {
    data: dayEntries = [],
    isLoading: isDayLoading,
    isError: isDayError,
    error: dayError,
    refetch: refetchDay,
  } = useEntriesRangeQuery(pool.id, dayStart, dayEnd);
  const { data: weekEntries = [], isLoading: isWeekLoading, isError: isWeekError, refetch: refetchWeek } = useEntriesRangeQuery(pool.id, rangeStart, dayEnd);
  const isLoading = isDayLoading || isWeekLoading;
  const isError = isDayError || isWeekError;

  const inPoolNow = useMemo(() => dayEntries.filter((entry) => !entry.exitedAt), [dayEntries]);

  const stats = useMemo(() => {
    const exited = dayEntries.filter((entry) => entry.exitedAt);
    const revenue = exited.reduce((sum, entry) => sum + (entry.price ?? 0), 0);
    return { revenue, swimmers: dayEntries.length };
  }, [dayEntries]);

  const chartDays = useMemo(() => {
    return Array.from({ length: CHART_DAYS }, (_, i) => {
      const date = addDays(selectedDate, i - (CHART_DAYS - 1));
      const revenue = weekEntries
        .filter((entry) => entry.exitedAt && isSameDay(new Date(entry.enteredAt), date))
        .reduce((sum, entry) => sum + (entry.price ?? 0), 0);
      return { date, revenue };
    });
  }, [selectedDate, weekEntries]);

  const sessions = useMemo(() => [...dayEntries].sort((a, b) => b.enteredAt - a.enteredAt), [dayEntries]);

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.tabTitle}>{t("facility.admin.title")}</Text>
      <Text style={styles.tabSubtitle}>{pool.name}</Text>

      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setSelectedDate((d) => addDays(d, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.dateField}>
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={styles.dateFieldText}>{formatDateDMY(selectedDate)}</Text>
        </View>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={isToday}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={18} color={isToday ? colors.textFaint : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.todayButton, isToday && styles.todayButtonActive]} onPress={() => setSelectedDate(today)}>
          <Text style={[styles.todayButtonText, isToday && styles.todayButtonTextActive]}>{t("facility.admin.today")}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : isError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{dayError instanceof Error ? dayError.message : t("facility.admin.loadError")}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              refetchDay();
              refetchWeek();
            }}
          >
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.poolStatusCard}>
            <View style={styles.poolStatusHeaderBlue}>
              <Text style={styles.poolStatusTitleWhite}>{t("facility.admin.currentlyInPool")}</Text>
              <View style={styles.poolStatusCountBadge}>
                <Text style={styles.poolStatusCountText}>{isToday ? inPoolNow.length : 0}</Text>
              </View>
            </View>
            <View style={styles.poolStatusBody}>
              {!isToday ? (
                <Text style={styles.sectionEmpty}>{t("facility.admin.onlyToday")}</Text>
              ) : inPoolNow.length === 0 ? (
                <Text style={styles.sectionEmpty}>{t("facility.admin.poolEmpty")}</Text>
              ) : (
                inPoolNow.map((entry) => {
                  const { name, meta } = personLine(entry, t);
                  return <EntryRow key={entry.id} name={name} meta={meta} right={<Text style={styles.rowTime}>{formatTime(entry.enteredAt)}</Text>} />;
                })
              )}
            </View>
          </View>

          <View style={styles.sessionsCard}>
            <View style={styles.poolStatusHeader}>
              <Text style={styles.poolStatusTitle}>{t("facility.admin.todaysSessions")}</Text>
              <View style={styles.countPill}><Text style={styles.countPillText}>{sessions.length}</Text></View>
            </View>
            {sessions.length === 0 ? (
              <Text style={styles.sectionEmpty}>{t("facility.admin.noSessions")}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.sessionsHeaderRow}>
                    <Text style={[styles.sessionsHeaderText, styles.colName]}>{t("facility.admin.colName")}</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colAge]}>{t("facility.admin.colAge")}</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colGender]}>{t("facility.admin.colGender")}</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colTime]}>{t("facility.admin.colEntry")}</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colTime]}>{t("facility.admin.colExit")}</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colCharge]}>{t("facility.admin.colCharge")}</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colStatus]}>{t("facility.admin.colStatus")}</Text>
                  </View>
                  {sessions.map((entry) => {
                    const { name } = personLine(entry, t);
                    const age = entry.people[0]?.age;
                    const gender = entry.people[0]?.gender;
                    const inPool = !entry.exitedAt;
                    return (
                      <View key={entry.id} style={styles.sessionsRow}>
                        <Text style={[styles.sessionsCellText, styles.colName, { fontWeight: "700", color: colors.text }]} numberOfLines={1}>{name}</Text>
                        <Text style={[styles.sessionsCellText, styles.colAge]}>{age ?? "—"}</Text>
                        <Text style={[styles.sessionsCellText, styles.colGender]} numberOfLines={1}>{gender || "—"}</Text>
                        <Text style={[styles.sessionsCellText, styles.colTime]}>{formatTime(entry.enteredAt)}</Text>
                        <Text style={[styles.sessionsCellText, styles.colTime]}>{entry.exitedAt ? formatTime(entry.exitedAt) : "—"}</Text>
                        <Text style={[styles.sessionsCellText, styles.colCharge]}>{entry.price != null ? `₹${entry.price}` : "—"}</Text>
                        <View style={styles.colStatus}>
                          <View style={[styles.statusPill, inPool ? styles.statusActive : styles.statusExpired]}>
                            <Text style={[styles.statusPillText, inPool ? styles.statusActiveText : styles.statusExpiredText]}>{inPool ? t("facility.admin.inPool") : t("facility.admin.done")}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          <RevenueChart days={chartDays} />

          <View style={styles.statGrid}>
            <StatCard label={t("facility.admin.totalRevenue")} value={`₹${stats.revenue}`} icon="cash-outline" />
            <StatCard label={t("facility.admin.swimmers")} value={String(stats.swimmers)} icon="water-outline" />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function RevenueChart({ days }: { days: { date: Date; revenue: number }[] }) {
  const { styles, t } = useFacilityUI();
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);
  return (
    <View style={styles.chartCard}>
      <Text style={styles.poolStatusTitle}>{t("facility.admin.revenueTitle", { count: days.length })}</Text>
      <Text style={styles.chartRangeText}>
        {formatDayLabel(days[0].date)} – {formatDayLabel(days[days.length - 1].date)}
      </Text>
      <View style={styles.chartBarsRow}>
        {days.map((d, i) => {
          const heightPct = d.revenue > 0 ? Math.max((d.revenue / maxRevenue) * 100, 6) : 0;
          return (
            <View key={i} style={styles.chartBarColumn}>
              <Text style={styles.chartBarValue}>{d.revenue > 0 ? `₹${d.revenue}` : ""}</Text>
              <View style={styles.chartBarTrack}>
                <View style={[styles.chartBarFill, { height: `${heightPct}%` }]} />
              </View>
              <Text style={styles.chartBarLabel}>{formatDayLabel(d.date)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { colors, styles } = useFacilityUI();
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconCircle}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingsTab({ pool, onNavigateTab }: { pool: Pool; onNavigateTab: (tab: ConsoleTab) => void }) {
  const { colors, styles, t } = useFacilityUI();
  const { language, setLanguage } = useLanguage();
  const { mode, setMode } = useTheme();
  const [activeModal, setActiveModal] = useState<null | "pricing" | "timings" | "capacity" | "profile" | "membership">(null);

  function closeAndRefresh() {
    setActiveModal(null);
  }

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.tabTitle}>{t("facility.settings.title")}</Text>
      <Text style={styles.tabSubtitle}>{pool.name}</Text>

      <Text style={styles.settingsSectionLabel}>{t("facility.settings.poolProfile")}</Text>
      <View style={styles.settingsGroup}>
        <SettingsRow icon="cash-outline" iconBg={colors.primarySoft} iconColor={colors.primary} title={t("facility.settings.pricing")} subtitle={t("facility.settings.pricingSubtitle", { model: pool.pricingModel })} onPress={() => setActiveModal("pricing")} />
        <SettingsRow icon="time-outline" iconBg={colors.warningSoft} iconColor={colors.warning} title={t("facility.settings.restrictedTimings")} subtitle={t("facility.settings.restrictedTimingsSubtitle")} onPress={() => setActiveModal("timings")} />
        <SettingsRow
          icon="people-outline"
          iconBg={colors.successSoft}
          iconColor={colors.success}
          title={t("facility.settings.capacity")}
          subtitle={pool.maxOccupancy ? t("facility.settings.capacitySubtitle", { max: pool.maxOccupancy, live: pool.liveOccupancy ?? 0 }) : t("facility.settings.capacityUnlimited")}
          onPress={() => setActiveModal("capacity")}
          isLast
        />
      </View>

      <View style={styles.settingsGroup}>
        <SettingsRow icon="image-outline" iconBg={colors.primarySoft} iconColor={colors.primary} title={t("facility.settings.poolProfile")} subtitle={t("facility.settings.poolProfileSubtitle")} onPress={() => setActiveModal("profile")} isLast />
      </View>

      <Text style={styles.settingsSectionLabel}>{t("facility.settings.membershipManagement")}</Text>
      <View style={styles.settingsGroup}>
        <SettingsRow
          icon="card-outline"
          iconBg={colors.primarySoft}
          iconColor={colors.primary}
          title={t("facility.settings.membershipManagement")}
          subtitle={t("facility.settings.membershipManagementSubtitle")}
          onPress={() => setActiveModal("membership")}
          isLast
        />
      </View>

      <Text style={styles.settingsSectionLabel}>{t("facility.settings.language")}</Text>
      <View style={styles.settingsGroup}>
        <View style={styles.settingsPickerRow}>
          <View style={styles.settingsIconCircle}>
            <Ionicons name="language-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsRowTitle}>{t("facility.settings.language")}</Text>
            <Text style={styles.settingsRowSubtitle}>{t("facility.settings.languageSubtitle")}</Text>
          </View>
        </View>
        <View style={styles.segmentedRow}>
          <TouchableOpacity style={[styles.segmentedOption, language === "en" && styles.segmentedOptionActive]} onPress={() => setLanguage("en")}>
            <Text style={[styles.segmentedOptionText, language === "en" && styles.segmentedOptionTextActive]}>{t("facility.settings.english")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentedOption, language === "hi" && styles.segmentedOptionActive]} onPress={() => setLanguage("hi")}>
            <Text style={[styles.segmentedOptionText, language === "hi" && styles.segmentedOptionTextActive]}>{t("facility.settings.hindi")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.settingsSectionLabel}>{t("facility.settings.appearance")}</Text>
      <View style={styles.settingsGroup}>
        <View style={styles.settingsPickerRow}>
          <View style={styles.settingsIconCircle}>
            <Ionicons name="contrast-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsRowTitle}>{t("facility.settings.appearance")}</Text>
            <Text style={styles.settingsRowSubtitle}>{t("facility.settings.appearanceSubtitle")}</Text>
          </View>
        </View>
        <View style={styles.segmentedRow}>
          <TouchableOpacity style={[styles.segmentedOption, mode === "light" && styles.segmentedOptionActive]} onPress={() => setMode("light")}>
            <Ionicons name="sunny-outline" size={14} color={mode === "light" ? "#fff" : colors.textMuted} />
            <Text style={[styles.segmentedOptionText, mode === "light" && styles.segmentedOptionTextActive]}>{t("facility.settings.lightMode")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentedOption, mode === "dark" && styles.segmentedOptionActive]} onPress={() => setMode("dark")}>
            <Ionicons name="moon-outline" size={14} color={mode === "dark" ? "#fff" : colors.textMuted} />
            <Text style={[styles.segmentedOptionText, mode === "dark" && styles.segmentedOptionTextActive]}>{t("facility.settings.darkMode")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <PricingModal visible={activeModal === "pricing"} pool={pool} onClose={() => setActiveModal(null)} onSaved={closeAndRefresh} />
      <RestrictedTimingsModal visible={activeModal === "timings"} pool={pool} onClose={() => setActiveModal(null)} />
      <CapacityModal visible={activeModal === "capacity"} pool={pool} onClose={() => setActiveModal(null)} onSaved={closeAndRefresh} />
      <PoolProfileModal visible={activeModal === "profile"} pool={pool} onClose={() => setActiveModal(null)} onSaved={closeAndRefresh} />
      <MembershipManagementModal visible={activeModal === "membership"} pool={pool} onClose={() => setActiveModal(null)} onNavigateTab={onNavigateTab} />
    </ScrollView>
  );
}

function SettingsRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  onPress,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { colors, styles } = useFacilityUI();
  return (
    <TouchableOpacity style={[styles.settingsRow, isLast && styles.settingsRowLast]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.settingsIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

const PRICING_MODELS: { id: "A" | "B" | "C"; labelKey: string }[] = [
  { id: "A", labelKey: "facility.pricing.modelA" },
  { id: "B", labelKey: "facility.pricing.modelB" },
  { id: "C", labelKey: "facility.pricing.modelC" },
];

function PricingModal({ visible, pool, onClose, onSaved }: { visible: boolean; pool: Pool; onClose: () => void; onSaved: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const [model, setModel] = useState<"A" | "B" | "C">(pool.pricingModel === "D" ? "B" : pool.pricingModel);
  const [baseCharge, setBaseCharge] = useState("");
  const [perMinCharge, setPerMinCharge] = useState("");
  const [slotPrice, setSlotPrice] = useState("");
  const [overagePerMin, setOveragePerMin] = useState("");
  const [slabs, setSlabs] = useState<PricingSlab[]>([]);
  const [lateExitPerMin, setLateExitPerMin] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const updatePoolPricingMutation = useUpdatePoolPricingMutation();
  const isSaving = updatePoolPricingMutation.isPending;

  useEffect(() => {
    if (!visible) return;
    setModel(pool.pricingModel === "D" ? "B" : pool.pricingModel);
    setBaseCharge(pool.baseCharge != null ? String(pool.baseCharge) : "");
    setPerMinCharge(pool.perMinCharge != null ? String(pool.perMinCharge) : "");
    setSlotPrice(String(pool.slotPrice ?? pool.pricePerVisit ?? ""));
    setOveragePerMin(pool.overagePerMin != null ? String(pool.overagePerMin) : "");
    setSlabs(pool.slabs ?? []);
    setLateExitPerMin(pool.lateExitPerMin != null ? String(pool.lateExitPerMin) : "");
    setErrorMessage("");
  }, [visible, pool]);

  function addSlab() {
    setSlabs((current) => [...current, { label: "", startMin: 0, endMin: 60, price: 0 }]);
  }
  function updateSlab(index: number, patch: Partial<PricingSlab>) {
    setSlabs((current) => current.map((slab, i) => (i === index ? { ...slab, ...patch } : slab)));
  }
  function removeSlab(index: number) {
    setSlabs((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    let update: PricingUpdate;
    if (model === "A") {
      const base = Number(baseCharge);
      const perMin = Number(perMinCharge);
      if (!baseCharge.trim() || !Number.isFinite(base) || base <= 0 || !perMinCharge.trim() || !Number.isFinite(perMin) || perMin <= 0) {
        setErrorMessage(t("facility.pricing.errorModelA"));
        return;
      }
      update = { pricingModel: "A", baseCharge: base, perMinCharge: perMin };
    } else if (model === "C") {
      if (slabs.length === 0) {
        setErrorMessage(t("facility.pricing.errorModelBNoSlabs"));
        return;
      }
      for (const slab of slabs) {
        if (!slab.label.trim() || slab.price <= 0 || slab.endMin <= slab.startMin) {
          setErrorMessage(t("facility.pricing.errorSlabInvalid"));
          return;
        }
      }
      const late = Number(lateExitPerMin);
      if (!lateExitPerMin.trim() || !Number.isFinite(late) || late <= 0) {
        setErrorMessage(t("facility.pricing.errorLateExit"));
        return;
      }
      update = { pricingModel: "C", slabs, lateExitPerMin: late };
    } else {
      const slot = Number(slotPrice);
      const overage = Number(overagePerMin);
      if (!slotPrice.trim() || !Number.isFinite(slot) || slot <= 0 || !overagePerMin.trim() || !Number.isFinite(overage) || overage <= 0) {
        setErrorMessage(t("facility.pricing.errorModelB"));
        return;
      }
      update = { pricingModel: "B", slotPrice: slot, overagePerMin: overage };
    }

    setErrorMessage("");
    try {
      await updatePoolPricingMutation.mutateAsync({ poolId: pool.id, update });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.pricing.saveFailed"));
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("facility.pricing.title")}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.options}>
              {PRICING_MODELS.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.option, model === m.id && styles.optionSelected]} onPress={() => setModel(m.id)}>
                  <Text style={[styles.optionText, model === m.id && styles.optionTextSelected]}>{t(m.labelKey)}</Text>
                </TouchableOpacity>
              ))}
              <View style={[styles.option, styles.optionDisabled]}>
                <Text style={styles.optionText}>{t("facility.pricing.modelDSoon")}</Text>
              </View>
            </View>

            {model === "A" && (
              <>
                <Text style={styles.fieldLabel}>{t("facility.pricing.baseCharge")}</Text>
                <TextInput style={styles.formInput} value={baseCharge} onChangeText={(v) => setBaseCharge(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="e.g. 50" placeholderTextColor={colors.textFaint} />
                <Text style={styles.fieldLabel}>{t("facility.pricing.perMinCharge")}</Text>
                <TextInput style={styles.formInput} value={perMinCharge} onChangeText={(v) => setPerMinCharge(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="e.g. 2" placeholderTextColor={colors.textFaint} />
              </>
            )}

            {model === "B" && (
              <>
                <Text style={styles.fieldLabel}>{t("facility.pricing.slotPrice")}</Text>
                <TextInput style={styles.formInput} value={slotPrice} onChangeText={(v) => setSlotPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="e.g. 150" placeholderTextColor={colors.textFaint} />
                <Text style={styles.fieldLabel}>{t("facility.pricing.overagePerMin")}</Text>
                <TextInput style={styles.formInput} value={overagePerMin} onChangeText={(v) => setOveragePerMin(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="e.g. 3" placeholderTextColor={colors.textFaint} />
              </>
            )}

            {model === "C" && (
              <>
                {slabs.map((slab, index) => (
                  <View key={index} style={styles.slabCard}>
                    <View style={styles.formRow}>
                      <View style={styles.formRowInput}>
                        <Text style={styles.fieldLabel}>{t("facility.pricing.label")}</Text>
                        <TextInput style={styles.formInput} value={slab.label} onChangeText={(v) => updateSlab(index, { label: v })} placeholder={t("facility.pricing.labelPlaceholder")} placeholderTextColor={colors.textFaint} />
                      </View>
                      <TouchableOpacity onPress={() => removeSlab(index)} style={styles.removeSlabButton} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.formRow}>
                      <View style={styles.formRowInput}>
                        <Text style={styles.fieldLabel}>{t("facility.pricing.startMin")}</Text>
                        <TextInput style={styles.formInput} value={String(slab.startMin)} onChangeText={(v) => updateSlab(index, { startMin: Number(v.replace(/[^0-9]/g, "")) || 0 })} keyboardType="number-pad" />
                      </View>
                      <View style={styles.formRowInput}>
                        <Text style={styles.fieldLabel}>{t("facility.pricing.endMin")}</Text>
                        <TextInput style={styles.formInput} value={String(slab.endMin)} onChangeText={(v) => updateSlab(index, { endMin: Number(v.replace(/[^0-9]/g, "")) || 0 })} keyboardType="number-pad" />
                      </View>
                    </View>
                    <Text style={styles.fieldLabel}>{t("facility.pricing.price")}</Text>
                    <TextInput style={styles.formInput} value={String(slab.price)} onChangeText={(v) => updateSlab(index, { price: Number(v.replace(/[^0-9]/g, "")) || 0 })} keyboardType="number-pad" />
                  </View>
                ))}
                <TouchableOpacity style={styles.addMemberButton} onPress={addSlab}>
                  <Text style={styles.addMemberButtonText}>{t("facility.pricing.addSlab")}</Text>
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>{t("facility.pricing.lateExitPerMin")}</Text>
                <TextInput style={styles.formInput} value={lateExitPerMin} onChangeText={(v) => setLateExitPerMin(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="e.g. 5" placeholderTextColor={colors.textFaint} />
              </>
            )}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <TouchableOpacity style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]} onPress={handleSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("facility.pricing.save")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const SEGMENTS: Segment[] = ["women", "senior", "children", "coaching"];
const DAY_SHORT_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function RestrictedTimingsModal({ visible, pool, onClose }: { visible: boolean; pool: Pool; onClose: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const { data: rules = [], isLoading } = useRestrictedRulesQuery(visible ? pool.id : null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [segment, setSegment] = useState<Segment>("women");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState(() => new Date(0, 0, 0, 8, 0));
  const [endTime, setEndTime] = useState(() => new Date(0, 0, 0, 10, 0));
  const [ageThreshold, setAgeThreshold] = useState("60");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const addRuleMutation = useAddRuleMutation();
  const deleteRuleMutation = useDeleteRuleMutation();
  const isSaving = addRuleMutation.isPending;

  useEffect(() => {
    if (!visible) setShowAddForm(false);
  }, [visible]);

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b)));
  }

  function toMinutes(date: Date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  async function handleAddRule() {
    if (days.length === 0) {
      setErrorMessage(t("facility.timings.errorNoDays"));
      return;
    }
    const startMin = toMinutes(startTime);
    const endMin = toMinutes(endTime);
    if (endMin <= startMin) {
      setErrorMessage(t("facility.timings.errorEndBeforeStart"));
      return;
    }
    const needsAge = segment === "senior" || segment === "children";
    const parsedAge = Number(ageThreshold);
    if (needsAge && (!ageThreshold.trim() || !Number.isFinite(parsedAge) || parsedAge <= 0)) {
      setErrorMessage(t("facility.timings.errorAge"));
      return;
    }
    const rule: NewRestrictedRule = { segment, days, startMin, endMin, ageThreshold: needsAge ? parsedAge : undefined };
    setErrorMessage("");
    try {
      await addRuleMutation.mutateAsync({ poolId: pool.id, rule });
      setShowAddForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.timings.saveFailed"));
    }
  }

  async function handleDelete(rule: RestrictedRule) {
    await deleteRuleMutation.mutateAsync({ poolId: pool.id, ruleId: rule.id });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("facility.timings.title")}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : rules.length === 0 ? (
              <Text style={styles.sectionEmpty}>{t("facility.timings.empty")}</Text>
            ) : (
              rules.map((rule) => (
                <View key={rule.id} style={styles.ruleListRow}>
                  <Text style={styles.ruleListText}>{formatRule(rule)}</Text>
                  <TouchableOpacity onPress={() => handleDelete(rule)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {!showAddForm ? (
              <TouchableOpacity style={styles.addMemberButton} onPress={() => setShowAddForm(true)}>
                <Text style={styles.addMemberButtonText}>{t("facility.timings.addRule")}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.wizardCard}>
                <Text style={styles.fieldLabel}>{t("facility.timings.segment")}</Text>
                <View style={styles.options}>
                  {SEGMENTS.map((s) => (
                    <TouchableOpacity key={s} style={[styles.option, segment === s && styles.optionSelected]} onPress={() => setSegment(s)}>
                      <Text style={[styles.optionText, segment === s && styles.optionTextSelected]}>{segmentLabel(s)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>{t("facility.timings.days")}</Text>
                <View style={styles.options}>
                  {DAY_SHORT_LABELS.map((label, index) => (
                    <TouchableOpacity key={index} style={[styles.dayChip, days.includes(index) && styles.dayChipSelected]} onPress={() => toggleDay(index)}>
                      <Text style={[styles.dayChipText, days.includes(index) && styles.dayChipTextSelected]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formRowInput}>
                    <Text style={styles.fieldLabel}>{t("facility.timings.startTime")}</Text>
                    <TouchableOpacity style={styles.formInput} onPress={() => setShowStartPicker(true)}>
                      <Text style={{ color: colors.text }}>{startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.formRowInput}>
                    <Text style={styles.fieldLabel}>{t("facility.timings.endTime")}</Text>
                    <TouchableOpacity style={styles.formInput} onPress={() => setShowEndPicker(true)}>
                      <Text style={{ color: colors.text }}>{endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showStartPicker && (
                  <DateTimePicker
                    value={startTime}
                    mode="time"
                    display="default"
                    onChange={(_event, selectedDate) => {
                      setShowStartPicker(Platform.OS === "ios");
                      if (selectedDate) setStartTime(selectedDate);
                    }}
                  />
                )}
                {showEndPicker && (
                  <DateTimePicker
                    value={endTime}
                    mode="time"
                    display="default"
                    onChange={(_event, selectedDate) => {
                      setShowEndPicker(Platform.OS === "ios");
                      if (selectedDate) setEndTime(selectedDate);
                    }}
                  />
                )}

                {(segment === "senior" || segment === "children") && (
                  <>
                    <Text style={styles.fieldLabel}>{segment === "senior" ? t("facility.timings.minAge") : t("facility.timings.maxAge")}</Text>
                    <TextInput style={styles.formInput} value={ageThreshold} onChangeText={(v) => setAgeThreshold(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
                  </>
                )}

                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

                <TouchableOpacity style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]} onPress={handleAddRule} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("facility.timings.save")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkRow} onPress={() => setShowAddForm(false)}>
                  <Text style={styles.linkText}>{t("facility.timings.cancel")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CapacityModal({ visible, pool, onClose, onSaved }: { visible: boolean; pool: Pool; onClose: () => void; onSaved: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const [maxOccupancy, setMaxOccupancy] = useState("");
  const [unlimited, setUnlimited] = useState(true);
  const updatePoolCapacityMutation = useUpdatePoolCapacityMutation();
  const isSaving = updatePoolCapacityMutation.isPending;
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!visible) return;
    setMaxOccupancy(pool.maxOccupancy != null ? String(pool.maxOccupancy) : "");
    setUnlimited(pool.maxOccupancy == null);
    setErrorMessage("");
  }, [visible, pool]);

  async function handleSave() {
    setErrorMessage("");
    if (unlimited) {
      try {
        await updatePoolCapacityMutation.mutateAsync({ poolId: pool.id, maxOccupancy: null });
        onSaved();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("facility.capacity.saveFailed"));
      }
      return;
    }
    const value = Number(maxOccupancy);
    if (!maxOccupancy.trim() || !Number.isFinite(value) || value <= 0) {
      setErrorMessage(t("facility.capacity.errorInvalid"));
      return;
    }
    try {
      await updatePoolCapacityMutation.mutateAsync({ poolId: pool.id, maxOccupancy: value });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.capacity.saveFailed"));
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t("facility.capacity.title")}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.tabSubtitle}>{t("facility.capacity.currentlyInPool", { count: Math.max(0, pool.liveOccupancy ?? 0) })}</Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>{t("facility.capacity.unlimited")}</Text>
              <Text style={styles.switchSubtitle}>{t("facility.capacity.unlimitedDesc")}</Text>
            </View>
            <Switch value={unlimited} onValueChange={setUnlimited} trackColor={{ false: colors.border, true: colors.primary }} />
          </View>

          {!unlimited && (
            <>
              <Text style={styles.fieldLabel}>{t("facility.capacity.maxOccupancy")}</Text>
              <TextInput style={styles.formInput} value={maxOccupancy} onChangeText={(v) => setMaxOccupancy(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder={t("facility.capacity.maxOccupancyPlaceholder")} placeholderTextColor={colors.textFaint} />
            </>
          )}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <TouchableOpacity style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]} onPress={handleSave} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("facility.capacity.save")}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PoolProfileModal({ visible, pool, onClose, onSaved }: { visible: boolean; pool: Pool; onClose: () => void; onSaved: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const [operatingHours, setOperatingHours] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const updatePoolProfileMutation = useUpdatePoolProfileMutation();
  const isSaving = updatePoolProfileMutation.isPending;
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!visible) return;
    setOperatingHours(pool.operatingHours ?? "");
    setContactInfo(pool.contactInfo ?? "");
    setPhotos(pool.photos ?? []);
    setPrimaryIndex(pool.primaryPhotoIndex ?? 0);
    setErrorMessage("");
  }, [visible, pool]);

  async function addPhoto(localUri: string) {
    setErrorMessage("");
    try {
      const index = photos.length;
      const url = await uploadPoolPhoto(pool.id, index, localUri);
      setPhotos((current) => [...current, url]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.profile.uploadFailed"));
    }
  }

  async function takePhoto() {
    if (photos.length >= 6) {
      setErrorMessage(t("facility.profile.errorMaxPhotos"));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage(t("facility.profile.errorCamera"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) await addPhoto(result.assets[0].uri);
  }

  async function pickFromGallery() {
    if (photos.length >= 6) {
      setErrorMessage(t("facility.profile.errorMaxPhotos"));
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage(t("facility.profile.errorGallery"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) await addPhoto(result.assets[0].uri);
  }

  function choosePhoto() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: [t("facility.profile.cancel"), t("facility.profile.takePhoto"), t("facility.profile.chooseGallery")], cancelButtonIndex: 0 }, (buttonIndex) => {
        if (buttonIndex === 1) takePhoto();
        if (buttonIndex === 2) pickFromGallery();
      });
    } else {
      Alert.alert(t("facility.profile.addPhotoTitle"), "", [
        { text: t("facility.profile.takePhoto"), onPress: takePhoto },
        { text: t("facility.profile.chooseGallery"), onPress: pickFromGallery },
        { text: t("facility.profile.cancel"), style: "cancel" },
      ]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
    setPrimaryIndex((current) => (current === index ? 0 : current > index ? current - 1 : current));
  }

  async function handleSave() {
    if (!pool.name.trim()) {
      setErrorMessage(t("facility.profile.errorNoName"));
      return;
    }
    setErrorMessage("");
    try {
      await updatePoolProfileMutation.mutateAsync({
        poolId: pool.id,
        update: {
          operatingHours: operatingHours.trim(),
          contactInfo: contactInfo.trim(),
          photos,
          primaryPhotoIndex: Math.min(primaryIndex, Math.max(photos.length - 1, 0)),
        },
      });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.profile.saveFailed"));
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("facility.profile.title")}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t("facility.profile.operatingHours")}</Text>
            <TextInput style={styles.formInput} value={operatingHours} onChangeText={setOperatingHours} placeholder={t("facility.profile.operatingHoursPlaceholder")} placeholderTextColor={colors.textFaint} />

            <Text style={styles.fieldLabel}>{t("facility.profile.contactInfo")}</Text>
            <TextInput style={styles.formInput} value={contactInfo} onChangeText={setContactInfo} placeholder={t("facility.profile.contactInfoPlaceholder")} placeholderTextColor={colors.textFaint} />

            <Text style={styles.fieldLabel}>{t("facility.profile.photos", { count: photos.length })}</Text>
            <View style={styles.photoGrid}>
              {photos.map((uri, index) => (
                <View key={index} style={styles.photoGridItem}>
                  <Image source={{ uri }} style={styles.photoGridImage} />
                  <TouchableOpacity style={styles.photoRemoveButton} onPress={() => removePhoto(index)} hitSlop={6}>
                    <Ionicons name="close-circle" size={20} color={colors.danger} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoPrimaryBadge} onPress={() => setPrimaryIndex(index)} hitSlop={6}>
                    <Ionicons name={primaryIndex === index ? "star" : "star-outline"} size={16} color={primaryIndex === index ? colors.warning : "#fff"} />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 6 && (
                <TouchableOpacity style={styles.photoAddButton} onPress={choosePhoto}>
                  <Ionicons name="add" size={24} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <TouchableOpacity style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]} onPress={handleSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("facility.profile.save")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Membership Management (full-screen push flow) ----------

type MemberFilters = { tierName: string | null; gender: string | null; tenureStatus: TenureFilter; minDays: string; maxDays: string };
type TenureFilter = "all" | "active" | "soon" | "expired";
const DEFAULT_MEMBER_FILTERS: MemberFilters = { tierName: null, gender: null, tenureStatus: "all", minDays: "", maxDays: "" };

type MgmtScreen =
  | { name: "hub" }
  | { name: "tiers" }
  | { name: "addTier"; tier: MembershipTier | null }
  | { name: "signups" }
  | { name: "members" }
  | { name: "filterMembers" }
  | { name: "scanMember" }
  | { name: "memberDetail"; membershipId: string }
  | { name: "adjustDays"; membershipId: string }
  | { name: "history"; membershipId: string };

const TIER_ICON_COLORS = ["#2952e3", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899"];

function daysRemaining(endDate: number): number {
  return Math.ceil((endDate - Date.now()) / (24 * 60 * 60 * 1000));
}

function tenureStatus(membership: Membership, t: FacilityUIValue["t"]): { label: string; kind: "active" | "soon" | "expired" | "paused" } {
  if (membership.status === "inactive") return { label: t("facility.membershipMgmt.paused"), kind: "paused" };
  const remaining = daysRemaining(membership.endDate);
  if (remaining <= 0) return { label: t("facility.membershipMgmt.expired"), kind: "expired" };
  if (remaining <= 7) return { label: t("facility.membershipMgmt.expiringSoon"), kind: "soon" };
  return { label: t("facility.membershipMgmt.active"), kind: "active" };
}

function memberDisplayName(membership: Membership): string {
  return membership.members[0]?.name ?? "Member";
}

function MgmtHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const { colors, styles } = useFacilityUI();
  return (
    <View style={styles.mgmtHeader}>
      <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.mgmtHeaderBack}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.mgmtHeaderTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.mgmtHeaderRight}>{right}</View>
    </View>
  );
}

function MembershipManagementModal({
  visible,
  pool,
  onClose,
  onNavigateTab,
}: {
  visible: boolean;
  pool: Pool;
  onClose: () => void;
  onNavigateTab: (tab: ConsoleTab) => void;
}) {
  const { colors, styles, t } = useFacilityUI();
  const [stack, setStack] = useState<MgmtScreen[]>([{ name: "hub" }]);
  const [filters, setFilters] = useState<MemberFilters>(DEFAULT_MEMBER_FILTERS);
  const { data: memberships = [] } = useMembershipsByPoolQuery(pool.id);

  useEffect(() => {
    if (visible) {
      setStack([{ name: "hub" }]);
      setFilters(DEFAULT_MEMBER_FILTERS);
    }
  }, [visible]);

  function push(screen: MgmtScreen) {
    setStack((current) => [...current, screen]);
  }
  function pop() {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }
  function handleBack() {
    if (stack.length > 1) pop();
    else onClose();
  }

  const screen = stack[stack.length - 1];
  const membershipFor = (membershipId: string) => memberships.find((m) => m.id === membershipId) ?? null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleBack}>
      <SafeAreaView style={styles.mgmtScreen}>
        {screen.name === "hub" && (
          <MembershipHubScreen
            pool={pool}
            onBack={handleBack}
            onOpenTiers={() => push({ name: "tiers" })}
            onOpenSignups={() => push({ name: "signups" })}
            onOpenMembers={() => push({ name: "members" })}
            onCreateTier={() => push({ name: "addTier", tier: null })}
            onScanMember={() => push({ name: "scanMember" })}
            onNewSignup={() => { onClose(); onNavigateTab("membership"); }}
            onOpenReports={() => { onClose(); onNavigateTab("admin"); }}
          />
        )}

        {screen.name === "tiers" && <TiersScreen pool={pool} onBack={handleBack} onAddTier={() => push({ name: "addTier", tier: null })} onEditTier={(tier) => push({ name: "addTier", tier })} />}
        {screen.name === "addTier" && <AddTierScreen pool={pool} tier={screen.tier} onBack={pop} />}
        {screen.name === "signups" && <SignupsScreen pool={pool} onBack={handleBack} onSelectMember={(id) => push({ name: "memberDetail", membershipId: id })} />}
        {screen.name === "members" && (
          <MembersScreen
            pool={pool}
            filters={filters}
            onBack={handleBack}
            onOpenFilters={() => push({ name: "filterMembers" })}
            onQuickTenureFilter={(tenureStatus) => setFilters((f) => ({ ...f, tenureStatus }))}
            onSelectMember={(id) => push({ name: "memberDetail", membershipId: id })}
          />
        )}
        {screen.name === "filterMembers" && <FilterMembersScreen pool={pool} filters={filters} onApply={(next) => { setFilters(next); pop(); }} onBack={pop} />}
        {screen.name === "scanMember" && (
          <ScanMemberScreen
            pool={pool}
            memberships={memberships}
            onBack={pop}
            onFound={(membershipId) => setStack((current) => [...current.slice(0, -1), { name: "memberDetail", membershipId }])}
          />
        )}
        {screen.name === "memberDetail" && (
          <MemberDetailScreen
            pool={pool}
            membership={membershipFor(screen.membershipId)}
            onBack={pop}
            onAdjustDays={() => push({ name: "adjustDays", membershipId: screen.membershipId })}
            onViewHistory={() => push({ name: "history", membershipId: screen.membershipId })}
          />
        )}
        {screen.name === "adjustDays" && <AdjustDaysScreen pool={pool} membership={membershipFor(screen.membershipId)} onBack={pop} />}
        {screen.name === "history" && <MembershipHistoryScreen pool={pool} membership={membershipFor(screen.membershipId)} onBack={pop} />}
      </SafeAreaView>
    </Modal>
  );
}

type OverviewPeriod = "today" | "week" | "month" | "all";

function periodStartMs(period: OverviewPeriod): number {
  const now = new Date();
  if (period === "all") return 0;
  if (period === "today") return startOfDay(now).getTime();
  if (period === "week") return startOfDay(addDays(now, -6)).getTime();
  return startOfDay(addDays(now, -29)).getTime();
}

function MembershipHubScreen({
  pool,
  onBack,
  onOpenTiers,
  onOpenSignups,
  onOpenMembers,
  onCreateTier,
  onScanMember,
  onNewSignup,
  onOpenReports,
}: {
  pool: Pool;
  onBack: () => void;
  onOpenTiers: () => void;
  onOpenSignups: () => void;
  onOpenMembers: () => void;
  onCreateTier: () => void;
  onScanMember: () => void;
  onNewSignup: () => void;
  onOpenReports: () => void;
}) {
  const { colors, styles, t } = useFacilityUI();
  const { data: tiers = [] } = useMembershipTiersQuery(pool.id);
  const { data: memberships = [] } = useMembershipsByPoolQuery(pool.id);
  const [period, setPeriod] = useState<OverviewPeriod>("month");

  const stats = useMemo(() => {
    const cutoff = periodStartMs(period);
    return {
      totalMembers: memberships.length,
      newSignups: memberships.filter((m) => m.startDate >= cutoff).length,
      activeTiers: tiers.filter((tier) => !tier.archived).length,
      activeBookings: memberships.filter((m) => m.status === "active" && m.endDate > Date.now()).length,
    };
  }, [memberships, tiers, period]);

  function choosePeriod() {
    const options: { key: OverviewPeriod; label: string }[] = [
      { key: "today", label: t("facility.membershipMgmt.periodToday") },
      { key: "week", label: t("facility.membershipMgmt.periodWeek") },
      { key: "month", label: t("facility.membershipMgmt.periodMonth") },
      { key: "all", label: t("facility.membershipMgmt.periodAll") },
    ];
    Alert.alert(t("facility.membershipMgmt.choosePeriod"), undefined, options.map((o) => ({ text: o.label, onPress: () => setPeriod(o.key) })));
  }

  function periodLabel() {
    if (period === "today") return t("facility.membershipMgmt.periodToday");
    if (period === "week") return t("facility.membershipMgmt.periodWeek");
    if (period === "all") return t("facility.membershipMgmt.periodAll");
    return t("facility.membershipMgmt.periodMonth");
  }

  return (
    <>
      <MgmtHeader
        title={t("facility.settings.membershipManagement")}
        onBack={onBack}
        right={
          <TouchableOpacity onPress={onOpenReports} hitSlop={8} style={styles.hubReportsButton}>
            <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{t("facility.membershipMgmt.heroLabel")}</Text>
          <Text style={styles.heroTitle}>{t("facility.membershipMgmt.heroTitle")}</Text>
          <Text style={styles.heroSubtitle}>{t("facility.membershipMgmt.heroSubtitle")}</Text>
        </View>

        <Text style={[styles.settingsSectionLabel, { marginTop: 20 }]}>{t("facility.membershipMgmt.quickActions")}</Text>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionCard} onPress={onCreateTier}>
            <View style={[styles.quickActionIconCircle, { backgroundColor: colors.primarySoft }]}><Ionicons name="add-circle-outline" size={22} color={colors.primary} /></View>
            <Text style={styles.quickActionTitle}>{t("facility.membershipMgmt.createTier")}</Text>
            <Text style={styles.quickActionSubtitle}>{t("facility.membershipMgmt.createTierDesc")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionCard} onPress={onNewSignup}>
            <View style={[styles.quickActionIconCircle, { backgroundColor: colors.successSoft }]}><Ionicons name="person-add-outline" size={22} color={colors.success} /></View>
            <Text style={styles.quickActionTitle}>{t("facility.membershipMgmt.newSignupAction")}</Text>
            <Text style={styles.quickActionSubtitle}>{t("facility.membershipMgmt.newSignupActionDesc")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionCard} onPress={onScanMember}>
            <View style={[styles.quickActionIconCircle, { backgroundColor: colors.warningSoft }]}><Ionicons name="qr-code-outline" size={22} color={colors.warning} /></View>
            <Text style={styles.quickActionTitle}>{t("facility.membershipMgmt.scanMember")}</Text>
            <Text style={styles.quickActionSubtitle}>{t("facility.membershipMgmt.scanMemberDesc")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.settingsSectionLabel, { marginTop: 20 }]}>{t("facility.membershipMgmt.management")}</Text>
        <View style={styles.settingsGroup}>
          <SettingsRow icon="pricetags-outline" iconBg={colors.primarySoft} iconColor={colors.primary} title={t("facility.membershipMgmt.tiersTab")} subtitle={t("facility.membershipMgmt.tiersHubSubtitle")} onPress={onOpenTiers} />
          <SettingsRow icon="person-add-outline" iconBg={colors.successSoft} iconColor={colors.success} title={t("facility.membershipMgmt.signupsTab")} subtitle={t("facility.membershipMgmt.signupsHubSubtitle")} onPress={onOpenSignups} />
          <SettingsRow icon="people-outline" iconBg={colors.warningSoft} iconColor={colors.warning} title={t("facility.membershipMgmt.membersTab")} subtitle={t("facility.membershipMgmt.membersHubSubtitle")} onPress={onOpenMembers} isLast />
        </View>

        <View style={styles.overviewCard}>
          <View style={styles.overviewHeader}>
            <Text style={styles.settingsRowTitle}>{t("facility.membershipMgmt.overview")}</Text>
            <TouchableOpacity style={styles.windowPill} onPress={choosePeriod}>
              <Text style={styles.filterChipText}>{periodLabel()}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.overviewStatsRow}>
            <View style={styles.overviewStat}>
              <View style={[styles.overviewStatIconCircle, { backgroundColor: colors.primarySoft }]}><Ionicons name="people-outline" size={16} color={colors.primary} /></View>
              <Text style={styles.overviewStatValue}>{stats.totalMembers}</Text>
              <Text style={styles.overviewStatLabel}>{t("facility.membershipMgmt.totalMembers")}</Text>
            </View>
            <View style={styles.overviewStat}>
              <View style={[styles.overviewStatIconCircle, { backgroundColor: colors.successSoft }]}><Ionicons name="person-add-outline" size={16} color={colors.success} /></View>
              <Text style={styles.overviewStatValue}>{stats.newSignups}</Text>
              <Text style={styles.overviewStatLabel}>{t("facility.membershipMgmt.newSignups")}</Text>
            </View>
            <View style={styles.overviewStat}>
              <View style={[styles.overviewStatIconCircle, { backgroundColor: colors.warningSoft }]}><Ionicons name="pricetag-outline" size={16} color={colors.warning} /></View>
              <Text style={styles.overviewStatValue}>{stats.activeTiers}</Text>
              <Text style={styles.overviewStatLabel}>{t("facility.membershipMgmt.activeTiers")}</Text>
            </View>
            <View style={styles.overviewStat}>
              <View style={[styles.overviewStatIconCircle, { backgroundColor: colors.dangerSoft }]}><Ionicons name="calendar-outline" size={16} color={colors.danger} /></View>
              <Text style={styles.overviewStatValue}>{stats.activeBookings}</Text>
              <Text style={styles.overviewStatLabel}>{t("facility.membershipMgmt.activeBookings")}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function ScanMemberScreen({
  pool,
  memberships,
  onBack,
  onFound,
}: {
  pool: Pool;
  memberships: Membership[];
  onBack: () => void;
  onFound: (membershipId: string) => void;
}) {
  const { colors, styles, t } = useFacilityUI();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, permission?.canAskAgain]);

  function handleScanned({ data }: { data: string }) {
    if (scanned) return;
    const scan = parseMembershipQrPayload(data);
    if (!scan || scan.poolId !== pool.id) {
      setError(t("facility.membershipMgmt.scanInvalid"));
      return;
    }
    const membership = memberships.find((m) => m.id === scan.membershipId);
    if (!membership) {
      setError(t("facility.membershipMgmt.scanNotFound"));
      return;
    }
    setScanned(true);
    setError("");
    onFound(membership.id);
  }

  return (
    <>
      <MgmtHeader title={t("facility.membershipMgmt.scanMember")} onBack={onBack} />
      <View style={{ padding: 20, flex: 1 }}>
        <Text style={styles.wizardSubtitle}>{t("facility.membershipMgmt.scanMemberDesc")}</Text>
        <View style={styles.cameraFrame}>
          {!permission ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
          ) : !permission.granted ? (
            <View style={styles.permissionState}>
              <Ionicons name="camera-outline" size={38} color={colors.textFaint} />
              <Text style={styles.permissionText}>{t("facility.staff.cameraPermissionText")}</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>{t("facility.staff.grantAccess")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView style={StyleSheet.absoluteFillObject} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={scanned ? undefined : handleScanned} />
          )}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </>
  );
}

function TiersScreen({ pool, onBack, onAddTier, onEditTier }: { pool: Pool; onBack: () => void; onAddTier: () => void; onEditTier: (tier: MembershipTier) => void }) {
  const { colors, styles, t } = useFacilityUI();
  const { data: tiers = [], isLoading } = useMembershipTiersQuery(pool.id);
  const setTierArchivedMutation = useSetTierArchivedMutation();

  function openTierMenu(tier: MembershipTier) {
    Alert.alert(
      tier.name,
      undefined,
      [
        { text: t("facility.membershipMgmt.edit"), onPress: () => onEditTier(tier) },
        {
          text: tier.archived ? t("facility.membershipMgmt.unarchive") : t("facility.membershipMgmt.archive"),
          style: tier.archived ? "default" : "destructive",
          onPress: () => setTierArchivedMutation.mutate({ poolId: pool.id, tierId: tier.id, archived: !tier.archived }),
        },
        { text: t("common.cancel"), style: "cancel" },
      ]
    );
  }

  return (
    <>
      <MgmtHeader
        title={t("facility.membershipMgmt.tiersTitle")}
        onBack={onBack}
        right={<TouchableOpacity onPress={onAddTier}><Text style={styles.mgmtHeaderAction}>{t("facility.membershipMgmt.addTierShort")}</Text></TouchableOpacity>}
      />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.wizardSubtitle}>{t("facility.membershipMgmt.tiersSubtitle")}</Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : tiers.length === 0 ? (
          <Text style={[styles.sectionEmpty, { marginTop: 16 }]}>{t("facility.membershipMgmt.noTiers")}</Text>
        ) : (
          tiers.map((tier, index) => (
            <TouchableOpacity key={tier.id} style={styles.tierRowCard} activeOpacity={0.85} onPress={() => onEditTier(tier)}>
              <View style={[styles.tierIconCircle, { backgroundColor: TIER_ICON_COLORS[index % TIER_ICON_COLORS.length] + "22" }]}>
                <Text style={{ fontSize: 20 }}>🏊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{tier.name}{tier.archived ? ` (${t("facility.membershipMgmt.archived")})` : ""}</Text>
                <Text style={styles.entryMeta}>{t("facility.membership.days", { count: tier.durationDays })} · {sessionsLabel(tier.sessions, t)}</Text>
                <Text style={styles.tierPrice}>₹{tier.price.toLocaleString("en-IN")}</Text>
              </View>
              <TouchableOpacity onPress={() => openTierMenu(tier)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="ellipsis-vertical" size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.infoBannerText}>{t("facility.membershipMgmt.tiersInfoBanner")}</Text>
        </View>
      </ScrollView>
    </>
  );
}

function AddTierScreen({ pool, tier, onBack }: { pool: Pool; tier: MembershipTier | null; onBack: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const [name, setName] = useState(tier?.name ?? "");
  const [price, setPrice] = useState(tier ? String(tier.price) : "");
  const [durationDays, setDurationDays] = useState(tier ? String(tier.durationDays) : "");
  const [sessions, setSessions] = useState(tier?.sessions != null ? String(tier.sessions) : "");
  const [pauseDaysAllowed, setPauseDaysAllowed] = useState(tier?.pauseDaysAllowed != null ? String(tier.pauseDaysAllowed) : "");
  const [archived, setArchived] = useState(tier?.archived ?? false);
  const [errorMessage, setErrorMessage] = useState("");
  const addTierMutation = useAddTierMutation();
  const updateTierMutation = useUpdateTierMutation();
  const isSaving = addTierMutation.isPending || updateTierMutation.isPending;

  async function handleSave() {
    const priceNum = Number(price);
    const durationNum = Number(durationDays);
    if (!name.trim() || !price.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      setErrorMessage(t("facility.membershipMgmt.errorRequired"));
      return;
    }
    if (!durationDays.trim() || !Number.isFinite(durationNum) || durationNum <= 0) {
      setErrorMessage(t("facility.membershipMgmt.errorDuration"));
      return;
    }
    const sessionsNum = Number(sessions);
    if (!sessions.trim() || !Number.isFinite(sessionsNum) || sessionsNum <= 0) {
      setErrorMessage(t("facility.membershipMgmt.errorSessions"));
      return;
    }
    const pauseNum = Number(pauseDaysAllowed);
    if (!pauseDaysAllowed.trim() || !Number.isFinite(pauseNum) || pauseNum < 0) {
      setErrorMessage(t("facility.membershipMgmt.errorPauseDays"));
      return;
    }

    setErrorMessage("");
    try {
      if (tier) {
        await updateTierMutation.mutateAsync({
          poolId: pool.id,
          tierId: tier.id,
          update: { name: name.trim(), price: priceNum, durationDays: durationNum, sessions: sessionsNum, pauseDaysAllowed: pauseNum, archived },
        });
      } else {
        await addTierMutation.mutateAsync({
          poolId: pool.id,
          name: name.trim(),
          price: priceNum,
          durationDays: durationNum,
          sessions: sessionsNum,
          pauseDaysAllowed: pauseNum,
          archived,
        });
      }
      onBack();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.staff.genericError"));
    }
  }

  return (
    <>
      <MgmtHeader
        title={tier ? t("facility.membershipMgmt.editTier") : t("facility.membershipMgmt.addTier")}
        onBack={onBack}
        right={
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.mgmtHeaderAction}>{t("facility.membershipMgmt.save")}</Text>}
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.tierName")} <Text style={styles.requiredMark}>*</Text></Text>
        <TextInput style={styles.formInput} placeholder={t("facility.membershipMgmt.tierNamePlaceholder")} placeholderTextColor={colors.textFaint} value={name} onChangeText={setName} />

        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.price")} <Text style={styles.requiredMark}>*</Text></Text>
        <TextInput style={styles.formInput} placeholder={t("facility.membershipMgmt.pricePlaceholder")} placeholderTextColor={colors.textFaint} value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />

        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.durationDays")} <Text style={styles.requiredMark}>*</Text></Text>
        <TextInput style={styles.formInput} placeholder={t("facility.membershipMgmt.durationPlaceholder")} placeholderTextColor={colors.textFaint} value={durationDays} onChangeText={(v) => setDurationDays(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
        <Text style={styles.helperText}>{t("facility.membershipMgmt.durationHelper")}</Text>

        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.sessionsIncluded")} <Text style={styles.requiredMark}>*</Text></Text>
        <TextInput style={styles.formInput} placeholder={t("facility.membershipMgmt.sessionsPlaceholder")} placeholderTextColor={colors.textFaint} value={sessions} onChangeText={(v) => setSessions(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
        <Text style={styles.helperText}>{t("facility.membershipMgmt.sessionsHelper")}</Text>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t("facility.membershipMgmt.pauseDaysAllowed")} <Text style={styles.requiredMark}>*</Text></Text>
        <TextInput style={styles.formInput} placeholder={t("facility.membershipMgmt.pauseDaysPlaceholder")} placeholderTextColor={colors.textFaint} value={pauseDaysAllowed} onChangeText={(v) => setPauseDaysAllowed(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
        <Text style={styles.helperText}>{t("facility.membershipMgmt.pauseDaysHelper")}</Text>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t("facility.membershipMgmt.status")}</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity style={[styles.modeButton, !archived && styles.modeButtonActive]} onPress={() => setArchived(false)}>
            <Text style={[styles.modeButtonText, !archived && styles.modeButtonTextActive]}>{t("facility.membershipMgmt.statusActive")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeButton, archived && styles.modeButtonActive]} onPress={() => setArchived(true)}>
            <Text style={[styles.modeButtonText, archived && styles.modeButtonTextActive]}>{t("facility.membershipMgmt.statusArchive")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>{t("facility.membershipMgmt.statusHelper")}</Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </ScrollView>
    </>
  );
}

const SIGNUP_WINDOW_OPTIONS = [7, 30, 90, 365];

function SignupsScreen({ pool, onBack, onSelectMember }: { pool: Pool; onBack: () => void; onSelectMember: (membershipId: string) => void }) {
  const { colors, styles, t } = useFacilityUI();
  const { data: memberships = [], isLoading } = useMembershipsByPoolQuery(pool.id);
  const [windowDays, setWindowDays] = useState(30);

  const recent = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return memberships.filter((m) => m.startDate >= cutoff).sort((a, b) => b.startDate - a.startDate);
  }, [memberships, windowDays]);

  function chooseWindow() {
    Alert.alert(
      t("facility.membershipMgmt.chooseWindow"),
      undefined,
      SIGNUP_WINDOW_OPTIONS.map((days) => ({ text: t("facility.membershipMgmt.lastNDays", { count: days }), onPress: () => setWindowDays(days) }))
    );
  }

  return (
    <>
      <MgmtHeader title={t("facility.membershipMgmt.signupsTitle")} onBack={onBack} />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.signupCountCard}>
          <View>
            <Text style={styles.signupCountNumber}>{recent.length}</Text>
            <Text style={styles.signupCountLabel}>{t("facility.membershipMgmt.newSignups")}</Text>
          </View>
          <TouchableOpacity style={styles.windowPill} onPress={chooseWindow}>
            <Text style={styles.filterChipText}>{t("facility.membershipMgmt.lastNDays", { count: windowDays })}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 12 }]}>{t("facility.membershipMgmt.recentSignups")}</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : recent.length === 0 ? (
          <Text style={styles.sectionEmpty}>{t("facility.membershipMgmt.noSignups")}</Text>
        ) : (
          recent.map((membership) => <MemberListRow key={membership.id} membership={membership} onPress={() => onSelectMember(membership.id)} compact />)
        )}
      </ScrollView>
    </>
  );
}

function MemberListRow({ membership, onPress, compact }: { membership: Membership; onPress: () => void; compact?: boolean }) {
  const { colors, styles, t } = useFacilityUI();
  const name = memberDisplayName(membership);
  const status = tenureStatus(membership, t);
  const statusColor = status.kind === "active" ? colors.success : status.kind === "soon" ? colors.warning : status.kind === "paused" ? colors.textMuted : colors.danger;
  const remaining = daysRemaining(membership.endDate);
  const isUnlimited = membership.sessions == null;
  const progress = !isUnlimited && membership.sessions! > 0 ? Math.min(1, membership.sessionsUsed / membership.sessions!) : 0;

  return (
    <TouchableOpacity style={styles.membershipCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.entryAvatar}><Text style={styles.entryAvatarText}>{initialOf(name)}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName}>{name}</Text>
        <Text style={styles.entryMeta}>{membership.tierName}</Text>
        {compact ? (
          <Text style={styles.entryMeta}>{new Date(membership.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</Text>
        ) : (
          <>
            <Text style={styles.entryMeta}>
              {new Date(membership.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {new Date(membership.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
            {status.kind !== "paused" && (
              <Text style={[styles.entryMeta, { color: statusColor, fontWeight: "700" }]}>{remaining > 0 ? t("facility.membershipMgmt.daysLeft", { count: remaining }) : t("facility.membershipMgmt.expired")}</Text>
            )}
            {isUnlimited ? (
              <Text style={styles.entryMeta}>{t("facility.membershipMgmt.sessionsRunning", { used: membership.sessionsUsed })}</Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                <View style={styles.sessionBarTrack}><View style={[styles.sessionBarFill, { width: `${progress * 100}%`, backgroundColor: statusColor }]} /></View>
                <Text style={styles.entryMeta}>{membership.sessionsUsed}/{membership.sessions}</Text>
              </View>
            )}
          </>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={styles.entryMeta}>{membership.members[0]?.gender?.[0] ?? ""}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </TouchableOpacity>
  );
}

function applyMemberFilters(memberships: Membership[], query: string, filters: MemberFilters, t: FacilityUIValue["t"]): Membership[] {
  const trimmed = query.trim().toLowerCase();
  const min = filters.minDays.trim() ? Number(filters.minDays) : null;
  const max = filters.maxDays.trim() ? Number(filters.maxDays) : null;
  return memberships.filter((membership) => {
    if (trimmed && !membership.members.some((member) => member.name.toLowerCase().includes(trimmed))) return false;
    if (filters.tierName && membership.tierName !== filters.tierName) return false;
    if (filters.gender && membership.members[0]?.gender !== filters.gender) return false;
    if (filters.tenureStatus !== "all") {
      const status = tenureStatus(membership, t).kind;
      if (filters.tenureStatus === "active" && status !== "active") return false;
      if (filters.tenureStatus === "soon" && status !== "soon") return false;
      if (filters.tenureStatus === "expired" && status !== "expired") return false;
    }
    const remaining = daysRemaining(membership.endDate);
    if (min != null && Number.isFinite(min) && remaining < min) return false;
    if (max != null && Number.isFinite(max) && remaining > max) return false;
    return true;
  });
}

function MembersScreen({
  pool,
  filters,
  onBack,
  onOpenFilters,
  onQuickTenureFilter,
  onSelectMember,
}: {
  pool: Pool;
  filters: MemberFilters;
  onBack: () => void;
  onOpenFilters: () => void;
  onQuickTenureFilter: (tenureStatus: TenureFilter) => void;
  onSelectMember: (membershipId: string) => void;
}) {
  const { colors, styles, t } = useFacilityUI();
  const { data: memberships = [], isLoading } = useMembershipsByPoolQuery(pool.id);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => applyMemberFilters(memberships, query, filters, t), [memberships, query, filters, t]);
  const activeFilterCount = (filters.tierName ? 1 : 0) + (filters.gender ? 1 : 0) + (filters.minDays || filters.maxDays ? 1 : 0);

  return (
    <>
      <MgmtHeader
        title={t("facility.membershipMgmt.membersTitle")}
        onBack={onBack}
        right={
          <TouchableOpacity onPress={onOpenFilters} hitSlop={8}>
            <View>
              <Ionicons name="filter" size={20} color={colors.text} />
              {activeFilterCount > 0 && <View style={styles.filterBadge} />}
            </View>
          </TouchableOpacity>
        }
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput style={styles.searchInput} placeholder={t("facility.membershipMgmt.searchMembers")} placeholderTextColor={colors.textFaint} value={query} onChangeText={setQuery} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(["all", "active", "soon", "expired"] as TenureFilter[]).map((f) => (
            <TouchableOpacity key={f} style={[styles.filterChip, filters.tenureStatus === f && styles.filterChipActive]} onPress={() => onQuickTenureFilter(f)}>
              <Text style={[styles.filterChipText, filters.tenureStatus === f && styles.filterChipTextActive]}>{t(`facility.membershipMgmt.tenure_${f}`)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.sectionEmpty}>{t("facility.membershipMgmt.noMembersMatch")}</Text>
        ) : (
          filtered.map((membership) => <MemberListRow key={membership.id} membership={membership} onPress={() => onSelectMember(membership.id)} />)
        )}
      </ScrollView>
    </>
  );
}

function DropdownField({ label, value, options, onSelect }: { label: string; value: string | null; options: string[]; onSelect: (value: string | null) => void }) {
  const { colors, styles } = useFacilityUI();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: "relative", marginBottom: 16 }}>
      <TouchableOpacity style={styles.dropdownField} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.dropdownFieldText}>{value ?? label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownMenu}>
          <TouchableOpacity style={styles.dropdownMenuItem} onPress={() => { onSelect(null); setOpen(false); }}>
            <Text style={styles.dropdownMenuItemText}>{label}</Text>
          </TouchableOpacity>
          {options.map((option) => (
            <TouchableOpacity key={option} style={styles.dropdownMenuItem} onPress={() => { onSelect(option); setOpen(false); }}>
              <Text style={styles.dropdownMenuItemText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function FilterMembersScreen({ pool, filters, onApply, onBack }: { pool: Pool; filters: MemberFilters; onApply: (next: MemberFilters) => void; onBack: () => void }) {
  const { styles, t } = useFacilityUI();
  const { data: memberships = [] } = useMembershipsByPoolQuery(pool.id);
  const [draft, setDraft] = useState<MemberFilters>(filters);
  const tierNames = useMemo(() => Array.from(new Set(memberships.map((m) => m.tierName))), [memberships]);

  return (
    <>
      <MgmtHeader
        title={t("facility.membershipMgmt.filterTitle")}
        onBack={onBack}
        right={<TouchableOpacity onPress={() => setDraft(DEFAULT_MEMBER_FILTERS)}><Text style={styles.mgmtHeaderAction}>{t("facility.membershipMgmt.clearAll")}</Text></TouchableOpacity>}
      />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.tierFilter")}</Text>
        <DropdownField label={t("facility.membershipMgmt.allTiers")} value={draft.tierName} options={tierNames} onSelect={(tierName) => setDraft((d) => ({ ...d, tierName }))} />

        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.genderFilter")}</Text>
        <View style={styles.modeToggle}>
          {(["All", "Male", "Female", "Other"] as const).map((g) => {
            const selected = g === "All" ? draft.gender === null : draft.gender === g;
            return (
              <TouchableOpacity key={g} style={[styles.modeButton, selected && styles.modeButtonActive]} onPress={() => setDraft((d) => ({ ...d, gender: g === "All" ? null : g }))}>
                <Text style={[styles.modeButtonText, selected && styles.modeButtonTextActive]}>{g}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t("facility.membershipMgmt.tenureStatusFilter")}</Text>
        {([
          ["active", t("facility.membershipMgmt.tenure_active")],
          ["soon", t("facility.membershipMgmt.tenureSoonLabel")],
          ["expired", t("facility.membershipMgmt.tenure_expired")],
        ] as [TenureFilter, string][]).map(([value, label]) => (
          <TouchableOpacity key={value} style={styles.radioRow} onPress={() => setDraft((d) => ({ ...d, tenureStatus: d.tenureStatus === value ? "all" : value }))}>
            <View style={[styles.radioCircle, draft.tenureStatus === value && styles.radioCircleSelected]} />
            <Text style={styles.radioLabel}>{label}</Text>
          </TouchableOpacity>
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t("facility.membershipMgmt.remainingDaysFilter")}</Text>
        <View style={styles.formRow}>
          <TextInput style={[styles.formInput, styles.formRowInput]} placeholder={t("facility.membershipMgmt.minDays")} placeholderTextColor="#9aa0ac" value={draft.minDays} onChangeText={(v) => setDraft((d) => ({ ...d, minDays: v.replace(/[^0-9]/g, "") }))} keyboardType="number-pad" />
          <TextInput style={[styles.formInput, styles.formRowInput]} placeholder={t("facility.membershipMgmt.maxDays")} placeholderTextColor="#9aa0ac" value={draft.maxDays} onChangeText={(v) => setDraft((d) => ({ ...d, maxDays: v.replace(/[^0-9]/g, "") }))} keyboardType="number-pad" />
        </View>

        <TouchableOpacity style={[styles.primaryButton, { marginTop: 20 }]} onPress={() => onApply(draft)}>
          <Text style={styles.primaryButtonText}>{t("facility.membershipMgmt.applyFilters")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

function MemberDetailScreen({
  pool,
  membership,
  onBack,
  onAdjustDays,
  onViewHistory,
}: {
  pool: Pool;
  membership: Membership | null;
  onBack: () => void;
  onAdjustDays: () => void;
  onViewHistory: () => void;
}) {
  const { colors, styles, t } = useFacilityUI();
  const { uid, role } = useAppContext();
  const { data: tiers = [] } = useMembershipTiersQuery(pool.id);
  const editMutation = useEditMembershipMutation();
  const pauseMutation = usePauseMembershipMutation();
  const resumeMutation = useResumeMembershipMutation();

  if (!membership) {
    return (
      <>
        <MgmtHeader title={t("facility.membershipMgmt.memberDetailTitle")} onBack={onBack} />
        <View style={{ padding: 20 }}><Text style={styles.sectionEmpty}>{t("facility.membershipMgmt.memberNotFound")}</Text></View>
      </>
    );
  }
  const member = membership;

  const name = memberDisplayName(member);
  const status = tenureStatus(member, t);
  const statusColor = status.kind === "active" ? colors.success : status.kind === "soon" ? colors.warning : status.kind === "paused" ? colors.textMuted : colors.danger;
  const remaining = daysRemaining(member.endDate);
  const isPaused = member.status === "inactive";

  function chooseTier() {
    const options = tiers.filter((tier) => !tier.archived || tier.id === member.tierId);
    Alert.alert(
      t("facility.membershipMgmt.switchTier"),
      undefined,
      [
        ...options.map((tier) => ({
          text: tier.id === member.tierId ? `✓ ${tier.name}` : tier.name,
          onPress: () =>
            editMutation.mutate({
              poolId: pool.id,
              membershipId: member.id,
              edit: { tierId: tier.id, tierName: tier.name },
              actor: { actorUid: uid, actorRole: role },
              type: "tierChange",
              summary: `${member.tierName} → ${tier.name}`,
            }),
        })),
        { text: t("common.cancel"), style: "cancel" },
      ]
    );
  }

  function togglePause() {
    if (isPaused) {
      resumeMutation.mutate({ poolId: pool.id, membership: member, actor: { actorUid: uid, actorRole: role } });
    } else {
      Alert.alert(t("facility.membershipMgmt.pauseConfirmTitle"), t("facility.membershipMgmt.pauseConfirmMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("facility.membershipMgmt.pauseMembership"), onPress: () => pauseMutation.mutate({ poolId: pool.id, membershipId: member.id }) },
      ]);
    }
  }

  return (
    <>
      <MgmtHeader title={t("facility.membershipMgmt.memberDetailTitle")} onBack={onBack} right={<TouchableOpacity onPress={chooseTier}><Text style={styles.mgmtHeaderAction}>{t("facility.membershipMgmt.edit")}</Text></TouchableOpacity>} />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.identityRowFacility}>
          <View style={styles.entryAvatarLg}><Text style={styles.entryAvatarLgText}>{initialOf(name)}</Text></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.memberDetailName}>{name}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColor + "22" }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]}>{status.label}</Text>
              </View>
            </View>
            <Text style={styles.entryMeta}>{member.members[0]?.gender ?? ""} · +91 {member.phone}</Text>
          </View>
        </View>

        <Text style={[styles.settingsSectionLabel, { marginTop: 20 }]}>{t("facility.membershipMgmt.currentMembership")}</Text>
        <View style={styles.settingsGroup}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.entryName}>🏊 {member.tierName}</Text>
              <TouchableOpacity onPress={chooseTier}><Text style={styles.mgmtHeaderAction}>{t("facility.membershipMgmt.changeTier")}</Text></TouchableOpacity>
            </View>
            <View style={[styles.modalRow, { marginTop: 12 }]}>
              <Text style={styles.modalRowLabel}>{t("facility.membershipMgmt.tenureDates")}</Text>
              <Text style={styles.modalRowValue}>{formatDateDMY(new Date(member.startDate))} – {formatDateDMY(new Date(member.endDate))}</Text>
            </View>
            {!isPaused && <Text style={[styles.entryMeta, { color: statusColor, fontWeight: "700", textAlign: "right" }]}>{remaining > 0 ? t("facility.membershipMgmt.daysLeft", { count: remaining }) : t("facility.membershipMgmt.expired")}</Text>}
            <View style={styles.modalRow}>
              <Text style={styles.modalRowLabel}>{t("facility.membershipMgmt.sessions")}</Text>
              <Text style={styles.modalRowValue}>{member.sessions == null ? t("facility.membershipMgmt.sessionsRunning", { used: member.sessionsUsed }) : `${member.sessionsUsed} / ${member.sessions}`}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.settingsSectionLabel, { marginTop: 20 }]}>{t("facility.membershipMgmt.memberInformation")}</Text>
        <View style={styles.settingsGroup}>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={styles.modalRow}><Text style={styles.modalRowLabel}>{t("facility.membershipMgmt.gender")}</Text><Text style={styles.modalRowValue}>{member.members[0]?.gender ?? "-"}</Text></View>
            <View style={styles.modalRow}><Text style={styles.modalRowLabel}>{t("facility.membershipMgmt.phone")}</Text><Text style={styles.modalRowValue}>+91 {member.phone}</Text></View>
            <View style={styles.modalRow}><Text style={styles.modalRowLabel}>{t("facility.membershipMgmt.joinedOn")}</Text><Text style={styles.modalRowValue}>{formatDateDMY(new Date(member.startDate))}</Text></View>
          </View>
        </View>

        <Text style={[styles.settingsSectionLabel, { marginTop: 20 }]}>{t("facility.membershipMgmt.actions")}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={onAdjustDays}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={styles.actionButtonText}>{t("facility.membershipMgmt.adjustDaysAction")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={togglePause} disabled={pauseMutation.isPending || resumeMutation.isPending}>
            <Ionicons name={isPaused ? "play-outline" : "pause-outline"} size={20} color={colors.primary} />
            <Text style={styles.actionButtonText}>{isPaused ? t("facility.membershipMgmt.resumeMembership") : t("facility.membershipMgmt.pauseMembership")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onViewHistory}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.actionButtonText}>{t("facility.membershipMgmt.viewHistory")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

function AdjustDaysScreen({ pool, membership, onBack }: { pool: Pool; membership: Membership | null; onBack: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const { uid, role } = useAppContext();
  const editMutation = useEditMembershipMutation();
  const [dayDelta, setDayDelta] = useState("");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!membership) {
    return (
      <>
        <MgmtHeader title={t("facility.membershipMgmt.adjustDaysAction")} onBack={onBack} />
        <View style={{ padding: 20 }}><Text style={styles.sectionEmpty}>{t("facility.membershipMgmt.memberNotFound")}</Text></View>
      </>
    );
  }

  async function applyDayDelta(sign: 1 | -1) {
    const value = Number(dayDelta);
    if (!dayDelta.trim() || !Number.isFinite(value) || value <= 0) {
      setErrorMessage(t("facility.membershipMgmt.errorDayDelta"));
      return;
    }
    setErrorMessage("");
    const nextEndDate = membership!.endDate + sign * value * 24 * 60 * 60 * 1000;
    try {
      await editMutation.mutateAsync({
        poolId: pool.id,
        membershipId: membership!.id,
        edit: { endDate: nextEndDate },
        actor: { actorUid: uid, actorRole: role },
        type: "daysAdjust",
        summary: `${sign > 0 ? "+" : "-"}${value} day${value === 1 ? "" : "s"}`,
      });
      setDayDelta("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.staff.genericError"));
    }
  }

  async function setTenureDate(which: "start" | "end", date: Date) {
    const ms = date.getTime();
    setErrorMessage("");
    try {
      await editMutation.mutateAsync({
        poolId: pool.id,
        membershipId: membership!.id,
        edit: which === "start" ? { startDate: ms } : { endDate: ms },
        actor: { actorUid: uid, actorRole: role },
        type: "daysAdjust",
        summary: which === "start" ? t("facility.membershipMgmt.startSetTo", { date: formatDateDMY(date) }) : t("facility.membershipMgmt.endSetTo", { date: formatDateDMY(date) }),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("facility.staff.genericError"));
    }
  }

  return (
    <>
      <MgmtHeader title={t("facility.membershipMgmt.adjustDaysAction")} onBack={onBack} />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.adjustDays")}</Text>
        <View style={styles.formRow}>
          <View style={styles.formRowInput}>
            <TextInput style={styles.formInput} placeholder={t("facility.membershipMgmt.days")} placeholderTextColor={colors.textFaint} value={dayDelta} onChangeText={(v) => setDayDelta(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
          </View>
          <TouchableOpacity style={[styles.inactiveButton, { paddingHorizontal: 16 }]} onPress={() => applyDayDelta(1)} disabled={editMutation.isPending}>
            <Text style={styles.inactiveButtonText}>{t("facility.membershipMgmt.addDays")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.inactiveButton, { paddingHorizontal: 16 }]} onPress={() => applyDayDelta(-1)} disabled={editMutation.isPending}>
            <Text style={styles.inactiveButtonText}>{t("facility.membershipMgmt.subtractDays")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>{t("facility.membershipMgmt.adjustDaysHelper")}</Text>

        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t("facility.membershipMgmt.tenureDates")}</Text>
        <View style={styles.formRow}>
          <View style={styles.formRowInput}>
            <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.startDate")}</Text>
            <TouchableOpacity style={styles.formInput} onPress={() => setShowStartPicker(true)} disabled={editMutation.isPending}>
              <Text style={{ color: colors.text }}>{formatDateDMY(new Date(membership.startDate))}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.formRowInput}>
            <Text style={styles.fieldLabel}>{t("facility.membershipMgmt.endDate")}</Text>
            <TouchableOpacity style={styles.formInput} onPress={() => setShowEndPicker(true)} disabled={editMutation.isPending}>
              <Text style={{ color: colors.text }}>{formatDateDMY(new Date(membership.endDate))}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {showStartPicker && (
          <DateTimePicker
            value={new Date(membership.startDate)}
            mode="date"
            display="default"
            onChange={(_event, selectedDate) => {
              setShowStartPicker(Platform.OS === "ios");
              if (selectedDate) setTenureDate("start", selectedDate);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={new Date(membership.endDate)}
            mode="date"
            display="default"
            onChange={(_event, selectedDate) => {
              setShowEndPicker(Platform.OS === "ios");
              if (selectedDate) setTenureDate("end", selectedDate);
            }}
          />
        )}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {editMutation.isPending && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
      </ScrollView>
    </>
  );
}

const HISTORY_TYPE_META: Record<MembershipAuditType, { icon: keyof typeof Ionicons.glyphMap; color: string; titleKey: string }> = {
  created: { icon: "calendar-outline", color: "#16a34a", titleKey: "facility.membershipMgmt.historyCreated" },
  daysAdjust: { icon: "create-outline", color: "#f59e0b", titleKey: "facility.membershipMgmt.historyAdjusted" },
  pause: { icon: "pause-circle-outline", color: "#8b5cf6", titleKey: "facility.membershipMgmt.historyPaused" },
  resume: { icon: "play-circle-outline", color: "#8b5cf6", titleKey: "facility.membershipMgmt.historyResumed" },
  tierChange: { icon: "swap-horizontal-outline", color: "#2952e3", titleKey: "facility.membershipMgmt.historyTierChanged" },
};

type HistoryFilter = "all" | "daysAdjust" | "pause" | "tierChange";

function MembershipHistoryScreen({ pool, membership, onBack }: { pool: Pool; membership: Membership | null; onBack: () => void }) {
  const { colors, styles, t } = useFacilityUI();
  const { data: auditLog = [], isLoading } = useMembershipAuditLogQuery(pool.id, membership?.id);
  const [filter, setFilter] = useState<HistoryFilter>("all");

  if (!membership) {
    return (
      <>
        <MgmtHeader title={t("facility.membershipMgmt.historyTitle")} onBack={onBack} />
        <View style={{ padding: 20 }}><Text style={styles.sectionEmpty}>{t("facility.membershipMgmt.memberNotFound")}</Text></View>
      </>
    );
  }

  const totalAdjustments = auditLog.filter((e) => e.type === "daysAdjust" || e.type === "tierChange").length;
  const filtered = auditLog.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "pause") return entry.type === "pause" || entry.type === "resume";
    return entry.type === filter;
  });

  return (
    <>
      <MgmtHeader title={t("facility.membershipMgmt.historyTitle")} onBack={onBack} />
      <ScrollView style={styles.tabScroll} contentContainerStyle={{ padding: 20 }}>
        <View style={styles.statSummaryRow}>
          <View style={styles.historyStatCard}><Text style={styles.statCardLabel}>{t("facility.membershipMgmt.joinedOn")}</Text><Text style={styles.statCardValue}>{formatDateDMY(new Date(membership.startDate))}</Text></View>
          <View style={styles.historyStatCard}><Text style={styles.statCardLabel}>{t("facility.membershipMgmt.totalAdjustments")}</Text><Text style={styles.statCardValue}>{totalAdjustments}</Text></View>
          <View style={styles.historyStatCard}><Text style={styles.statCardLabel}>{t("facility.membershipMgmt.totalPausedDays")}</Text><Text style={styles.statCardValue}>{membership.totalPausedDays}</Text></View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(["all", "daysAdjust", "pause", "tierChange"] as HistoryFilter[]).map((f) => (
            <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>{t(`facility.membershipMgmt.historyFilter_${f}`)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.sectionEmpty}>{t("facility.membershipMgmt.noHistory")}</Text>
        ) : (
          filtered.map((entry) => {
            const meta = HISTORY_TYPE_META[entry.type];
            const isPositive = entry.summary.startsWith("+") || entry.type === "created";
            const isNegative = entry.summary.startsWith("-");
            return (
              <View key={entry.id} style={styles.historyRow}>
                <View style={[styles.historyIconCircle, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{t(meta.titleKey)}</Text>
                  <Text style={styles.entryMeta}>{new Date(entry.at).toLocaleString()} · {t("facility.membershipMgmt.byActor", { role: entry.actorRole })}</Text>
                </View>
                <Text style={[styles.entryName, isPositive && { color: colors.success }, isNegative && { color: colors.danger }]}>{entry.summary}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    topBar: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
    logoutCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" },

    emptyState: { alignItems: "center", marginTop: 60, gap: 8, paddingHorizontal: 30 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 8 },
    emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
    retryButton: { marginTop: 8, paddingHorizontal: 18, height: 40, borderRadius: 10, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center" },
    retryButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },

    poolChipRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
    poolChip: { paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, justifyContent: "center" },
    poolChipActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
    poolChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    poolChipTextActive: { color: colors.primary },

    filterRow: { gap: 8, paddingVertical: 10 },
    filterChip: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, justifyContent: "center" },
    filterChipActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
    filterChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
    filterChipTextActive: { color: colors.primary },

    body: { flex: 1 },

    staffLayout: { flex: 1 },
    staffContent: { padding: 16, paddingBottom: 24 },
    modeToggle: { flexDirection: "row", borderRadius: 12, backgroundColor: colors.surfaceAlt, padding: 4, gap: 4, marginBottom: 16 },
    modeButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 9 },
    modeButtonActive: { backgroundColor: colors.primary },
    modeButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 15 },
    modeButtonTextActive: { color: "#fff" },
    scannerCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: 16, backgroundColor: colors.surface },
    scanTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 12 },
    cameraFrame: { aspectRatio: 1.55, borderRadius: 16, overflow: "hidden", backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
    cornerTL: { position: "absolute", top: 14, left: 14, width: 26, height: 26, borderColor: "#fff", borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
    cornerTR: { position: "absolute", top: 14, right: 14, width: 26, height: 26, borderColor: "#fff", borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
    cornerBL: { position: "absolute", bottom: 14, left: 14, width: 26, height: 26, borderColor: "#fff", borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
    cornerBR: { position: "absolute", bottom: 14, right: 14, width: 26, height: 26, borderColor: "#fff", borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
    permissionState: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
    permissionText: { color: "#c7cad2", fontSize: 13, textAlign: "center" },
    permissionButton: { marginTop: 8, backgroundColor: colors.primary, height: 40, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
    permissionButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    resultOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
    resultText: { color: "#fff", fontWeight: "700", fontSize: 14, textAlign: "center" },
    flashlightRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    flashlightText: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },

    sectionCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: 16, backgroundColor: colors.surface },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
    countPill: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    countPillText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
    searchBar: { height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, marginBottom: 6 },
    searchInput: { flex: 1, fontSize: 13, color: colors.text },
    emptySection: { alignItems: "center", paddingVertical: 22, gap: 10 },
    emptyIconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    sectionEmpty: { color: colors.textFaint, fontSize: 13, textAlign: "center" },

    entryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    entryAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    entryAvatarText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
    entryName: { fontSize: 14, fontWeight: "700", color: colors.text },
    entryMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    rowTime: { fontSize: 12.5, fontWeight: "700", color: colors.text },
    rowSubText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    pricePill: { marginTop: 4, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    pricePillText: { color: colors.primary, fontSize: 11, fontWeight: "700" },

    tabScroll: { flex: 1 },
    tabContent: { padding: 20, paddingBottom: 60 },
    tabTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    tabSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 18 },
    formInput: { height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: colors.text, marginBottom: 12 },
    formRow: { flexDirection: "row", gap: 12 },
    formRowInput: { flex: 1 },
    options: { flexDirection: "row", gap: 8, marginBottom: 12 },
    option: { flex: 1, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    optionText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
    optionTextSelected: { color: colors.primary, fontWeight: "700" },
    primaryButton: { height: 50, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 6 },
    primaryButtonDisabled: { opacity: 0.5 },
    primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    membershipCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 10 },
    statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    statusActive: { backgroundColor: colors.successSoft },
    statusExpired: { backgroundColor: colors.dangerSoft },
    statusPillText: { fontSize: 11, fontWeight: "700" },
    statusActiveText: { color: colors.success },
    statusExpiredText: { color: colors.danger },
    inactiveButton: { paddingHorizontal: 10, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    inactiveButtonText: { fontSize: 10.5, fontWeight: "700", color: colors.textMuted },

    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
    statCard: { width: "47%", borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 6 },
    statIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
    statLabel: { fontSize: 12, color: colors.textMuted },

    bottomNav: { height: 88, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-around", paddingTop: 10 },
    navItem: { alignItems: "center", gap: 4 },
    navText: { fontSize: 12, color: colors.icon, fontWeight: "600" },
    navTextActive: { color: colors.primary, fontWeight: "700" },

    stepperRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 18, marginBottom: 22 },
    stepperItem: { alignItems: "center", width: 60 },
    stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 13 },
    stepLineDone: { backgroundColor: colors.primary },
    stepCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    stepCircleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    stepCircleDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    stepCircleText: { fontSize: 12, fontWeight: "700", color: colors.textFaint },
    stepCircleTextActive: { color: "#fff" },
    stepLabel: { fontSize: 11, color: colors.textFaint, marginTop: 6, fontWeight: "600" },
    stepLabelActive: { color: colors.primary },

    wizardCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 18, backgroundColor: colors.surface },
    wizardTitle: { fontSize: 19, fontWeight: "700", color: colors.text },
    wizardSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 16 },
    existingAccountText: { color: colors.success, fontWeight: "700" },

    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.textFaint, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, marginTop: 1 },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },

    fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.4, marginBottom: 8 },
    phoneInputRow: { height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 6 },
    phonePrefix: { fontSize: 14, fontWeight: "700", color: colors.text, marginRight: 8 },
    phoneInputField: { flex: 1, height: "100%", fontSize: 14, color: colors.text },
    errorText: { color: colors.danger, fontSize: 12.5, marginBottom: 10, marginTop: 2 },

    linkRow: { alignItems: "center", marginTop: 14 },
    linkText: { color: colors.primary, fontWeight: "700", fontSize: 13.5 },
    linkInlineText: { color: colors.primary, fontWeight: "700" },

    memberCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 14, position: "relative" },
    removeMemberButton: { position: "absolute", top: 10, right: 10, zIndex: 1 },
    photoRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
    memberPhotoButton: { width: 62, height: 62, borderRadius: 31 },
    memberPhoto: { width: 62, height: 62, borderRadius: 31 },
    memberPhotoPlaceholder: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    retakeButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center" },
    retakeButtonText: { color: colors.primary, fontWeight: "700", fontSize: 12.5 },
    cameraHint: { color: colors.textFaint, fontSize: 11, marginTop: 6 },

    genderSelect: { height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    genderSelectText: { fontSize: 14, color: colors.text },
    genderMenu: { position: "absolute", zIndex: 5, top: 78, left: 0, right: 0, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    genderChoice: { paddingHorizontal: 14, paddingVertical: 11 },
    genderChoiceText: { fontSize: 14, color: colors.text },

    abilityOption: { flex: 1, height: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    abilityOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    abilityOptionText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    abilityOptionTextSelected: { color: colors.primary, fontWeight: "700" },

    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border, marginTop: 4 },
    switchTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
    switchSubtitle: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },

    addMemberButton: { height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    addMemberButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },

    declarationsCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 20 },
    declarationsTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 12 },
    declarationRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 12 },
    declarationText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 19 },

    tierCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 14, position: "relative" },
    tierCardSelected: { borderColor: colors.primary, borderWidth: 1.5 },
    tierCheckBadge: { position: "absolute", top: 14, right: 14, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    tierName: { fontSize: 17, fontWeight: "700", color: colors.text },
    tierMetaRow: { flexDirection: "row", gap: 16, marginTop: 8 },
    tierMetaText: { fontSize: 12.5, color: colors.textMuted },
    tierPrice: { fontSize: 22, fontWeight: "800", color: colors.primary, marginTop: 8 },
    tierCoachingText: { fontSize: 11.5, color: colors.warning, marginTop: 8 },

    reviewTierName: { fontSize: 19, fontWeight: "700", color: colors.text, marginTop: 2 },
    reviewMemberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    reviewMemberPhoto: { width: 34, height: 34, borderRadius: 17 },
    reviewMemberPhotoPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    memberRolePill: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    memberRolePillText: { color: colors.primary, fontSize: 11.5, fontWeight: "700" },

    reviewSection: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 14 },
    reviewSectionLabel: { fontSize: 11, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.4, marginBottom: 10 },

    selectedPlanCard: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 16, backgroundColor: colors.primarySoft, padding: 16, marginBottom: 20 },
    selectedPlanPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 },
    selectedPlanQty: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },

    confirmButton: { height: 52, borderRadius: 12, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
    confirmButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },

    dateBar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 18 },
    dateArrow: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    dateField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12 },
    dateFieldText: { fontSize: 14, fontWeight: "600", color: colors.text },
    todayButton: { height: 42, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    todayButtonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    todayButtonText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
    todayButtonTextActive: { color: colors.primary },

    poolStatusCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 16 },
    poolStatusHeaderBlue: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14 },
    poolStatusTitleWhite: { fontSize: 15, fontWeight: "700", color: "#fff" },
    poolStatusBody: { padding: 16, backgroundColor: colors.surface },
    poolStatusHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    poolStatusTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
    poolStatusCountBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
    poolStatusCountText: { color: "#fff", fontSize: 13, fontWeight: "800" },

    sessionsCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: 16, backgroundColor: colors.surface },
    sessionsHeaderRow: { flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderColor: colors.border, marginBottom: 4 },
    sessionsHeaderText: { fontSize: 10.5, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.4 },
    sessionsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    sessionsCellText: { fontSize: 12.5, color: colors.textMuted },
    colName: { width: 100, paddingRight: 8 },
    colAge: { width: 44 },
    colGender: { width: 64 },
    colTime: { width: 66 },
    colCharge: { width: 60 },
    colStatus: { width: 72 },

    chartCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: 16, backgroundColor: colors.surface },
    chartRangeText: { fontSize: 12, color: colors.textFaint, marginBottom: 16 },
    chartBarsRow: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 8 },
    chartBarColumn: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
    chartBarValue: { fontSize: 9.5, color: colors.primary, fontWeight: "700", marginBottom: 4 },
    chartBarTrack: { width: "100%", flex: 1, justifyContent: "flex-end", backgroundColor: colors.surfaceAlt, borderRadius: 6, overflow: "hidden" },
    chartBarFill: { width: "100%", backgroundColor: colors.primary, borderRadius: 6 },
    chartBarLabel: { fontSize: 9.5, color: colors.textFaint, marginTop: 6 },

    modalOverlay: { flex: 1, backgroundColor: "rgba(17,20,28,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
    modalCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 22, padding: 24, alignItems: "center" },
    modalIconCircle: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    modalIconCircleGreen: { backgroundColor: colors.successSoft },
    modalIconCircleBlue: { backgroundColor: colors.primarySoft },
    modalRupee: { fontSize: 28, fontWeight: "800", color: colors.primary },
    modalTitle: { fontSize: 19, fontWeight: "800", color: colors.text, marginBottom: 14 },
    modalAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
    modalAvatarText: { color: colors.primary, fontWeight: "700", fontSize: 22 },
    modalName: { fontSize: 18, fontWeight: "700", color: colors.text },
    modalExtraNames: { fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: "center" },
    modalPillRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 4 },
    modalPill: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
    modalPillText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
    modalPillPink: { backgroundColor: "#fdeaf1" },
    modalPillTextPink: { color: "#e0568f" },
    modalDivider: { height: 1, backgroundColor: colors.border, alignSelf: "stretch", marginVertical: 12 },
    modalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignSelf: "stretch", paddingVertical: 4 },
    modalRowLabel: { fontSize: 13.5, color: colors.textMuted },
    modalRowValue: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    modalNote: { fontSize: 12, color: colors.primary, alignSelf: "stretch", marginTop: 4 },
    modalTotalLabel: { fontSize: 16, fontWeight: "800", color: colors.text },
    modalTotalValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
    modalPrimaryButton: { height: 52, borderRadius: 14, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 18 },
    modalPrimaryButtonGreen: { backgroundColor: colors.success },
    modalPrimaryButtonText: { color: "#fff", fontSize: 15.5, fontWeight: "700" },
    modalDismiss: { marginTop: 14 },
    modalDismissText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
    modalIconCircleAmber: { backgroundColor: "#fdf1de", borderWidth: 1, borderColor: "#e8a33d" },
    modalPhoto: { width: 66, height: 66, borderRadius: 33, marginBottom: 10 },
    modalPillAmber: { backgroundColor: "#fdf1de" },
    modalPillTextAmber: { color: "#b9781a" },
    modalInfoBox: { alignSelf: "stretch", backgroundColor: "#fdf6e8", borderWidth: 1, borderColor: "#f0dfb0", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, marginTop: 14 },
    modalFreeBox: { alignSelf: "stretch", backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14, alignItems: "center" },
    modalFreeBoxTitle: { color: colors.success, fontWeight: "700", fontSize: 14.5 },
    modalFreeBoxSubtitle: { color: colors.success, fontSize: 12.5, marginTop: 3, textAlign: "center" },
    modalPrimaryButtonAmber: { backgroundColor: "#c8791f" },

    settingsSectionLabel: { fontSize: 12, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10, marginTop: 6 },
    settingsGroup: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, marginBottom: 20, overflow: "hidden" },
    settingsRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderColor: colors.border },
    settingsRowLast: { borderBottomWidth: 0 },
    settingsPickerRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, paddingBottom: 6 },
    settingsIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    settingsRowTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
    settingsRowSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },

    segmentedRow: { flexDirection: "row", gap: 8, padding: 14, paddingTop: 8 },
    segmentedOption: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    segmentedOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    segmentedOptionText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    segmentedOptionTextActive: { color: "#fff" },

    optionDisabled: { opacity: 0.4 },

    sheetOverlay: { flex: 1, backgroundColor: "rgba(15,17,23,0.45)", justifyContent: "flex-end" },
    sheetCard: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, maxHeight: "88%" },
    sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: 12 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    sheetTitle: { fontSize: 19, fontWeight: "700", color: colors.text },

    slabCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12 },
    removeSlabButton: { width: 36, height: 50, alignItems: "center", justifyContent: "center" },

    dayChip: { width: 40, height: 36, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    dayChipSelected: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
    dayChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
    dayChipTextSelected: { color: colors.primary },

    ruleListRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    ruleListText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600" },

    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
    photoGridItem: { width: 88, height: 88, borderRadius: 12, position: "relative" },
    photoGridImage: { width: "100%", height: "100%", borderRadius: 12, backgroundColor: colors.surfaceAlt },
    photoRemoveButton: { position: "absolute", top: -6, right: -6, backgroundColor: colors.surface, borderRadius: 10 },
    photoPrimaryBadge: { position: "absolute", bottom: 4, left: 4, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10, padding: 3 },
    photoAddButton: { width: 88, height: 88, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },

    // ---------- Membership Management (full-screen push flow) ----------
    mgmtScreen: { flex: 1, backgroundColor: colors.background },
    mgmtHeader: { flexDirection: "row", alignItems: "center", height: 54, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: colors.border },
    mgmtHeaderBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    mgmtHeaderTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
    mgmtHeaderRight: { minWidth: 36, alignItems: "flex-end", justifyContent: "center" },
    mgmtHeaderAction: { color: colors.primary, fontSize: 15, fontWeight: "700" },

    tierRowCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12, backgroundColor: colors.surface },
    tierIconCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
    infoBanner: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, marginTop: 8 },
    infoBannerText: { flex: 1, color: colors.primary, fontSize: 12.5, lineHeight: 18 },

    requiredMark: { color: colors.danger },
    helperText: { color: colors.textMuted, fontSize: 11.5, marginTop: -6, marginBottom: 12 },
    toggleFieldRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    toggleFieldSwitch: { flexDirection: "row", alignItems: "center", gap: 8 },

    signupCountCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18, backgroundColor: colors.surface },
    signupCountNumber: { fontSize: 34, fontWeight: "800", color: colors.primary },
    signupCountLabel: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    windowPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt },

    sessionBarTrack: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
    sessionBarFill: { height: 4, borderRadius: 2 },

    filterBadge: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },

    dropdownField: { height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    dropdownFieldText: { color: colors.text, fontSize: 14 },
    dropdownMenu: { position: "absolute", top: 52, left: 0, right: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, zIndex: 10, maxHeight: 220, overflow: "hidden" },
    dropdownMenuItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border },
    dropdownMenuItemText: { color: colors.text, fontSize: 14 },

    radioRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
    radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
    radioCircleSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
    radioLabel: { color: colors.text, fontSize: 14 },

    identityRowFacility: { flexDirection: "row", alignItems: "center", gap: 14 },
    entryAvatarLg: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    entryAvatarLgText: { color: colors.primary, fontWeight: "700", fontSize: 20 },
    memberDetailName: { fontSize: 19, fontWeight: "700", color: colors.text },

    actionsRow: { flexDirection: "row", gap: 10 },
    actionButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 16, backgroundColor: colors.surface },
    actionButtonText: { fontSize: 11.5, fontWeight: "700", color: colors.text, textAlign: "center" },

    statSummaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    historyStatCard: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: colors.surface },
    statCardLabel: { fontSize: 10.5, color: colors.textMuted, marginBottom: 6 },
    statCardValue: { fontSize: 14, fontWeight: "700", color: colors.text },

    historyRow: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 12 },
    historyIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },

    hubReportsButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
    heroCard: { borderRadius: 18, backgroundColor: colors.primarySoft, padding: 18 },
    heroLabel: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
    heroTitle: { color: colors.text, fontSize: 21, fontWeight: "800", marginTop: 8, maxWidth: "80%" },
    heroSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 8, lineHeight: 18, maxWidth: "85%" },

    quickActionsRow: { flexDirection: "row", gap: 10 },
    quickActionCard: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.surface, gap: 4 },
    quickActionIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    quickActionTitle: { fontSize: 12.5, fontWeight: "700", color: colors.text },
    quickActionSubtitle: { fontSize: 10.5, color: colors.textMuted, lineHeight: 14 },

    overviewCard: { marginTop: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 16 },
    overviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    overviewStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    overviewStat: { width: "22%", alignItems: "center", gap: 4 },
    overviewStatIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    overviewStatValue: { fontSize: 16, fontWeight: "800", color: colors.text },
    overviewStatLabel: { fontSize: 9.5, color: colors.textMuted, textAlign: "center" },

  });
}
