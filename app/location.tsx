import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { useAppContext } from "./app-context";
import { useLanguage } from "./language-context";
import { useTheme } from "./theme-context";
import { ThemeColors } from "../lib/theme";
import { saveStoredProfile } from "../lib/profile-storage";
import { safeGoBack } from "../lib/navigation";

type LocationState = "idle" | "loading" | "success" | "denied" | "error";

export default function EnableLocation() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isSignup } = useLocalSearchParams<{ isSignup?: string }>();
  const [status, setStatus] = useState<LocationState>("idle");
  const [place, setPlace] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const { userName, phoneNumber, profilePhotoUri, setCoordinates: saveCoordinates, setLocationLabel } = useAppContext();
  const nextRoute = isSignup === "1" ? ("/permissions" as const) : ("/pools" as const);

  async function enableLocation() {
    setStatus("loading");

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus("denied");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = location.coords;
      setCoordinates(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);

      try {
        const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
        const address = addresses[0];
        const shortParts = [
          address?.district || address?.subregion || address?.street,
          address?.city || address?.region,
        ]
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index);
        setPlace(shortParts.join(", ") || address?.name || t("location.defaultPlace"));
      } catch {
        setPlace(t("location.defaultPlace"));
      }
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const isResolved = status === "success";

  function continueToPools() {
    setLocationLabel(place);
    saveCoordinates(coordinates);
    if (phoneNumber) {
      saveStoredProfile(phoneNumber, { userName, profilePhotoUri, locationLabel: place, coordinates });
    }
    router.replace(nextRoute);
  }

  function skipLocation() {
    if (phoneNumber) {
      saveStoredProfile(phoneNumber, { userName, profilePhotoUri, locationLabel: "", coordinates: "" });
    }
    router.replace(nextRoute);
  }
  const message =
    status === "denied"
      ? t("location.descDenied")
      : status === "error"
        ? t("location.descError")
        : t("location.descDefault");

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={safeGoBack}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={[styles.locationCircle, isResolved && styles.locationCircleSuccess]}>
        <Ionicons
          name={isResolved ? "checkmark" : "location"}
          size={50}
          color={isResolved ? colors.success : colors.primary}
        />
      </View>

      <Text style={styles.title}>{isResolved ? t("location.titleFound") : t("location.title")}</Text>
      <Text style={styles.description}>{isResolved ? t("location.descFound") : message}</Text>

      {isResolved && (
        <View style={styles.locationCard}>
          <View style={styles.pinCircle}>
            <Ionicons name="location" size={20} color={colors.primary} />
          </View>
          <View style={styles.locationText}>
            <Text style={styles.locationLabel}>{t("location.currentLocationLabel")}</Text>
            <Text style={styles.locationName}>{place}</Text>
            <Text style={styles.coordinates}>{coordinates}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, status === "loading" && styles.buttonDisabled]}
        onPress={isResolved ? continueToPools : enableLocation}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isResolved ? t("common.continue") : t("location.enableButton")}</Text>
        )}
      </TouchableOpacity>

      {!isResolved && (
        <TouchableOpacity onPress={skipLocation} disabled={status === "loading"}>
          <Text style={styles.skip}>{t("common.notNow")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 25, paddingTop: 70 },
    backButton: {
      width: 42,
      height: 42,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    locationCircle: {
      width: 136,
      height: 136,
      borderRadius: 68,
      backgroundColor: colors.primarySoft,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginTop: 88,
    },
    locationCircleSuccess: { backgroundColor: colors.successSoft },
    title: { fontSize: 32, fontWeight: "700", color: colors.text, textAlign: "center", marginTop: 35 },
    description: { color: colors.textMuted, fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 14, paddingHorizontal: 12 },
    locationCard: {
      borderWidth: 1,
      borderColor: colors.primarySoft,
      backgroundColor: colors.primarySoft,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 35,
    },
    pinCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center" },
    locationText: { marginLeft: 12, flex: 1 },
    locationLabel: { color: colors.textMuted, fontWeight: "700", fontSize: 11, letterSpacing: 0.7 },
    locationName: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: 3 },
    coordinates: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    button: { height: 60, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", borderRadius: 12, marginTop: "auto", marginBottom: 17 },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
    skip: { textAlign: "center", color: colors.textMuted, fontSize: 16 },
  });
}
