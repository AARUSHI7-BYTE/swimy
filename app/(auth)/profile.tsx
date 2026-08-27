import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useAppContext } from "../../context/app-context";
import { useLanguage } from "../../context/language-context";
import { useTheme } from "../../context/theme-context";
import { ThemeColors } from "../../lib/theme";
import { uploadUserPhoto } from "../../lib/storage";
import { useUpdateUserPhotoMutation } from "../../lib/queries";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN_AGE = 5;
const MAX_AGE = 100;

function today() {
  return new Date();
}

function yearsAgo(years: number) {
  const date = today();
  date.setFullYear(date.getFullYear() - years);
  return date;
}

function formatDobDisplay(dob: Date) {
  return `${String(dob.getDate()).padStart(2, "0")} ${months[dob.getMonth()]} ${dob.getFullYear()}`;
}

function dobError(dob: Date | null, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (!dob) return t("profile.dobSelectError");

  const now = today();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  if (dob > now || age < MIN_AGE) return t("profile.dobMinAgeError", { age: MIN_AGE });
  if (age > MAX_AGE) return t("profile.dobInvalidError");
  return "";
}

export default function Profile() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const genderOptions: { value: "female" | "male" | "other"; label: string }[] = [
    { value: "female", label: t("common.female") },
    { value: "male", label: t("common.male") },
    { value: "other", label: t("common.other") },
  ];
  const { uid, userName, setUserName, profilePhotoUri, setProfilePhotoUri, setGender: setContextGender, setDateOfBirth } = useAppContext();
  const [fullName, setFullName] = useState(userName);
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<"female" | "male" | "other">("female");
  const [otherGenderText, setOtherGenderText] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [showGenderChoices, setShowGenderChoices] = useState(false);
  const [showNameError, setShowNameError] = useState(false);
  const [dobErrorText, setDobErrorText] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [showOtherGenderError, setShowOtherGenderError] = useState(false);
  const updateUserPhotoMutation = useUpdateUserPhotoMutation();

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        setDob(selectedDate);
        setDobErrorText("");
      }
      return;
    }
    // iOS spinner reports every scroll tick and stays open until dismissed
    // with the Done button below, rather than closing on the first change.
    if (selectedDate) {
      setDob(selectedDate);
      setDobErrorText("");
    }
  }

  // Local URI shows instantly in this app; the upload happens in the
  // background so facility staff can see the same photo on their scan
  // pop-up. Best-effort - a failed upload just means the QR-scan pop-up
  // falls back to initials, not a blocking error for the swimmer.
  function applyPhoto(uri: string) {
    setProfilePhotoUri(uri);
    if (!uid) return;
    uploadUserPhoto(uid, uri)
      .then((photoUrl) => updateUserPhotoMutation.mutateAsync({ uid, photoUrl }))
      .catch((error) => console.error("Failed to upload profile photo", error));
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(t("profile.photoErrorCamera"));
      return;
    }
    setPhotoError("");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) applyPhoto(result.assets[0].uri);
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(t("profile.photoErrorGallery"));
      return;
    }
    setPhotoError("");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) applyPhoto(result.assets[0].uri);
  }

  function choosePhoto() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [t("common.cancel"), t("profile.takePhoto"), t("profile.chooseGallery")], cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex === 1) takePhoto();
          if (buttonIndex === 2) pickFromGallery();
        }
      );
    } else {
      Alert.alert(t("profile.addPhotoTitle"), "", [
        { text: t("profile.takePhoto"), onPress: takePhoto },
        { text: t("profile.chooseGallery"), onPress: pickFromGallery },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    }
  }

  function saveProfile() {
    if (!fullName.trim()) {
      setShowNameError(true);
      return;
    }
    const dobIssue = dobError(dob, t);
    if (dobIssue) {
      setDobErrorText(dobIssue);
      return;
    }
    if (gender === "other" && !otherGenderText.trim()) {
      setShowOtherGenderError(true);
      return;
    }
    setUserName(fullName.trim());
    const genderLabel = gender === "other" ? otherGenderText.trim() : genderOptions.find((option) => option.value === gender)?.label ?? "";
    setContextGender(genderLabel);
    if (dob) setDateOfBirth(`${String(dob.getDate()).padStart(2, "0")}/${String(dob.getMonth() + 1).padStart(2, "0")}/${dob.getFullYear()}`);
    router.push({ pathname: "/location", params: { isSignup: "1" } });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{t("profile.title")}</Text>
      <TouchableOpacity style={styles.photoButton} onPress={choosePhoto} activeOpacity={0.8}>
        {profilePhotoUri ? <Image source={{ uri: profilePhotoUri }} style={styles.photo} /> : <View style={styles.photoPlaceholder}><Ionicons name="person" size={48} color={colors.textFaint} /></View>}
        <View style={styles.cameraBadge}><Ionicons name="camera" size={16} color="#fff" /></View>
      </TouchableOpacity>
      <Text style={styles.photoHint}>{t("profile.photoHint")}</Text>
      {photoError ? <Text style={styles.photoErrorText}>{photoError}</Text> : null}

      <Text style={styles.label}>{t("profile.fullNameLabel")}</Text>
      <TextInput style={[styles.input, showNameError && styles.errorInput]} value={fullName} onChangeText={(value) => { setFullName(value); setShowNameError(false); }} placeholder={t("profile.fullNamePlaceholder")} placeholderTextColor={colors.textFaint} autoCapitalize="words" />
      {showNameError && <Text style={styles.errorText}>{t("profile.fullNameError")}</Text>}

      <View style={styles.splitRow}>
        <View style={styles.halfField}>
          <Text style={styles.label}>{t("profile.dobLabel")}</Text>
          <TouchableOpacity style={styles.compactInput} onPress={() => setShowDatePicker(true)}>
            <Text style={dob ? styles.compactValue : styles.compactPlaceholder}>{dob ? formatDobDisplay(dob) : t("profile.dobPlaceholder")}</Text>
            <Ionicons name="calendar-outline" size={17} color={colors.textMuted} />
          </TouchableOpacity>
          {dobErrorText ? <Text style={styles.errorText}>{dobErrorText}</Text> : null}
          {showDatePicker && Platform.OS === "android" && (
            <DateTimePicker
              value={dob ?? yearsAgo(MIN_AGE)}
              mode="date"
              display="default"
              minimumDate={yearsAgo(MAX_AGE)}
              maximumDate={yearsAgo(MIN_AGE)}
              onChange={handleDateChange}
            />
          )}
          {Platform.OS === "ios" && (
            <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
                <View style={styles.datePickerCard}>
                  <DateTimePicker
                    value={dob ?? yearsAgo(MIN_AGE)}
                    mode="date"
                    display="spinner"
                    minimumDate={yearsAgo(MAX_AGE)}
                    maximumDate={yearsAgo(MIN_AGE)}
                    onChange={handleDateChange}
                  />
                  <TouchableOpacity style={styles.doneButton} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.doneButtonText}>{t("common.done")}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          )}
        </View>
        <View style={styles.halfField}>
          <Text style={styles.label}>{t("profile.genderLabel")}</Text>
          <TouchableOpacity style={styles.compactInput} onPress={() => setShowGenderChoices(!showGenderChoices)}><Text style={styles.compactValue}>{genderOptions.find((option) => option.value === gender)?.label}</Text><Ionicons name="chevron-down" size={17} color={colors.textMuted} /></TouchableOpacity>
          {showGenderChoices && <View style={styles.genderMenu}>{genderOptions.map((option) => <TouchableOpacity key={option.value} style={styles.genderChoice} onPress={() => { setGender(option.value); setShowGenderChoices(false); if (option.value !== "other") setOtherGenderText(""); setShowOtherGenderError(false); }}><Text style={styles.genderChoiceText}>{option.label}</Text></TouchableOpacity>)}</View>}
        </View>
      </View>

      {gender === "other" && (
        <>
          <Text style={styles.label}>{t("profile.otherGenderLabel")}</Text>
          <TextInput
            style={[styles.input, showOtherGenderError && styles.errorInput]}
            value={otherGenderText}
            onChangeText={(value) => { setOtherGenderText(value); setShowOtherGenderError(false); }}
            placeholder={t("profile.otherGenderPlaceholder")}
            placeholderTextColor={colors.textFaint}
          />
          {showOtherGenderError && <Text style={styles.errorText}>{t("profile.otherGenderError")}</Text>}
        </>
      )}

      <Text style={styles.label}>{t("profile.emergencyLabel")}</Text>
      <View style={styles.contactInput}><Text style={styles.countryCode}>+91</Text><TextInput style={styles.contactTextInput} value={emergencyContact} onChangeText={setEmergencyContact} placeholder="98765 43210" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" maxLength={10} /></View>

      <TouchableOpacity style={styles.button} onPress={saveProfile}><Text style={styles.buttonText}>{t("profile.saveContinue")}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 35, paddingTop: 20, paddingBottom: 40 },
    title: { color: colors.text, fontSize: 31, lineHeight: 37, fontWeight: "700", marginTop: 5 },
    photoButton: { width: 108, height: 108, borderRadius: 54, alignSelf: "center", marginTop: 25 }, photo: { width: 108, height: 108, borderRadius: 54 }, photoPlaceholder: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }, cameraBadge: { position: "absolute", right: -3, bottom: 0, width: 37, height: 37, borderRadius: 19, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.background, alignItems: "center", justifyContent: "center" }, photoHint: { textAlign: "center", marginTop: 9, color: colors.textMuted, fontSize: 12 }, photoErrorText: { textAlign: "center", marginTop: 8, color: colors.danger, fontSize: 13 },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 23, marginBottom: 8 }, input: { height: 55, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 15, fontSize: 16, color: colors.text, backgroundColor: colors.background }, errorInput: { borderColor: colors.danger }, errorText: { color: colors.danger, fontSize: 12, marginTop: 5 },
    splitRow: { flexDirection: "row", gap: 17 }, halfField: { flex: 1, position: "relative" }, compactInput: { height: 55, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, compactValue: { color: colors.text, fontSize: 15 }, compactPlaceholder: { color: colors.textFaint, fontSize: 15 }, genderMenu: { position: "absolute", zIndex: 2, top: 89, left: 0, right: 0, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }, genderChoice: { paddingHorizontal: 12, paddingVertical: 10 }, genderChoiceText: { fontSize: 14, color: colors.text },
    contactInput: { height: 55, borderWidth: 1, borderColor: colors.border, borderRadius: 11, flexDirection: "row", alignItems: "center", paddingHorizontal: 15 }, countryCode: { fontSize: 16, color: colors.text, fontWeight: "600", marginRight: 8 }, contactTextInput: { flex: 1, height: "100%", fontSize: 16, color: colors.text },
    button: { height: 59, marginTop: 41, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", shadowColor: colors.primary, shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    datePickerCard: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 20 },
    doneButton: { alignItems: "center", paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
    doneButtonText: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  });
}
