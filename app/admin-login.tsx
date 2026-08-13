import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { sendPhoneVerification } from "../firebaseconfig";
import { safeGoBack } from "../lib/navigation";

export default function AdminLogin() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedPhone = phoneNumber.replace(/\D/g, "");
  const canContinue = normalizedPhone.length === 10 && !isSubmitting;

  const handleLogin = async () => {
    if (normalizedPhone.length !== 10) {
      setErrorMessage("Please enter your 10-digit mobile number.");
      return;
    }
    if (Platform.OS === "web") {
      setErrorMessage("Phone verification is available in the iOS or Android development build.");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await sendPhoneVerification(`+91${normalizedPhone}`);
      router.push({ pathname: "/otp", params: { phone: normalizedPhone, mode: "admin" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send a verification code. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../assets/images/pool.jpg")} style={styles.image} />
      <TouchableOpacity style={styles.backButton} onPress={safeGoBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color="#151515" />
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark-outline" size={34} color="#2457FF" />
        </View>

        <Text style={styles.title}>Admin / Facility Login</Text>
        <Text style={styles.subtitle}>Access your dashboard</Text>

        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.inputBox}>
          <Ionicons name="phone-portrait-outline" size={20} color="#2457FF" />
          <View style={styles.countryBox}>
            <Text style={styles.countryText}>+91</Text>
            <Ionicons name="chevron-down" size={16} color="#8a90a0" />
          </View>
          <View style={styles.divider} />
          <TextInput
            placeholder="Enter your mobile number"
            placeholderTextColor="#a7aab3"
            keyboardType="phone-pad"
            style={styles.input}
            value={phoneNumber}
            onChangeText={(value) => { setPhoneNumber(value); setErrorMessage(""); }}
            maxLength={10}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <TouchableOpacity
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={!canContinue}
        >
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  image: { width: "100%", height: "42%" },
  backButton: {
    position: "absolute",
    top: 54,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
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
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 34,
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eaf0ff",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 26, fontWeight: "700", color: "#111111", marginTop: 20, textAlign: "center" },
  subtitle: { marginTop: 6, fontSize: 15, color: "#7d8390", textAlign: "center" },
  label: { alignSelf: "flex-start", marginTop: 28, fontSize: 15, fontWeight: "700", color: "#111111" },
  inputBox: {
    width: "100%",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e4e5e9",
    height: 58,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  countryBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  countryText: { fontSize: 16, fontWeight: "600", color: "#1c1d21" },
  divider: { width: 1, height: 26, backgroundColor: "#e4e5e9" },
  input: { flex: 1, fontSize: 16, color: "#1c1d21" },
  errorText: { alignSelf: "flex-start", marginTop: 12, color: "#df4545", fontSize: 14 },
  button: {
    width: "100%",
    height: 58,
    backgroundColor: "#2457FF",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 13,
    marginTop: 30,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
