import {
  ActivityIndicator,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { confirmPhoneVerification, sendPhoneVerification, signOutUser } from "../../firebaseconfig";
import { useAppContext } from "../../context/app-context";
import { getStoredProfile } from "../../lib/profile-storage";
import { useEnsureUserDocumentMutation } from "../../lib/queries";
import { useLanguage } from "../../context/language-context";
import { useTheme } from "../../context/theme-context";
import { ThemeColors } from "../../lib/theme";

const OTP_LENGTH = 6;

export default function Otp() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { phone, mode } = useLocalSearchParams<{ phone?: string; mode?: string }>();
  const phoneNumber = phone ?? "";
  const isAdminMode = mode === "admin";
  const {
    setPhoneNumber,
    setUserName,
    setProfilePhotoUri,
    setLocationLabel,
    setCoordinates,
    setUid,
    setRole,
    setPoolIds,
  } = useAppContext();
  const [code, setCode] = useState(Array(OTP_LENGTH).fill(""));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const inputs = useRef<(TextInput | null)[]>([]);
  const ensureUserDocumentMutation = useEnsureUserDocumentMutation();

  useEffect(() => {
    if (!phoneNumber) {
      router.replace(isAdminMode ? "/admin-login" : "/signin");
    }
  }, [phoneNumber, isAdminMode]);

  const updateCode = (value: string, index: number) => {
    const digits = value.replace(/\D/g, "");
    const nextCode = [...code];
    setErrorMessage("");

    if (digits.length > 1) {
      digits.slice(0, OTP_LENGTH - index).split("").forEach((digit, offset) => {
        nextCode[index + offset] = digit;
      });
      setCode(nextCode);
      inputs.current[Math.min(index + digits.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    nextCode[index] = digits;
    setCode(nextCode);
    if (digits && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (event.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const verifyCode = async () => {
    const enteredCode = code.join("");
    if (enteredCode.length !== OTP_LENGTH) {
      setErrorMessage(t("otp.errorIncompleteCode"));
      return;
    }

    setErrorMessage("");
    setInfoMessage("");
    setIsVerifying(true);
    let result;
    try {
      result = await confirmPhoneVerification(enteredCode);
    } catch (error) {
      console.error("OTP confirmation failed", error);
      setErrorMessage(t("otp.errorWrongCode"));
      setIsVerifying(false);
      return;
    }

    try {
      const uid = result.user.uid;
      const userDoc = await ensureUserDocumentMutation.mutateAsync({ uid, phoneNumber: `+91${phoneNumber}` });
      setUid(uid);
      setRole(userDoc.role);
      setPoolIds(userDoc.poolIds);

      if (isAdminMode) {
        if (userDoc.role !== "admin" && userDoc.role !== "facility") {
          setErrorMessage(t("otp.errorAdminNotRegistered"));
          return;
        }
        setPhoneNumber(phoneNumber);
        router.replace(userDoc.role === "admin" ? "/admin-dashboard" : "/facility-home");
        return;
      }

      // An account is either a regular member or admin/facility staff, never
      // both - staff numbers must use Admin/Staff Login, not the consumer flow.
      // Sign out and clear the elevated role/poolIds we just set above so no
      // staff-level state lingers in the app for a session we're rejecting.
      if (userDoc.role === "admin" || userDoc.role === "facility") {
        await signOutUser();
        setUid("");
        setRole("user");
        setPoolIds([]);
        setErrorMessage(t("otp.errorStaffAccount"));
        return;
      }

      // Existing users (a profile was already completed on this device) go
      // straight back in; new numbers are routed into onboarding.
      const storedProfile = await getStoredProfile(phoneNumber);
      setPhoneNumber(phoneNumber);
      if (storedProfile) {
        setUserName(storedProfile.userName);
        setProfilePhotoUri(storedProfile.profilePhotoUri);
        setLocationLabel(storedProfile.locationLabel);
        setCoordinates(storedProfile.coordinates);
        router.replace("/location");
        return;
      }

      router.replace("/profile");
    } catch (error) {
      console.error("Failed to load user profile after OTP verification", error);
      const detail = error instanceof Error ? error.message : String(error);
      setErrorMessage(t("otp.errorProfileLoad", { detail }));
    } finally {
      setIsVerifying(false);
    }
  };

  const resendCode = async () => {
    setErrorMessage("");
    setInfoMessage("");
    setIsResending(true);
    try {
      await sendPhoneVerification(`+91${phoneNumber}`);
      setCode(Array(OTP_LENGTH).fill(""));
      inputs.current[0]?.focus();
      setInfoMessage(t("otp.infoResent"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("otp.errorResendFailed");
      setErrorMessage(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerBackVisible: !isVerifying }} />

      <View style={styles.iconCircle}>
        <Text style={styles.icon}>✦</Text>
      </View>

      <Text style={styles.title}>{t("otp.title")}</Text>
      <Text style={styles.subtitle}>
        {t("otp.subtitle", { phone: phoneNumber })}
      </Text>

      <View style={styles.otpRow}>
        {code.map((digit, index) => (
          <TextInput
            key={index}
            ref={(input) => { inputs.current[index] = input; }}
            style={styles.otpInput}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            textAlign="center"
            value={digit}
            onChangeText={(value) => updateCode(value, index)}
            onKeyPress={(event) => handleKeyPress(event, index)}
            editable={!isVerifying}
            autoComplete={index === 0 ? "sms-otp" : "off"}
            textContentType="oneTimeCode"
          />
        ))}
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {!errorMessage && infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

      <TouchableOpacity style={[styles.button, isVerifying && styles.buttonDisabled]} onPress={verifyCode} disabled={isVerifying}>
        {isVerifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("otp.verifyContinue")}</Text>}
      </TouchableOpacity>

      <Text style={styles.resendText}>
        {t("otp.resendPrompt")}
        <Text style={styles.resend} onPress={isResending || isVerifying ? undefined : resendCode}>
          {isResending ? t("otp.sending") : t("otp.resend")}
        </Text>
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 25, paddingTop: 20 },
    iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center", marginTop: 24 },
    icon: { fontSize: 31, color: colors.primary },
    title: { fontSize: 32, fontWeight: "700", marginTop: 24, color: colors.text },
    subtitle: { marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.textMuted },
    otpRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 42 },
    otpInput: { width: 48, height: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 12, fontSize: 22, fontWeight: "600", color: colors.text },
    errorText: { marginTop: 16, color: colors.danger, fontSize: 14, textAlign: "center" },
    infoText: { marginTop: 16, color: colors.primary, fontSize: 14, textAlign: "center" },
    button: { height: 60, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", borderRadius: 12, marginTop: 42 },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
    resendText: { textAlign: "center", color: colors.textMuted, fontSize: 15, marginTop: 25 },
    resend: { color: colors.primary, fontWeight: "600" },
  });
}
