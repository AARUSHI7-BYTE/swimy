import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAppContext } from "./app-context";
import { addPool, deletePool, getAllPools, Pool, updatePoolImageUrl } from "../lib/firestore";
import { deletePoolImage, uploadPoolImage } from "../lib/storage";
import { getPoolImage } from "../lib/pool-images";
import { signOutUser } from "../firebaseconfig";

const sizeOptions = ["Small", "Medium", "Large"];

export default function AdminDashboard() {
  const { role, phoneNumber, resetSession } = useAppContext();
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const loadPools = () => {
    setIsLoading(true);
    getAllPools()
      .then(setPools)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (role !== "admin") {
      router.replace("/admin-login");
      return;
    }
    loadPools();
  }, [role]);

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

  function confirmDeletePool(pool: Pool) {
    Alert.alert("Delete pool", `Delete "${pool.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => handleDeletePool(pool) },
    ]);
  }

  async function handleDeletePool(pool: Pool) {
    try {
      await deletePool(pool.id);
      deletePoolImage(pool.id).catch(() => {});
      loadPools();
    } catch (error) {
      Alert.alert("Couldn't delete pool", error instanceof Error ? error.message : "Please try again.");
    }
  }

  const stats = useMemo(() => {
    const locations = new Set(pools.map((pool) => pool.location.trim()).filter(Boolean));
    return {
      total: pools.length,
      locations: locations.size,
      active: pools.filter((pool) => pool.active).length,
    };
  }, [pools]);

  if (role !== "admin") {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Pool Catalog</Text>
          <TouchableOpacity style={styles.iconCircle} onPress={confirmLogout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={22} color="#2457FF" />
          </TouchableOpacity>
        </View>
        {phoneNumber ? <Text style={styles.subtitle}>Signed in as +91 {phoneNumber}</Text> : null}

        <TouchableOpacity style={styles.addButton} onPress={() => setIsFormVisible(true)} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Add Pool</Text>
        </TouchableOpacity>

        {!isLoading && pools.length ? (
          <View style={styles.statsRow}>
            <StatCard iconBg="#e6edff" icon={<MaterialCommunityIcons name="swim" size={22} color="#2457FF" />} value={stats.total} label="Total Pools" />
            <StatCard iconBg="#e3f6e9" icon={<Ionicons name="location" size={20} color="#1fb46a" />} value={stats.locations} label="Locations" />
            <StatCard iconBg="#f1eafd" icon={<MaterialCommunityIcons name="swim" size={22} color="#8b5cf6" />} value={stats.active} label="Active Pools" />
          </View>
        ) : null}

        {pools.length ? <Text style={styles.sectionTitle}>Your Pools</Text> : null}

        {isLoading ? (
          <ActivityIndicator color="#2850e8" style={{ marginTop: 30 }} />
        ) : pools.length ? (
          pools.map((pool) => <PoolCard key={pool.id} pool={pool} onDelete={() => confirmDeletePool(pool)} />)
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="water-outline" size={40} color="#9aa1b1" />
            <Text style={styles.emptyTitle}>No pools yet</Text>
            <Text style={styles.emptyText}>Add your first pool to the catalog.</Text>
          </View>
        )}
      </ScrollView>

      <AddPoolModal
        visible={isFormVisible}
        onClose={() => setIsFormVisible(false)}
        onSaved={() => {
          setIsFormVisible(false);
          loadPools();
        }}
      />
    </SafeAreaView>
  );
}

function StatCard({ icon, iconBg, value, label }: { icon: ReactNode; iconBg: string; value: number; label: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconCircle, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PoolCard({ pool, onDelete }: { pool: Pool; onDelete: () => void }) {
  return (
    <View style={styles.poolCard}>
      <Image source={pool.imageUrl ? { uri: pool.imageUrl } : getPoolImage(pool.imageKey)} style={styles.poolImage} />
      <View style={styles.poolCopy}>
        <Text style={styles.poolName}>{pool.name}</Text>
        <Text style={styles.poolMeta}>
          {pool.location} · {pool.covered ? "Indoor" : "Outdoor"}
          {pool.kidsPool ? " · Kids Pool" : ""}
        </Text>
        <Text style={styles.poolMeta}>
          Size: <Text style={styles.poolSizeValue}>{pool.size}</Text>
        </Text>
        <View style={[styles.statusPill, pool.active ? styles.statusPillActive : styles.statusPillInactive]}>
          <View style={[styles.statusDot, { backgroundColor: pool.active ? "#1fb46a" : "#9aa1b1" }]} />
          <Text style={[styles.statusText, { color: pool.active ? "#1fb46a" : "#7d8390" }]}>{pool.active ? "Active" : "Inactive"}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.menuButton} onPress={onDelete} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color="#df4545" />
      </TouchableOpacity>
    </View>
  );
}

function AddPoolModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [covered, setCovered] = useState(false);
  const [kidsPool, setKidsPool] = useState(false);
  const [size, setSize] = useState("Medium");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setName("");
    setLocation("");
    setPrice("");
    setCovered(false);
    setKidsPool(false);
    setSize("Medium");
    setImageUri(null);
    setErrorMessage("");
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Please allow camera access to take a pool photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Please allow photo access to add a pool photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  function choosePhoto() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Take Photo", "Choose from Gallery"], cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex === 1) takePhoto();
          if (buttonIndex === 2) pickFromGallery();
        }
      );
    } else {
      Alert.alert("Add a pool photo", "", [
        { text: "Take Photo", onPress: takePhoto },
        { text: "Choose from Gallery", onPress: pickFromGallery },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  async function handleSave() {
    if (!name.trim() || !location.trim()) {
      setErrorMessage("Pool name and location are required.");
      return;
    }
    const pricePerVisit = Number(price);
    if (!price.trim() || !Number.isFinite(pricePerVisit) || pricePerVisit <= 0) {
      setErrorMessage("Enter a valid price per visit.");
      return;
    }
    setErrorMessage("");
    setIsSaving(true);
    try {
      const poolId = await addPool({
        name: name.trim(),
        location: location.trim(),
        covered,
        kidsPool,
        size,
        imageUrl: "",
        pricePerVisit,
      });
      if (imageUri) {
        const imageUrl = await uploadPoolImage(poolId, imageUri);
        await updatePoolImageUrl(poolId, imageUrl);
      }
      resetForm();
      onSaved();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Couldn't save this pool: ${detail}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Pool</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={26} color="#151515" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.photoButton} onPress={choosePhoto} activeOpacity={0.85}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={30} color="#9ea5b4" />
                  <Text style={styles.photoHint}>Add pool photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>Pool Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. BMW Pool" placeholderTextColor="#a7aab3" />

            <Text style={styles.label}>Location</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Whitefield, Bengaluru" placeholderTextColor="#a7aab3" />

            <Text style={styles.label}>Price per Visit</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.pricePrefix}>₹</Text>
              <TextInput
                style={styles.priceInputField}
                value={price}
                onChangeText={(value) => setPrice(value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 150"
                placeholderTextColor="#a7aab3"
                keyboardType="number-pad"
              />
            </View>

            <Text style={styles.label}>Size</Text>
            <View style={styles.chipRow}>
              {sizeOptions.map((option) => (
                <TouchableOpacity key={option} style={[styles.chip, size === option && styles.chipActive]} onPress={() => setSize(option)}>
                  <Text style={[styles.chipText, size === option && styles.chipTextActive]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.chip, covered && styles.chipActive]} onPress={() => setCovered(!covered)}>
                <Ionicons name={covered ? "checkbox" : "square-outline"} size={17} color={covered ? "#2850e8" : "#6f7785"} />
                <Text style={[styles.chipText, covered && styles.chipTextActive]}>Covered</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, kidsPool && styles.chipActive]} onPress={() => setKidsPool(!kidsPool)}>
                <Ionicons name={kidsPool ? "checkbox" : "square-outline"} size={17} color={kidsPool ? "#2850e8" : "#6f7785"} />
                <Text style={[styles.chipText, kidsPool && styles.chipTextActive]}>Kids Pool</Text>
              </TouchableOpacity>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <TouchableOpacity style={[styles.saveButton, isSaving && styles.buttonDisabled]} onPress={handleSave} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Pool</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingTop: 32, paddingBottom: 60 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: "#2850e8", fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: "700", color: "#151923", marginTop: 4 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#eaf0ff", alignItems: "center", justifyContent: "center" },
  subtitle: { color: "#7d8390", fontSize: 14, marginTop: 8, marginBottom: 8 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 13, backgroundColor: "#2457FF", marginTop: 12, marginBottom: 22, shadowColor: "#2457ff", shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 26 },
  statCard: { flex: 1, borderRadius: 14, backgroundColor: "#f7f8fa", padding: 14 },
  statIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statValue: { fontSize: 24, fontWeight: "700", color: "#151923" },
  statLabel: { color: "#6e7581", fontSize: 13, marginTop: 2 },

  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#151923", marginBottom: 14 },

  poolCard: { flexDirection: "row", alignItems: "flex-start", borderRadius: 16, borderWidth: 1, borderColor: "#eceef2", padding: 12, marginBottom: 14, shadowColor: "#aeb4c0", shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  poolImage: { width: 78, height: 86, borderRadius: 12 },
  poolCopy: { flex: 1, paddingLeft: 14 },
  poolName: { fontSize: 17, fontWeight: "700", color: "#171a21" },
  poolMeta: { color: "#6e7581", fontSize: 13, marginTop: 6 },
  poolSizeValue: { color: "#2457FF", fontWeight: "700" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, height: 26, borderRadius: 13, marginTop: 10 },
  statusPillActive: { backgroundColor: "#e3f6e9" },
  statusPillInactive: { backgroundColor: "#f0f1f4" },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, fontWeight: "700" },
  menuButton: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#f0f2f7", alignItems: "center", justifyContent: "center", marginLeft: 8 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#171a21", marginTop: 8 },
  emptyText: { color: "#7d8390", fontSize: 14, textAlign: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15,17,23,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, maxHeight: "88%" },
  modalHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#e4e5e9", alignSelf: "center", marginBottom: 14 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 22, fontWeight: "700", color: "#111111" },

  photoButton: { alignSelf: "center", marginBottom: 8 },
  photo: { width: 160, height: 120, borderRadius: 14 },
  photoPlaceholder: { width: 160, height: 120, borderRadius: 14, backgroundColor: "#edf0f5", alignItems: "center", justifyContent: "center", gap: 6 },
  photoHint: { color: "#7f8793", fontSize: 12, fontWeight: "600" },

  label: { color: "#7a7f89", fontSize: 13, fontWeight: "600", marginTop: 18, marginBottom: 8 },
  input: { height: 52, borderWidth: 1, borderColor: "#e4e5e9", borderRadius: 11, paddingHorizontal: 15, fontSize: 16, color: "#1c1d21", backgroundColor: "#fff" },
  priceInputRow: { height: 52, borderWidth: 1, borderColor: "#e4e5e9", borderRadius: 11, flexDirection: "row", alignItems: "center", paddingHorizontal: 15, backgroundColor: "#fff" },
  pricePrefix: { fontSize: 16, fontWeight: "700", color: "#1c1d21", marginRight: 8 },
  priceInputField: { flex: 1, height: "100%", fontSize: 16, color: "#1c1d21" },

  chipRow: { flexDirection: "row", gap: 10 },
  toggleRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: "#f3f4f7" },
  chipActive: { backgroundColor: "#e9eeff", borderWidth: 1, borderColor: "#2850e8" },
  chipText: { color: "#4d5360", fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "#2850e8" },

  errorText: { marginTop: 16, color: "#df4545", fontSize: 14, textAlign: "center" },
  saveButton: { height: 56, marginTop: 26, borderRadius: 13, backgroundColor: "#2457ff", alignItems: "center", justifyContent: "center" },
  buttonDisabled: { opacity: 0.7 },
  saveButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
