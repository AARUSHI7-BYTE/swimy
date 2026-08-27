import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMemo, useState } from "react";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import { safeGoBack } from "../lib/navigation";
import { useLatestEntryQuery } from "../lib/queries";

const MIN_AGE = 0;
const MAX_AGE = 100;

function today() {
  return new Date();
}

function yearsAgo(years: number) {
  const date = today();
  date.setFullYear(date.getFullYear() - years);
  return date;
}

function formatDob(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

export default function AddMember() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const relationships = [t("member.relationshipChild"), t("member.relationshipPartner"), t("member.relationshipParent"), t("common.other")];
  const genders = [t("common.female"), t("common.male"), t("common.other")];
  const { addMember, selectedPoolId, uid } = useAppContext();
  // Someone who navigates straight to this screen (deep link, back-forward)
  // while already checked in shouldn't be able to sneak a new member into an
  // in-progress visit - home.tsx only hides the "Add" button, it doesn't stop
  // direct navigation here.
  const { data: latestEntry = null } = useLatestEntryQuery(selectedPoolId, uid);
  const hasActiveEntry = !!latestEntry && !latestEntry.exitedAt;
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState(relationships[0]);
  const [dob, setDob] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState(genders[0]);
  const [phone, setPhone] = useState("");
  const [showNameError, setShowNameError] = useState(false);

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) setDob(selectedDate);
      return;
    }
    // iOS spinner reports every scroll tick and stays open until dismissed
    // with the Done button below, rather than closing on the first change.
    if (selectedDate) setDob(selectedDate);
  }

  function saveMember() {
    const dateOfBirth = dob ? formatDob(dob) : "";
    if (!name.trim()) {
      setShowNameError(true);
      return;
    }
    addMember({ name: name.trim(), relationship, dateOfBirth, gender, phone });
    safeGoBack();
  }

  if (hasActiveEntry) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={safeGoBack}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>{t("member.title")}</Text>
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textFaint} />
          <Text style={styles.lockedText}>{t("home.membersLocked")}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.backButton} onPress={safeGoBack}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>
      <Text style={styles.title}>{t("member.title")}</Text>
      <Text style={styles.subtitle}>{t("member.subtitle")}</Text>

      <Text style={styles.label}>{t("profile.fullNameLabel")}</Text>
      <TextInput style={[styles.input, showNameError && styles.inputError]} value={name} onChangeText={(value) => { setName(value); setShowNameError(false); }} placeholder={t("profile.fullNamePlaceholder")} placeholderTextColor={colors.textFaint} autoCapitalize="words" />
      {showNameError && <Text style={styles.error}>{t("member.nameError")}</Text>}

      <Text style={styles.label}>{t("member.relationshipLabel")}</Text>
      <View style={styles.options}>{relationships.map((option) => <TouchableOpacity key={option} style={[styles.option, relationship === option && styles.selected]} onPress={() => setRelationship(option)}><Text style={[styles.optionText, relationship === option && styles.selectedText]}>{option}</Text></TouchableOpacity>)}</View>

      <Text style={styles.label}>{t("profile.dobLabel")}</Text>
      <TouchableOpacity style={styles.dobInput} onPress={() => setShowDatePicker(true)}>
        <Text style={dob ? styles.dobValue : styles.dobPlaceholder}>{dob ? formatDob(dob) : t("member.dobPlaceholderSlash")}</Text>
        <Ionicons name="calendar-outline" size={19} color={colors.textMuted} />
      </TouchableOpacity>
      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={dob ?? yearsAgo(MIN_AGE)}
          mode="date"
          display="default"
          minimumDate={yearsAgo(MAX_AGE)}
          maximumDate={today()}
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
                maximumDate={today()}
                onChange={handleDateChange}
              />
              <TouchableOpacity style={styles.doneButton} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.doneButtonText}>{t("common.done")}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <Text style={styles.label}>{t("profile.genderLabel")}</Text>
      <View style={styles.options}>{genders.map((option) => <TouchableOpacity key={option} style={[styles.option, gender === option && styles.selected]} onPress={() => setGender(option)}><Text style={[styles.optionText, gender === option && styles.selectedText]}>{option}</Text></TouchableOpacity>)}</View>

      <Text style={styles.label}>{t("member.phoneLabel")} <Text style={styles.optional}>{t("member.optional")}</Text></Text>
      <View style={styles.phoneInput}><Text style={styles.country}>+91</Text><TextInput style={styles.phoneNumber} value={phone} onChangeText={setPhone} placeholder={t("member.phonePlaceholder")} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" maxLength={10} /></View>

      <TouchableOpacity style={styles.button} onPress={saveMember}><Text style={styles.buttonText}>{t("member.saveMember")}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background }, content: { padding: 25, paddingTop: 70, paddingBottom: 40 },
    backButton: { width: 42, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 21, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 32, fontWeight: "700", marginTop: 43 }, subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 12 },
    lockedBox: { alignItems: "center", marginTop: 70, paddingHorizontal: 20, gap: 14 },
    lockedText: { color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22 },
    label: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 27 }, optional: { color: colors.textFaint, fontWeight: "400" },
    input: { height: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 11, paddingHorizontal: 17, fontSize: 16, color: colors.text }, inputError: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12, marginTop: 6 },
    dobInput: { height: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 11, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, dobValue: { color: colors.text, fontSize: 16 }, dobPlaceholder: { color: colors.textFaint, fontSize: 16 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    datePickerCard: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 20 },
    doneButton: { alignItems: "center", paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
    doneButtonText: { color: colors.primary, fontSize: 16, fontWeight: "700" },
    options: { flexDirection: "row", gap: 8, marginTop: 11 }, option: { flex: 1, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: "center", justifyContent: "center" }, selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, optionText: { color: colors.textMuted, fontSize: 13, fontWeight: "500" }, selectedText: { color: colors.primary, fontWeight: "700" },
    phoneInput: { height: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 11, paddingHorizontal: 17, flexDirection: "row", alignItems: "center" }, country: { color: colors.text, fontSize: 16, fontWeight: "600" }, phoneNumber: { flex: 1, marginLeft: 13, fontSize: 16, color: colors.text },
    button: { height: 60, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 40 }, buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  });
}
