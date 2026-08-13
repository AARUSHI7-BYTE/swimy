import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMemo, useState } from "react";
import { useAppContext } from "./app-context";
import { useLanguage } from "./language-context";
import { useTheme } from "./theme-context";
import { ThemeColors } from "../lib/theme";
import { safeGoBack } from "../lib/navigation";

export default function AddMember() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const relationships = [t("member.relationshipChild"), t("member.relationshipPartner"), t("member.relationshipParent"), t("common.other")];
  const genders = [t("common.female"), t("common.male"), t("common.other")];
  const { addMember } = useAppContext();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState(relationships[0]);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState(genders[0]);
  const [phone, setPhone] = useState("");
  const [showNameError, setShowNameError] = useState(false);

  function saveMember() {
    if (!name.trim()) {
      setShowNameError(true);
      return;
    }
    addMember({ name: name.trim(), relationship, dateOfBirth, gender, phone });
    safeGoBack();
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
      <TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder={t("member.dobPlaceholderSlash")} placeholderTextColor={colors.textFaint} keyboardType="number-pad" maxLength={10} />

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
    label: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 27 }, optional: { color: colors.textFaint, fontWeight: "400" },
    input: { height: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 11, paddingHorizontal: 17, fontSize: 16, color: colors.text }, inputError: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12, marginTop: 6 },
    options: { flexDirection: "row", gap: 8, marginTop: 11 }, option: { flex: 1, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: "center", justifyContent: "center" }, selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, optionText: { color: colors.textMuted, fontSize: 13, fontWeight: "500" }, selectedText: { color: colors.primary, fontWeight: "700" },
    phoneInput: { height: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 11, paddingHorizontal: 17, flexDirection: "row", alignItems: "center" }, country: { color: colors.text, fontSize: 16, fontWeight: "600" }, phoneNumber: { flex: 1, marginLeft: 13, fontSize: 16, color: colors.text },
    button: { height: 60, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 40 }, buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  });
}
