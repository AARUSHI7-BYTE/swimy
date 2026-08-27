import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Camera } from "expo-camera";
import * as Notifications from "expo-notifications";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
import { ThemeColors } from "../lib/theme";
import { safeGoBack } from "../lib/navigation";

type PermissionStatus = "pending" | "granted" | "denied";

export default function Permissions() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>("pending");
  const [notificationStatus, setNotificationStatus] = useState<PermissionStatus>("pending");

  async function requestCamera() {
    const permission = await Camera.requestCameraPermissionsAsync();
    setCameraStatus(permission.granted ? "granted" : "denied");
  }

  async function requestNotifications() {
    const permission = await Notifications.requestPermissionsAsync();
    setNotificationStatus(permission.granted ? "granted" : "denied");
  }

  function continueToApp() {
    router.replace("/home");
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <TouchableOpacity style={styles.backButton} onPress={safeGoBack}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <Text style={styles.title}>{t("permissions.title")}</Text>
      <Text style={styles.description}>{t("permissions.description")}</Text>

      <View style={styles.permissionCard}>
        <View style={styles.permissionIconCircle}>
          <Ionicons
            name={cameraStatus === "granted" ? "checkmark" : "camera"}
            size={22}
            color={cameraStatus === "granted" ? colors.success : colors.primary}
          />
        </View>
        <View style={styles.permissionCopy}>
          <Text style={styles.permissionTitle}>{t("permissions.cameraTitle")}</Text>
          <Text style={styles.permissionSubtitle}>
            {cameraStatus === "denied" ? t("permissions.denied") : t("permissions.cameraSubtitle")}
          </Text>
        </View>
        {cameraStatus === "pending" ? (
          <TouchableOpacity style={styles.allowButton} onPress={requestCamera}>
            <Text style={styles.allowButtonText}>{t("common.allow")}</Text>
          </TouchableOpacity>
        ) : (
          <Ionicons
            name={cameraStatus === "granted" ? "checkmark-circle" : "close-circle"}
            size={22}
            color={cameraStatus === "granted" ? colors.success : colors.danger}
          />
        )}
      </View>

      <View style={styles.permissionCard}>
        <View style={styles.permissionIconCircle}>
          <Ionicons
            name={notificationStatus === "granted" ? "checkmark" : "notifications"}
            size={22}
            color={notificationStatus === "granted" ? colors.success : colors.primary}
          />
        </View>
        <View style={styles.permissionCopy}>
          <Text style={styles.permissionTitle}>{t("permissions.notificationsTitle")}</Text>
          <Text style={styles.permissionSubtitle}>
            {notificationStatus === "denied" ? t("permissions.denied") : t("permissions.notificationsSubtitle")}
          </Text>
        </View>
        {notificationStatus === "pending" ? (
          <TouchableOpacity style={styles.allowButton} onPress={requestNotifications}>
            <Text style={styles.allowButtonText}>{t("common.allow")}</Text>
          </TouchableOpacity>
        ) : (
          <Ionicons
            name={notificationStatus === "granted" ? "checkmark-circle" : "close-circle"}
            size={22}
            color={notificationStatus === "granted" ? colors.success : colors.danger}
          />
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={continueToApp}>
        <Text style={styles.buttonText}>{t("common.continue")}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={continueToApp}>
        <Text style={styles.skip}>{t("common.notNow")}</Text>
      </TouchableOpacity>
    </SafeAreaView>
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
    title: { fontSize: 32, fontWeight: "700", color: colors.text, marginTop: 35 },
    description: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: 10 },
    permissionCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
    },
    permissionIconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center" },
    permissionCopy: { marginLeft: 12, flex: 1 },
    permissionTitle: { color: colors.text, fontWeight: "700", fontSize: 16 },
    permissionSubtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 4, lineHeight: 17 },
    allowButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8, marginLeft: 10 },
    allowButtonText: { color: colors.primary, fontSize: 13.5, fontWeight: "700" },
    button: { height: 60, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", borderRadius: 12, marginTop: "auto", marginBottom: 17 },
    buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
    skip: { textAlign: "center", color: colors.textMuted, fontSize: 16 },
  });
}
