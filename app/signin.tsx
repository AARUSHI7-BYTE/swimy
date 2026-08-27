import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { sendPhoneVerification } from "../firebaseconfig";
import { safeGoBack } from "../lib/navigation";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import TermsModal from "./terms-modal";

export default function SignIn() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canContinue = phoneNumber.replace(/\D/g, "").length === 10 && agreedToTerms && !isSending;

  const sendOtp = async () => {
    const normalizedPhone = phoneNumber.replace(/\D/g, "");

    if (normalizedPhone.length !== 10) {
      setErrorMessage(t("auth.errorInvalidPhone"));
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage(t("auth.errorTerms"));
      return;
    }
    if (Platform.OS === "web") {
      setErrorMessage(t("auth.errorWebUnsupported"));
      return;
    }

    setErrorMessage("");
    setIsSending(true);
    try {
      await sendPhoneVerification(`+91${normalizedPhone}`);
      router.push({ pathname: "/otp", params: { phone: normalizedPhone, mode: "login" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth.errorSendFailed");
      setErrorMessage(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../assets/images/pool.jpg")} style={styles.image} />
      <TouchableOpacity style={styles.backButton} onPress={safeGoBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>{t("auth.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.subtitle")}</Text>

        <Text style={styles.label}>{t("auth.phoneLabel")}</Text>
        <View style={styles.inputBox}>
          <Text style={styles.country}>+91</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} style={styles.countryChevron} />
          <View style={styles.divider} />
          <TextInput
            placeholder="9876543210"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            style={styles.input}
            value={phoneNumber}
            onChangeText={(value) => { setPhoneNumber(value); setErrorMessage(""); }}
            maxLength={10}
          />
        </View>

        <TouchableOpacity
          style={styles.adminLink}
          onPress={() => router.push("/admin-login")}
        >
          <Text style={styles.adminLinkText}>{t("auth.adminLink")}</Text>
        </TouchableOpacity>

        <View style={styles.termsRow}>
          <TouchableOpacity hitSlop={8} onPress={() => setAgreedToTerms(!agreedToTerms)}>
            <Ionicons name={agreedToTerms ? "checkbox" : "square-outline"} size={22} color={agreedToTerms ? colors.primary : colors.textFaint} />
          </TouchableOpacity>
          <Text style={styles.termsText}>
            {t("auth.footerPrefix")}
            <Text style={styles.link} onPress={() => setShowTerms(true)}>{t("auth.terms")}</Text>
            {t("auth.footerSuffix")}
          </Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <TouchableOpacity
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={sendOtp}
          disabled={!canContinue}
        >
          {isSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("common.continue")}</Text>}
        </TouchableOpacity>
      </View>

      <TermsModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        onAccept={() => {
          setAgreedToTerms(true);
          setShowTerms(false);
        }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    image: { width: "100%", height: "42%" },
    backButton: {
      position: "absolute",
      top: 54,
      left: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    card: {
      flex: 1,
      marginTop: -28,
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 28,
      paddingTop: 30,
    },
    title: { fontSize: 30, fontWeight: "700", color: colors.text },
    subtitle: { marginTop: 8, fontSize: 16, color: colors.textMuted },
    label: { marginTop: 32, fontSize: 15, fontWeight: "700", color: colors.text },
    inputBox: {
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.border,
      height: 58,
      borderRadius: 13,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
    },
    country: { fontSize: 16, fontWeight: "700", color: colors.text },
    countryChevron: { marginLeft: 3 },
    divider: { width: 1, height: 24, backgroundColor: colors.border, marginLeft: 14 },
    input: { marginLeft: 14, fontSize: 16, flex: 1, color: colors.text },
    adminLink: { marginTop: 14, alignSelf: "flex-start" },
    adminLinkText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
    termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 22 },
    termsText: { flex: 1, color: colors.textMuted, fontSize: 13.5, lineHeight: 20 },
    link: { color: colors.primary, fontWeight: "600" },
    errorText: { marginTop: 12, color: colors.danger, fontSize: 14 },
    button: { height: 58, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", borderRadius: 13, marginTop: 26 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  });
}
