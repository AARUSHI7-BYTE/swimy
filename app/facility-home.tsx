import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppContext } from "./app-context";
import { signOutUser } from "../firebaseconfig";
import { getPoolsByIds, getUserByPhone, Pool } from "../lib/firestore";
import { checkIn, checkOut, computeDue, DueBreakdown, Entry, EntryPerson, getOpenEntry, listEntriesInRange, listTodayEntries } from "../lib/entries";
import {
  addMembership,
  listMembershipsByPool,
  Membership,
  MembershipMember,
  MembershipTierId,
  MEMBERSHIP_TIERS,
  setMembershipStatus,
} from "../lib/memberships";
import { uploadMemberPhoto } from "../lib/storage";

type ScanMode = "entry" | "exit";
type ConsoleTab = "staff" | "membership" | "admin";

type EntryPayload = {
  type: string;
  uid: string;
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

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startMs: number, endMs: number) {
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function personLine(entry: Entry) {
  const [first, ...rest] = entry.people;
  if (!first) return { name: "Guest", meta: "" };
  const parts = [first.age ? `${first.age} yrs` : null, first.gender || null].filter(Boolean);
  const suffix = rest.length ? ` +${rest.length}` : "";
  return { name: `${first.name}${suffix}`, meta: parts.join(" · ") };
}

export default function FacilityConsole() {
  const { role, poolIds, resetSession } = useAppContext();
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePoolId, setActivePoolId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ConsoleTab>("staff");

  useEffect(() => {
    if (role !== "facility") {
      router.replace("/admin-login");
      return;
    }
    getPoolsByIds(poolIds)
      .then((loaded) => {
        setPools(loaded);
        setActivePoolId((current) => current ?? loaded[0]?.id ?? null);
      })
      .finally(() => setIsLoading(false));
  }, [role, poolIds]);

  function confirmLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: handleLogout },
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.logoutCircle} onPress={confirmLogout} hitSlop={8}>
          <Ionicons name="power" size={18} color="#df4545" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#2850e8" style={{ marginTop: 40 }} />
      ) : pools.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="water-outline" size={40} color="#9aa1b1" />
          <Text style={styles.emptyTitle}>No pool assigned</Text>
          <Text style={styles.emptyText}>Ask an admin to assign a pool to your account.</Text>
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
            {activeTab === "admin" && activePool && <AdminTab pool={activePool} />}
          </View>
        </>
      )}

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("staff")}>
          <Ionicons name="people-outline" size={26} color={activeTab === "staff" ? "#2850e8" : "#7f8797"} />
          <Text style={[styles.navText, activeTab === "staff" && styles.navTextActive]}>Staff</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("membership")}>
          <Ionicons name="card-outline" size={26} color={activeTab === "membership" ? "#2850e8" : "#7f8797"} />
          <Text style={[styles.navText, activeTab === "membership" && styles.navTextActive]}>Membership</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("admin")}>
          <Ionicons name="bar-chart-outline" size={26} color={activeTab === "admin" ? "#2850e8" : "#7f8797"} />
          <Text style={[styles.navText, activeTab === "admin" && styles.navTextActive]}>Admin</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function StaffTab({ pool }: { pool: Pool }) {
  const [mode, setMode] = useState<ScanMode>("entry");
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inPoolQuery, setInPoolQuery] = useState("");
  const [enteredQuery, setEnteredQuery] = useState("");
  const [exitedQuery, setExitedQuery] = useState("");
  const [pendingEntry, setPendingEntry] = useState<{ payload: EntryPayload; scannedAt: number } | null>(null);
  const [pendingExit, setPendingExit] = useState<{ payload: EntryPayload; entry: Entry; exitedAt: number; due: DueBreakdown } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  function reloadEntries() {
    listTodayEntries(pool.id).then(setEntries);
  }

  useEffect(() => {
    reloadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.id]);

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

  async function handleScanned({ data }: { data: string }) {
    if (result || isProcessing || pendingEntry || pendingExit) return;
    const payload = parseEntryPayload(data);
    if (!payload) {
      setResult({ success: false, message: "This QR code isn't a valid Swimy entry pass." });
      return;
    }
    if (payload.poolId !== pool.id) {
      setResult({ success: false, message: "This entry pass is for a different pool." });
      return;
    }

    if (mode === "entry") {
      setPendingEntry({ payload, scannedAt: Date.now() });
      return;
    }

    setIsProcessing(true);
    try {
      const openEntry = await getOpenEntry(pool.id, payload.uid);
      if (!openEntry) {
        setResult({ success: false, message: "No active entry found for this pass." });
        return;
      }
      const exitedAt = Date.now();
      const due = computeDue(pool.pricePerVisit, openEntry.enteredAt, exitedAt);
      setPendingExit({ payload, entry: openEntry, exitedAt, due });
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setIsProcessing(false);
    }
  }

  async function confirmEntry() {
    if (!pendingEntry) return;
    setIsConfirming(true);
    try {
      await checkIn(pool.id, pendingEntry.payload.uid, pendingEntry.payload.people);
      const name = pendingEntry.payload.people[0]?.name ?? "Guest";
      setResult({ success: true, message: `${name} checked in.` });
      reloadEntries();
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setIsConfirming(false);
      setPendingEntry(null);
    }
  }

  async function confirmExit() {
    if (!pendingExit) return;
    setIsConfirming(true);
    try {
      await checkOut(pool.id, pendingExit.payload.uid, pendingExit.due.total);
      const name = pendingExit.payload.people[0]?.name ?? "Guest";
      setResult({ success: true, message: `${name} checked out.` });
      reloadEntries();
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setIsConfirming(false);
      setPendingExit(null);
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
          <Ionicons name="arrow-up" size={16} color={mode === "entry" ? "#fff" : "#4d5360"} />
          <Text style={[styles.modeButtonText, mode === "entry" && styles.modeButtonTextActive]}>Entry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeButton, mode === "exit" && styles.modeButtonActive]} onPress={() => setMode("exit")}>
          <Ionicons name="arrow-down" size={16} color={mode === "exit" ? "#fff" : "#4d5360"} />
          <Text style={[styles.modeButtonText, mode === "exit" && styles.modeButtonTextActive]}>Exit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scannerCard}>
        <Text style={styles.scanTitle}>Scan {mode === "entry" ? "Entry" : "Exit"} QR</Text>

        <View style={styles.cameraFrame}>
          {!permission ? (
            <ActivityIndicator color="#2850e8" style={{ marginTop: 60 }} />
          ) : !permission.granted ? (
            <View style={styles.permissionState}>
              <Ionicons name="camera-outline" size={38} color="#9aa1b1" />
              <Text style={styles.permissionText}>Camera access needed to scan passes.</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>Grant Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={torchOn}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={result || isProcessing || pendingEntry || pendingExit ? undefined : handleScanned}
              />
              <View style={styles.cornerTL} pointerEvents="none" />
              <View style={styles.cornerTR} pointerEvents="none" />
              <View style={styles.cornerBL} pointerEvents="none" />
              <View style={styles.cornerBR} pointerEvents="none" />
              {result && (
                <View style={styles.resultOverlay}>
                  <Ionicons name={result.success ? "checkmark-circle" : "close-circle"} size={46} color={result.success ? "#20c982" : "#f23e48"} />
                  <Text style={styles.resultText}>{result.message}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {permission?.granted && (
          <TouchableOpacity style={styles.flashlightRow} onPress={() => setTorchOn((on) => !on)}>
            <Ionicons name="flashlight-outline" size={17} color="#2850e8" />
            <Text style={styles.flashlightText}>{torchOn ? "Turn off flashlight" : "Tap to turn on flashlight"}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ListSection icon="water-outline" iconColor="#2850e8" emptyIcon="water-outline" title="In Pool Now" count={inPoolNow.length} query={inPoolQuery} onQueryChange={setInPoolQuery} emptyText="No one in the pool right now">
        {filteredInPool.map((entry) => {
          const { name, meta } = personLine(entry);
          return (
            <EntryRow key={entry.id} name={name} meta={meta} right={<Text style={styles.rowTime}>{formatTime(entry.enteredAt)}</Text>} />
          );
        })}
      </ListSection>

      <ListSection icon="arrow-up-outline" iconColor="#171b23" emptyIcon="people-outline" title="Entered Today" count={entries.length} query={enteredQuery} onQueryChange={setEnteredQuery} emptyText="No entries yet today">
        {filteredEntered.map((entry) => {
          const { name, meta } = personLine(entry);
          return (
            <EntryRow
              key={entry.id}
              name={name}
              meta={meta}
              right={
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowTime}>{formatTime(entry.enteredAt)}</Text>
                  <Text style={styles.rowSubText}>Entered</Text>
                </View>
              }
            />
          );
        })}
      </ListSection>

      <ListSection icon="arrow-down-outline" iconColor="#171b23" emptyIcon="exit-outline" title="Exited Today" count={exitedToday.length} query={exitedQuery} onQueryChange={setExitedQuery} emptyText="No exits yet today">
        {filteredExited.map((entry) => {
          const { name, meta } = personLine(entry);
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

      <Modal visible={!!pendingEntry} transparent animationType="fade" onRequestClose={() => setPendingEntry(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {pendingEntry && (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleGreen]}>
                  <Ionicons name="checkmark" size={30} color="#20c982" />
                </View>
                <Text style={styles.modalTitle}>Entry Confirmed</Text>
                <View style={styles.modalAvatar}>
                  <Text style={styles.modalAvatarText}>{initialOf(pendingEntry.payload.people[0]?.name ?? "?")}</Text>
                </View>
                <Text style={styles.modalName}>{pendingEntry.payload.people[0]?.name ?? "Guest"}</Text>
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
                  <Text style={styles.modalRowLabel}>Entry Time</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingEntry.scannedAt)}</Text>
                </View>

                <TouchableOpacity style={[styles.modalPrimaryButton, styles.modalPrimaryButtonGreen, isConfirming && styles.primaryButtonDisabled]} onPress={confirmEntry} disabled={isConfirming}>
                  {isConfirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryButtonText}>Allow Entry</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalDismiss} onPress={() => setPendingEntry(null)} disabled={isConfirming}>
                  <Text style={styles.modalDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!pendingExit} transparent animationType="fade" onRequestClose={() => setPendingExit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {pendingExit && (
              <>
                <View style={[styles.modalIconCircle, styles.modalIconCircleBlue]}>
                  <Text style={styles.modalRupee}>₹</Text>
                </View>
                <Text style={styles.modalTitle}>Payment Due</Text>
                <View style={styles.modalAvatar}>
                  <Text style={styles.modalAvatarText}>{initialOf(pendingExit.payload.people[0]?.name ?? "?")}</Text>
                </View>
                <Text style={styles.modalName}>{pendingExit.payload.people[0]?.name ?? "Guest"}</Text>
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
                  <Text style={styles.modalRowLabel}>Entry Time</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingExit.entry.enteredAt)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>Exit Time</Text>
                  <Text style={styles.modalRowValue}>{formatTime(pendingExit.exitedAt)}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>Time in Pool</Text>
                  <Text style={styles.modalRowValue}>{formatDuration(pendingExit.entry.enteredAt, pendingExit.exitedAt)}</Text>
                </View>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>1-Hour Slot</Text>
                  <Text style={styles.modalRowValue}>₹{pendingExit.due.slotPrice}</Text>
                </View>
                {pendingExit.due.overageHours > 0 && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>{pendingExit.due.overageHours} Extra Hour{pendingExit.due.overageHours > 1 ? "s" : ""}</Text>
                    <Text style={styles.modalRowValue}>₹{pendingExit.due.overageAmount}</Text>
                  </View>
                )}
                <Text style={styles.modalNote}>{pendingExit.due.note}</Text>

                <View style={styles.modalDivider} />
                <View style={styles.modalRow}>
                  <Text style={styles.modalTotalLabel}>Total Due</Text>
                  <Text style={styles.modalTotalValue}>₹{pendingExit.due.total}</Text>
                </View>

                <TouchableOpacity style={[styles.modalPrimaryButton, styles.modalPrimaryButtonGreen, isConfirming && styles.primaryButtonDisabled]} onPress={confirmExit} disabled={isConfirming}>
                  {isConfirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryButtonText}>✓ Confirm Payment Paid</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalDismiss} onPress={() => setPendingExit(null)} disabled={isConfirming}>
                  <Text style={styles.modalDismissText}>Dismiss</Text>
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
  iconColor = "#171b23",
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
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name={icon} size={16} color={iconColor} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.countPill}><Text style={styles.countPillText}>{count} {count === 1 ? "person" : "people"}</Text></View>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#9ba1ad" />
        <TextInput style={styles.searchInput} placeholder="Filter by name..." placeholderTextColor="#9ba1ad" value={query} onChangeText={onQueryChange} />
      </View>
      {hasChildren ? (
        children
      ) : (
        <View style={styles.emptySection}>
          <View style={styles.emptyIconCircle}><Ionicons name={emptyIcon} size={26} color="#8fa4e8" /></View>
          <Text style={styles.sectionEmpty}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

function EntryRow({ name, meta, right }: { name: string; meta: string; right: ReactNode }) {
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

const STEP_ITEMS: { n: WizardStep; label: string }[] = [
  { n: 1, label: "Phone" },
  { n: 2, label: "Details" },
  { n: 3, label: "Tier" },
  { n: 4, label: "Review" },
];

function Stepper({ step }: { step: WizardStep }) {
  return (
    <View style={styles.stepperRow}>
      {STEP_ITEMS.map((item, idx) => (
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
          {idx < STEP_ITEMS.length - 1 && <View style={[styles.stepLine, step > item.n && styles.stepLineDone]} />}
        </Fragment>
      ))}
    </View>
  );
}

function MembershipTab({ pool }: { pool: Pool }) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  const [selectedTierId, setSelectedTierId] = useState<MembershipTierId | null>(null);

  // Step 4: review / save
  const [isSaving, setIsSaving] = useState(false);

  function reload() {
    setIsLoading(true);
    listMembershipsByPool(pool.id)
      .then(setMemberships)
      .finally(() => setIsLoading(false));
  }

  async function toggleMembershipStatus(membership: Membership) {
    const nextStatus = membership.status === "inactive" ? "active" : "inactive";
    try {
      await setMembershipStatus(pool.id, membership.id, nextStatus);
      reload();
    } catch (error) {
      Alert.alert("Couldn't update membership", error instanceof Error ? error.message : "Please try again.");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.id]);

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
      setPhoneError("Enter a valid 10-digit mobile number.");
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
      Alert.alert("Camera access needed", "Please allow camera access to take a member photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) updateMember(key, { photoUri: result.assets[0].uri });
  }

  const membersValid = members.length > 0 && members.every((member) => !member.includeInMembership || member.name.trim());
  const declarationsValid = acceptRisk && acceptRules;
  const canProceedFromDetails = membersValid && declarationsValid;

  function handleShowTerms() {
    Alert.alert(
      "Rules, regulations & special instructions",
      "Members must follow lifeguard instructions at all times, use designated changing areas, and report any medical conditions to facility staff before entering the pool."
    );
  }

  const selectedTier = MEMBERSHIP_TIERS.find((tier) => tier.id === selectedTierId) ?? null;
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

      await addMembership({
        poolId: pool.id,
        phone: verifiedPhone,
        isOfflineMember: false,
        members: uploadedMembers,
        tierId: selectedTier.id,
        tierName: selectedTier.name,
        price: totalPrice,
        durationDays: selectedTier.durationDays,
        sessions: selectedTier.sessions,
      });

      Alert.alert("Membership created", `${selectedTier.name} membership added for ${uploadedMembers.length} member${uploadedMembers.length === 1 ? "" : "s"}.`);
      resetWizard();
      reload();
    } catch (error) {
      Alert.alert("Couldn't create membership", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.tabTitle}>Membership Sign-up</Text>
      <Stepper step={step} />

      {step === 1 && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>Mobile Number</Text>
          <Text style={styles.wizardSubtitle}>Staff enters the member&apos;s mobile number to continue.</Text>

          <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
          <View style={styles.phoneInputRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={styles.phoneInputField}
              placeholder="10-digit mobile number"
              placeholderTextColor="#9ba1ad"
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
            {isCheckingPhone ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Continue</Text>}
          </TouchableOpacity>
        </View>
      )}

      {step === 2 && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>Member Details</Text>
          <Text style={styles.wizardSubtitle}>
            Phone: +91 {verifiedPhone}
            {existingAccountFound ? <Text style={styles.existingAccountText}>  ·  Existing account found</Text> : null}
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
            <Text style={styles.addMemberButtonText}>+ Add Member</Text>
          </TouchableOpacity>

          <View style={styles.declarationsCard}>
            <Text style={styles.declarationsTitle}>Declarations</Text>
            <TouchableOpacity style={styles.declarationRow} onPress={() => setAcceptRisk((value) => !value)} activeOpacity={0.8}>
              <View style={[styles.checkbox, acceptRisk && styles.checkboxChecked]}>{acceptRisk && <Ionicons name="checkmark" size={13} color="#fff" />}</View>
              <Text style={styles.declarationText}>I will swim at my own risk</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declarationRow} onPress={() => setAcceptRules((value) => !value)} activeOpacity={0.8}>
              <View style={[styles.checkbox, acceptRules && styles.checkboxChecked]}>{acceptRules && <Ionicons name="checkmark" size={13} color="#fff" />}</View>
              <Text style={styles.declarationText}>
                I accept the rules, regulations & special instructions and hereby undertake that I will abide by them —{" "}
                <Text style={styles.linkInlineText} onPress={handleShowTerms}>View Terms & Conditions</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.primaryButton, !canProceedFromDetails && styles.primaryButtonDisabled]} onPress={() => setStep(3)} disabled={!canProceedFromDetails}>
            <Text style={styles.primaryButtonText}>Next →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setStep(1)}>
            <Text style={styles.linkText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 3 && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>Select Membership Tier</Text>
          <Text style={styles.wizardSubtitle}>Choose the plan that fits the member.</Text>

          {MEMBERSHIP_TIERS.map((tier) => {
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
                  <Text style={styles.tierMetaText}>📅 {tier.durationDays} days</Text>
                  <Text style={styles.tierMetaText}>🏊 {tier.sessions} sessions</Text>
                </View>
                <Text style={styles.tierPrice}>₹{tier.price.toLocaleString("en-IN")}</Text>
                {tier.coachingAvailable && <Text style={styles.tierCoachingText}>🎓 Coaching available — billed separately</Text>}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={[styles.primaryButton, !selectedTierId && styles.primaryButtonDisabled]} onPress={() => setStep(4)} disabled={!selectedTierId}>
            <Text style={styles.primaryButtonText}>Next →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setStep(2)}>
            <Text style={styles.linkText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 4 && selectedTier && (
        <View style={styles.wizardCard}>
          <Text style={styles.wizardTitle}>Review & Confirm</Text>
          <Text style={styles.wizardSubtitle}>Payment should have been collected before confirming.</Text>

          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionLabel}>MEMBERS</Text>
            {members.filter((member) => member.includeInMembership && member.name.trim()).map((member, index) => (
              <View key={member.key} style={styles.reviewMemberRow}>
                {member.photoUri ? (
                  <Image source={{ uri: member.photoUri }} style={styles.reviewMemberPhoto} />
                ) : (
                  <View style={styles.reviewMemberPhotoPlaceholder}><Ionicons name="help" size={16} color="#2850e8" /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{member.name}</Text>
                  <Text style={styles.entryMeta}>
                    {member.age ? `${member.age} yrs · ` : ""}{member.gender} · {member.canSwim ? "🏊 Can swim" : "🚫 Cannot swim"}{member.coaching ? " · Coaching" : ""}
                  </Text>
                </View>
                <View style={styles.memberRolePill}>
                  <Text style={styles.memberRolePillText}>{index === 0 ? "Member" : "Dependent"}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.selectedPlanCard}>
            <Text style={styles.reviewSectionLabel}>SELECTED PLAN</Text>
            <Text style={styles.reviewTierName}>{selectedTier.name}</Text>
            <Text style={styles.wizardSubtitle}>{selectedTier.durationDays} days · {selectedTier.sessions} sessions</Text>
            <View style={styles.selectedPlanPriceRow}>
              <Text style={styles.selectedPlanQty}>{includedMemberCount} × ₹{selectedTier.price.toLocaleString("en-IN")}</Text>
              <Text style={styles.tierPrice}>₹{totalPrice.toLocaleString("en-IN")}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.confirmButton, isSaving && styles.primaryButtonDisabled]} onPress={handleConfirm} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmButtonText}>✓ Confirm & Activate Membership</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => setStep(3)} disabled={isSaving}>
            <Text style={styles.linkText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.tabTitle, { marginTop: 30 }]}>Active Memberships</Text>
      {isLoading ? (
        <ActivityIndicator color="#2850e8" style={{ marginTop: 20 }} />
      ) : memberships.length === 0 ? (
        <Text style={styles.sectionEmpty}>No memberships yet for this pool.</Text>
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
                <Text style={styles.entryMeta}>{membership.tierName} · ₹{membership.price} · till {new Date(membership.endDate).toLocaleDateString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={[styles.statusPill, isActive ? styles.statusActive : styles.statusExpired]}>
                  <Text style={[styles.statusPillText, isActive ? styles.statusActiveText : styles.statusExpiredText]}>
                    {isDeactivated ? "Inactive" : isActive ? "Active" : "Expired"}
                  </Text>
                </View>
                <TouchableOpacity style={styles.inactiveButton} onPress={() => toggleMembershipStatus(membership)}>
                  <Text style={styles.inactiveButtonText}>{isDeactivated ? "Reactivate" : "Inactive"}</Text>
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
  const [showGenderMenu, setShowGenderMenu] = useState(false);

  return (
    <View style={styles.memberCard}>
      {!isPrimary && (
        <TouchableOpacity style={styles.removeMemberButton} onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color="#c7cad2" />
        </TouchableOpacity>
      )}

      <View style={styles.photoRow}>
        <TouchableOpacity style={styles.memberPhotoButton} onPress={onTakePhoto} activeOpacity={0.8}>
          {member.photoUri ? <Image source={{ uri: member.photoUri }} style={styles.memberPhoto} /> : <View style={styles.memberPhotoPlaceholder}><Ionicons name="person" size={26} color="#9ea5b4" /></View>}
        </TouchableOpacity>
        <View>
          <TouchableOpacity style={styles.retakeButton} onPress={onTakePhoto}>
            <Text style={styles.retakeButtonText}>{member.photoUri ? "Retake Photo" : "Take Photo"}</Text>
          </TouchableOpacity>
          <Text style={styles.cameraHint}>Camera only — no gallery</Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>FULL NAME</Text>
      <TextInput style={styles.formInput} placeholder="Member's full name" placeholderTextColor="#9ba1ad" value={member.name} onChangeText={(value) => onChange({ name: value })} />

      <View style={styles.formRow}>
        <View style={styles.formRowInput}>
          <Text style={styles.fieldLabel}>AGE</Text>
          <TextInput style={styles.formInput} placeholder="Age" placeholderTextColor="#9ba1ad" value={member.age} onChangeText={(value) => onChange({ age: value.replace(/\D/g, "").slice(0, 3) })} keyboardType="number-pad" />
        </View>
        <View style={[styles.formRowInput, { position: "relative" }]}>
          <Text style={styles.fieldLabel}>GENDER</Text>
          <TouchableOpacity style={styles.genderSelect} onPress={() => setShowGenderMenu((value) => !value)}>
            <Text style={styles.genderSelectText}>{member.gender}</Text>
            <Ionicons name="chevron-down" size={16} color="#6d7481" />
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

      <Text style={styles.fieldLabel}>SWIMMING ABILITY</Text>
      <View style={styles.formRow}>
        <TouchableOpacity style={[styles.abilityOption, member.canSwim && styles.abilityOptionSelected]} onPress={() => onChange({ canSwim: true })}>
          <Text style={[styles.abilityOptionText, member.canSwim && styles.abilityOptionTextSelected]}>🏊 I can swim</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.abilityOption, !member.canSwim && styles.abilityOptionSelected]} onPress={() => onChange({ canSwim: false })}>
          <Text style={[styles.abilityOptionText, !member.canSwim && styles.abilityOptionTextSelected]}>🚫 Cannot swim</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Include coaching</Text>
          <Text style={styles.switchSubtitle}>Billed separately by facility</Text>
        </View>
        <Switch value={member.coaching} onValueChange={(value) => onChange({ coaching: value })} trackColor={{ false: "#dfe1e6", true: "#2850e8" }} />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchTitle}>Include in membership</Text>
        <Switch value={member.includeInMembership} onValueChange={(value) => onChange({ includeInMembership: value })} trackColor={{ false: "#dfe1e6", true: "#2850e8" }} />
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
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [dayEntries, setDayEntries] = useState<Entry[]>([]);
  const [weekEntries, setWeekEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = startOfDay(new Date());
  const isToday = isSameDay(selectedDate, today);

  useEffect(() => {
    setIsLoading(true);
    const dayStart = selectedDate.getTime();
    const dayEnd = addDays(selectedDate, 1).getTime();
    const rangeStart = addDays(selectedDate, -(CHART_DAYS - 1)).getTime();
    Promise.all([
      listEntriesInRange(pool.id, dayStart, dayEnd),
      listEntriesInRange(pool.id, rangeStart, dayEnd),
    ])
      .then(([day, week]) => {
        setDayEntries(day);
        setWeekEntries(week);
      })
      .finally(() => setIsLoading(false));
  }, [pool.id, selectedDate]);

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
      <Text style={styles.tabTitle}>Admin Dashboard</Text>
      <Text style={styles.tabSubtitle}>{pool.name}</Text>

      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => setSelectedDate((d) => addDays(d, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color="#4d5360" />
        </TouchableOpacity>
        <View style={styles.dateField}>
          <Ionicons name="calendar-outline" size={15} color="#4d5360" />
          <Text style={styles.dateFieldText}>{formatDateDMY(selectedDate)}</Text>
        </View>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
          disabled={isToday}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={18} color={isToday ? "#c7cad2" : "#4d5360"} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.todayButton, isToday && styles.todayButtonActive]} onPress={() => setSelectedDate(today)}>
          <Text style={[styles.todayButtonText, isToday && styles.todayButtonTextActive]}>Today</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#2850e8" style={{ marginTop: 30 }} />
      ) : (
        <>
          <View style={styles.poolStatusCard}>
            <View style={styles.poolStatusHeaderBlue}>
              <Text style={styles.poolStatusTitleWhite}>🏊 Currently in Pool</Text>
              <View style={styles.poolStatusCountBadge}>
                <Text style={styles.poolStatusCountText}>{isToday ? inPoolNow.length : 0}</Text>
              </View>
            </View>
            <View style={styles.poolStatusBody}>
              {!isToday ? (
                <Text style={styles.sectionEmpty}>Only available for today.</Text>
              ) : inPoolNow.length === 0 ? (
                <Text style={styles.sectionEmpty}>Pool is empty right now</Text>
              ) : (
                inPoolNow.map((entry) => {
                  const { name, meta } = personLine(entry);
                  return <EntryRow key={entry.id} name={name} meta={meta} right={<Text style={styles.rowTime}>{formatTime(entry.enteredAt)}</Text>} />;
                })
              )}
            </View>
          </View>

          <View style={styles.sessionsCard}>
            <View style={styles.poolStatusHeader}>
              <Text style={styles.poolStatusTitle}>Today's Sessions</Text>
              <View style={styles.countPill}><Text style={styles.countPillText}>{sessions.length}</Text></View>
            </View>
            {sessions.length === 0 ? (
              <Text style={styles.sectionEmpty}>No sessions yet</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.sessionsHeaderRow}>
                    <Text style={[styles.sessionsHeaderText, styles.colName]}>NAME</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colAge]}>AGE</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colGender]}>GENDER</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colTime]}>ENTRY</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colTime]}>EXIT</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colCharge]}>CHARGE</Text>
                    <Text style={[styles.sessionsHeaderText, styles.colStatus]}>STATUS</Text>
                  </View>
                  {sessions.map((entry) => {
                    const { name } = personLine(entry);
                    const age = entry.people[0]?.age;
                    const gender = entry.people[0]?.gender;
                    const inPool = !entry.exitedAt;
                    return (
                      <View key={entry.id} style={styles.sessionsRow}>
                        <Text style={[styles.sessionsCellText, styles.colName, { fontWeight: "700", color: "#171b23" }]} numberOfLines={1}>{name}</Text>
                        <Text style={[styles.sessionsCellText, styles.colAge]}>{age ?? "—"}</Text>
                        <Text style={[styles.sessionsCellText, styles.colGender]} numberOfLines={1}>{gender || "—"}</Text>
                        <Text style={[styles.sessionsCellText, styles.colTime]}>{formatTime(entry.enteredAt)}</Text>
                        <Text style={[styles.sessionsCellText, styles.colTime]}>{entry.exitedAt ? formatTime(entry.exitedAt) : "—"}</Text>
                        <Text style={[styles.sessionsCellText, styles.colCharge]}>{entry.price != null ? `₹${entry.price}` : "—"}</Text>
                        <View style={styles.colStatus}>
                          <View style={[styles.statusPill, inPool ? styles.statusActive : styles.statusExpired]}>
                            <Text style={[styles.statusPillText, inPool ? styles.statusActiveText : styles.statusExpiredText]}>{inPool ? "In Pool" : "Done"}</Text>
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
            <StatCard label="Total Revenue" value={`₹${stats.revenue}`} icon="cash-outline" />
            <StatCard label="Swimmers" value={String(stats.swimmers)} icon="water-outline" />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function RevenueChart({ days }: { days: { date: Date; revenue: number }[] }) {
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);
  return (
    <View style={styles.chartCard}>
      <Text style={styles.poolStatusTitle}>Revenue — Last {days.length} Days</Text>
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
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconCircle}><Ionicons name={icon} size={18} color="#2850e8" /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  topBar: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  logoutCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#fdeaea", alignItems: "center", justifyContent: "center" },

  emptyState: { alignItems: "center", marginTop: 60, gap: 8, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#171a21", marginTop: 8 },
  emptyText: { color: "#7d8390", fontSize: 14, textAlign: "center" },

  poolChipRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  poolChip: { paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: "#f3f4f7", justifyContent: "center" },
  poolChipActive: { backgroundColor: "#e9eeff", borderWidth: 1, borderColor: "#2850e8" },
  poolChipText: { color: "#4d5360", fontSize: 13, fontWeight: "600" },
  poolChipTextActive: { color: "#2850e8" },

  body: { flex: 1 },

  staffLayout: { flex: 1 },
  staffContent: { padding: 16, paddingBottom: 24 },
  modeToggle: { flexDirection: "row", borderRadius: 12, backgroundColor: "#f0f1f5", padding: 4, gap: 4, marginBottom: 16 },
  modeButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 9 },
  modeButtonActive: { backgroundColor: "#2850e8" },
  modeButtonText: { color: "#4d5360", fontWeight: "700", fontSize: 15 },
  modeButtonTextActive: { color: "#fff" },
  scannerCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 18, padding: 16, marginBottom: 16, backgroundColor: "#fff" },
  scanTitle: { fontSize: 15, fontWeight: "700", color: "#171b23", marginBottom: 12 },
  cameraFrame: { aspectRatio: 1.55, borderRadius: 16, overflow: "hidden", backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  cornerTL: { position: "absolute", top: 14, left: 14, width: 26, height: 26, borderColor: "#fff", borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { position: "absolute", top: 14, right: 14, width: 26, height: 26, borderColor: "#fff", borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { position: "absolute", bottom: 14, left: 14, width: 26, height: 26, borderColor: "#fff", borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { position: "absolute", bottom: 14, right: 14, width: 26, height: 26, borderColor: "#fff", borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  permissionState: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
  permissionText: { color: "#c7cad2", fontSize: 13, textAlign: "center" },
  permissionButton: { marginTop: 8, backgroundColor: "#2850e8", height: 40, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
  permissionButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  resultOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  resultText: { color: "#fff", fontWeight: "700", fontSize: 14, textAlign: "center" },
  flashlightRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: "#f5f6fa", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  flashlightText: { color: "#7d8390", fontSize: 13, flexShrink: 1 },

  sectionCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 18, padding: 16, marginBottom: 16, backgroundColor: "#fff" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#171b23" },
  countPill: { backgroundColor: "#eaf0ff", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countPillText: { color: "#2850e8", fontSize: 12, fontWeight: "700" },
  searchBar: { height: 40, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 13, color: "#171b23" },
  emptySection: { alignItems: "center", paddingVertical: 22, gap: 10 },
  emptyIconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#eef2fc", alignItems: "center", justifyContent: "center" },
  sectionEmpty: { color: "#9aa1b1", fontSize: 13, textAlign: "center" },

  entryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f1f2f5" },
  entryAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eaf0ff", alignItems: "center", justifyContent: "center" },
  entryAvatarText: { color: "#2850e8", fontWeight: "700", fontSize: 13 },
  entryName: { fontSize: 14, fontWeight: "700", color: "#171b23" },
  entryMeta: { fontSize: 12, color: "#7d8390", marginTop: 2 },
  rowTime: { fontSize: 12.5, fontWeight: "700", color: "#171b23" },
  rowSubText: { fontSize: 11, color: "#7d8390", marginTop: 2 },
  pricePill: { marginTop: 4, backgroundColor: "#eaf0ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pricePillText: { color: "#2850e8", fontSize: 11, fontWeight: "700" },

  tabScroll: { flex: 1 },
  tabContent: { padding: 20, paddingBottom: 60 },
  tabTitle: { fontSize: 19, fontWeight: "700", color: "#171b23" },
  tabSubtitle: { color: "#7d8390", fontSize: 13, marginTop: 4, marginBottom: 18 },
  formInput: { height: 50, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: "#171b23", marginBottom: 12 },
  formRow: { flexDirection: "row", gap: 12 },
  formRowInput: { flex: 1 },
  options: { flexDirection: "row", gap: 8, marginBottom: 12 },
  option: { flex: 1, height: 42, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionSelected: { borderColor: "#2850e8", backgroundColor: "#eaf0ff" },
  optionText: { color: "#666", fontSize: 12.5, fontWeight: "600" },
  optionTextSelected: { color: "#2850e8", fontWeight: "700" },
  primaryButton: { height: 50, borderRadius: 12, backgroundColor: "#2850e8", alignItems: "center", justifyContent: "center", marginTop: 6 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  membershipCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#eceef2", borderRadius: 14, padding: 12, marginTop: 10 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusActive: { backgroundColor: "#e6f8ee" },
  statusExpired: { backgroundColor: "#fdeaea" },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  statusActiveText: { color: "#1fb46a" },
  statusExpiredText: { color: "#df4545" },
  inactiveButton: { paddingHorizontal: 10, height: 24, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7ec", alignItems: "center", justifyContent: "center" },
  inactiveButtonText: { fontSize: 10.5, fontWeight: "700", color: "#4d5360" },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  statCard: { width: "47%", borderWidth: 1, borderColor: "#eceef2", borderRadius: 16, padding: 16, gap: 6 },
  statIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#eaf0ff", alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: "#171b23" },
  statLabel: { fontSize: 12, color: "#7d8390" },

  bottomNav: { height: 88, borderTopWidth: 1, borderColor: "#e8e9ed", backgroundColor: "#fff", flexDirection: "row", justifyContent: "space-around", paddingTop: 10 },
  navItem: { alignItems: "center", gap: 4 },
  navText: { fontSize: 12, color: "#7f8797", fontWeight: "600" },
  navTextActive: { color: "#2850e8", fontWeight: "700" },

  stepperRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 18, marginBottom: 22 },
  stepperItem: { alignItems: "center", width: 60 },
  stepLine: { flex: 1, height: 2, backgroundColor: "#e5e7ec", marginTop: 13 },
  stepLineDone: { backgroundColor: "#2850e8" },
  stepCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: "#dfe1e6", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  stepCircleActive: { backgroundColor: "#2850e8", borderColor: "#2850e8" },
  stepCircleDone: { backgroundColor: "#2850e8", borderColor: "#2850e8" },
  stepCircleText: { fontSize: 12, fontWeight: "700", color: "#9aa1b1" },
  stepCircleTextActive: { color: "#fff" },
  stepLabel: { fontSize: 11, color: "#9aa1b1", marginTop: 6, fontWeight: "600" },
  stepLabelActive: { color: "#2850e8" },

  wizardCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 18, padding: 18, backgroundColor: "#fff" },
  wizardTitle: { fontSize: 19, fontWeight: "700", color: "#171b23" },
  wizardSubtitle: { color: "#7d8390", fontSize: 13, marginTop: 4, marginBottom: 16 },
  existingAccountText: { color: "#1fb46a", fontWeight: "700" },

  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: "#c7cad2", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", marginTop: 1 },
  checkboxChecked: { backgroundColor: "#2850e8", borderColor: "#2850e8" },

  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#8a90a0", letterSpacing: 0.4, marginBottom: 8 },
  phoneInputRow: { height: 50, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 12, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 6 },
  phonePrefix: { fontSize: 14, fontWeight: "700", color: "#171b23", marginRight: 8 },
  phoneInputField: { flex: 1, height: "100%", fontSize: 14, color: "#171b23" },
  errorText: { color: "#df4545", fontSize: 12.5, marginBottom: 10, marginTop: 2 },

  linkRow: { alignItems: "center", marginTop: 14 },
  linkText: { color: "#2850e8", fontWeight: "700", fontSize: 13.5 },
  linkInlineText: { color: "#2850e8", fontWeight: "700" },

  memberCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 16, padding: 16, marginBottom: 14, position: "relative" },
  removeMemberButton: { position: "absolute", top: 10, right: 10, zIndex: 1 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  memberPhotoButton: { width: 62, height: 62, borderRadius: 31 },
  memberPhoto: { width: 62, height: 62, borderRadius: 31 },
  memberPhotoPlaceholder: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#edf0f5", alignItems: "center", justifyContent: "center" },
  retakeButton: { borderWidth: 1, borderColor: "#2850e8", borderRadius: 9, paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center" },
  retakeButtonText: { color: "#2850e8", fontWeight: "700", fontSize: 12.5 },
  cameraHint: { color: "#9aa1b1", fontSize: 11, marginTop: 6 },

  genderSelect: { height: 50, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  genderSelectText: { fontSize: 14, color: "#171b23" },
  genderMenu: { position: "absolute", zIndex: 5, top: 78, left: 0, right: 0, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e4e9", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  genderChoice: { paddingHorizontal: 14, paddingVertical: 11 },
  genderChoiceText: { fontSize: 14, color: "#20242b" },

  abilityOption: { flex: 1, height: 46, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  abilityOptionSelected: { borderColor: "#2850e8", backgroundColor: "#eaf0ff" },
  abilityOptionText: { color: "#4d5360", fontSize: 13, fontWeight: "600" },
  abilityOptionTextSelected: { color: "#2850e8", fontWeight: "700" },

  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderColor: "#f1f2f5", marginTop: 4 },
  switchTitle: { fontSize: 14, fontWeight: "700", color: "#171b23" },
  switchSubtitle: { fontSize: 11.5, color: "#7d8390", marginTop: 2 },

  addMemberButton: { height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: "#2850e8", borderStyle: "dashed", backgroundColor: "#f4f6ff", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  addMemberButtonText: { color: "#2850e8", fontWeight: "700", fontSize: 14 },

  declarationsCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 14, padding: 16, marginBottom: 20 },
  declarationsTitle: { fontSize: 14, fontWeight: "700", color: "#171b23", marginBottom: 12 },
  declarationRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  declarationText: { flex: 1, fontSize: 13, color: "#4d5360", lineHeight: 19 },

  tierCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 16, padding: 16, marginBottom: 14, position: "relative" },
  tierCardSelected: { borderColor: "#2850e8", borderWidth: 1.5 },
  tierCheckBadge: { position: "absolute", top: 14, right: 14, width: 24, height: 24, borderRadius: 12, backgroundColor: "#2850e8", alignItems: "center", justifyContent: "center" },
  tierName: { fontSize: 17, fontWeight: "700", color: "#171b23" },
  tierMetaRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  tierMetaText: { fontSize: 12.5, color: "#7d8390" },
  tierPrice: { fontSize: 22, fontWeight: "800", color: "#2850e8", marginTop: 8 },
  tierCoachingText: { fontSize: 11.5, color: "#c47a1f", marginTop: 8 },

  reviewTierName: { fontSize: 19, fontWeight: "700", color: "#171b23", marginTop: 2 },
  reviewMemberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f1f2f5" },
  reviewMemberPhoto: { width: 34, height: 34, borderRadius: 17 },
  reviewMemberPhotoPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eaf0ff", alignItems: "center", justifyContent: "center" },
  memberRolePill: { backgroundColor: "#eaf0ff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  memberRolePillText: { color: "#2850e8", fontSize: 11.5, fontWeight: "700" },

  reviewSection: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 16, padding: 16, marginBottom: 14 },
  reviewSectionLabel: { fontSize: 11, fontWeight: "700", color: "#8a90a0", letterSpacing: 0.4, marginBottom: 10 },

  selectedPlanCard: { borderWidth: 1.5, borderColor: "#2850e8", borderRadius: 16, backgroundColor: "#eef1ff", padding: 16, marginBottom: 20 },
  selectedPlanPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 },
  selectedPlanQty: { fontSize: 13, color: "#4d5360", fontWeight: "600" },

  confirmButton: { height: 52, borderRadius: 12, backgroundColor: "#1fb46a", alignItems: "center", justifyContent: "center" },
  confirmButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  dateBar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 18 },
  dateArrow: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7ec", alignItems: "center", justifyContent: "center" },
  dateField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 42, borderWidth: 1, borderColor: "#e5e7ec", borderRadius: 10, paddingHorizontal: 12 },
  dateFieldText: { fontSize: 14, fontWeight: "600", color: "#171b23" },
  todayButton: { height: 42, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7ec", alignItems: "center", justifyContent: "center" },
  todayButtonActive: { borderColor: "#2850e8", backgroundColor: "#eaf0ff" },
  todayButtonText: { fontSize: 13, fontWeight: "700", color: "#4d5360" },
  todayButtonTextActive: { color: "#2850e8" },

  poolStatusCard: { borderRadius: 18, borderWidth: 1, borderColor: "#eceef2", overflow: "hidden", marginBottom: 16 },
  poolStatusHeaderBlue: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#2850e8", paddingHorizontal: 16, paddingVertical: 14 },
  poolStatusTitleWhite: { fontSize: 15, fontWeight: "700", color: "#fff" },
  poolStatusBody: { padding: 16 },
  poolStatusHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  poolStatusTitle: { fontSize: 15, fontWeight: "700", color: "#171b23" },
  poolStatusCountBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  poolStatusCountText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  sessionsCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 18, padding: 16, marginBottom: 16 },
  sessionsHeaderRow: { flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderColor: "#eceef2", marginBottom: 4 },
  sessionsHeaderText: { fontSize: 10.5, fontWeight: "700", color: "#9aa1b1", letterSpacing: 0.4 },
  sessionsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f1f2f5" },
  sessionsCellText: { fontSize: 12.5, color: "#4d5360" },
  colName: { width: 100, paddingRight: 8 },
  colAge: { width: 44 },
  colGender: { width: 64 },
  colTime: { width: 66 },
  colCharge: { width: 60 },
  colStatus: { width: 72 },

  chartCard: { borderWidth: 1, borderColor: "#eceef2", borderRadius: 18, padding: 16, marginBottom: 16 },
  chartRangeText: { fontSize: 12, color: "#9aa1b1", marginBottom: 16 },
  chartBarsRow: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 8 },
  chartBarColumn: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  chartBarValue: { fontSize: 9.5, color: "#2850e8", fontWeight: "700", marginBottom: 4 },
  chartBarTrack: { width: "100%", flex: 1, justifyContent: "flex-end", backgroundColor: "#f5f6fa", borderRadius: 6, overflow: "hidden" },
  chartBarFill: { width: "100%", backgroundColor: "#2850e8", borderRadius: 6 },
  chartBarLabel: { fontSize: 9.5, color: "#9aa1b1", marginTop: 6 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(17,20,28,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 22, padding: 24, alignItems: "center" },
  modalIconCircle: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  modalIconCircleGreen: { backgroundColor: "#e6f8ee" },
  modalIconCircleBlue: { backgroundColor: "#eaf0ff" },
  modalRupee: { fontSize: 28, fontWeight: "800", color: "#2850e8" },
  modalTitle: { fontSize: 19, fontWeight: "800", color: "#171b23", marginBottom: 14 },
  modalAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#eaf0ff", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  modalAvatarText: { color: "#2850e8", fontWeight: "700", fontSize: 22 },
  modalName: { fontSize: 18, fontWeight: "700", color: "#171b23" },
  modalPillRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 4 },
  modalPill: { backgroundColor: "#f1f3f6", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  modalPillText: { fontSize: 12.5, fontWeight: "700", color: "#4d5360" },
  modalPillPink: { backgroundColor: "#fdeaf1" },
  modalPillTextPink: { color: "#e0568f" },
  modalDivider: { height: 1, backgroundColor: "#eceef2", alignSelf: "stretch", marginVertical: 12 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignSelf: "stretch", paddingVertical: 4 },
  modalRowLabel: { fontSize: 13.5, color: "#7d8390" },
  modalRowValue: { fontSize: 13.5, fontWeight: "700", color: "#171b23" },
  modalNote: { fontSize: 12, color: "#2850e8", alignSelf: "stretch", marginTop: 4 },
  modalTotalLabel: { fontSize: 16, fontWeight: "800", color: "#171b23" },
  modalTotalValue: { fontSize: 20, fontWeight: "800", color: "#2850e8" },
  modalPrimaryButton: { height: 52, borderRadius: 14, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 18 },
  modalPrimaryButtonGreen: { backgroundColor: "#20c982" },
  modalPrimaryButtonText: { color: "#fff", fontSize: 15.5, fontWeight: "700" },
  modalDismiss: { marginTop: 14 },
  modalDismissText: { color: "#7d8390", fontSize: 14, fontWeight: "600" },
});
