import { View, Text, ImageBackground, Image, StyleSheet } from "react-native";
import { useEffect, useMemo } from "react";
import { router } from "expo-router";
import { getCurrentUser } from "../firebaseconfig";
import { ensureUserDocument } from "../lib/firestore";
import { getStoredProfile } from "../lib/profile-storage";
import { useAppContext } from "./app-context";
import { useLanguage } from "./language-context";
import { useTheme } from "./theme-context";
import { ThemeColors } from "../lib/theme";

export default function SplashScreen() {
  const {
    setUid,
    setRole,
    setPoolIds,
    setPhoneNumber,
    setUserName,
    setProfilePhotoUri,
    setLocationLabel,
    setCoordinates,
  } = useAppContext();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const user = getCurrentUser();

      if (!user || !user.phoneNumber) {
        router.replace("/onboarding");
        return;
      }

      try {
        const phoneDigits = user.phoneNumber.replace(/^\+91/, "");
        const userDoc = await ensureUserDocument(user.uid, user.phoneNumber);
        setUid(user.uid);
        setRole(userDoc.role);
        setPoolIds(userDoc.poolIds);
        setPhoneNumber(phoneDigits);

        if (userDoc.role === "admin") {
          router.replace("/admin-dashboard");
          return;
        }
        if (userDoc.role === "facility") {
          router.replace("/facility-home");
          return;
        }

        const storedProfile = await getStoredProfile(phoneDigits);
        if (!storedProfile) {
          router.replace("/onboarding");
          return;
        }
        setUserName(storedProfile.userName);
        setProfilePhotoUri(storedProfile.profilePhotoUri);
        setLocationLabel(storedProfile.locationLabel);
        setCoordinates(storedProfile.coordinates);
        router.replace("/home");
      } catch (error) {
        console.error("Failed to restore session", error);
        router.replace("/onboarding");
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ImageBackground
      source={require("../assets/images/splash-bg.jpg")}
      style={styles.container}
    >
      <View style={styles.overlay}>

        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
        />

        <Text style={styles.title}>swimy</Text>

        <Text style={styles.subtitle}>
          {t("splash.tagline")}
        </Text>

      </View>
    </ImageBackground>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container:{
      flex:1
    },

    overlay:{
      flex:1,
      justifyContent:"center",
      alignItems:"center"
    },

    logo:{
      width:90,
      height:90,
      resizeMode:"contain"
    },

    title:{
      fontSize:52,
      color:"#fff",
      fontWeight:"700",
      marginTop:10
    },

    subtitle:{
      color:"#fff",
      fontSize:18
    }
  });
}