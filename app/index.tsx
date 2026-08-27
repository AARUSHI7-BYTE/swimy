import { View, Text, Image, ImageBackground, StyleSheet } from "react-native";
import { useEffect, useMemo } from "react";
import { router } from "expo-router";
import { getCurrentUser } from "../firebaseconfig";
import { useEnsureUserDocumentMutation } from "../lib/queries";
import { getStoredProfile } from "../lib/profile-storage";
import { useAppContext } from "../context/app-context";
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";
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
  const ensureUserDocumentMutation = useEnsureUserDocumentMutation();

  useEffect(() => {
    const timer = setTimeout(async () => {
      const user = getCurrentUser();

      if (!user || !user.phoneNumber) {
        router.replace("/onboarding");
        return;
      }

      try {
        const phoneDigits = user.phoneNumber.replace(/^\+91/, "");
        const userDoc = await ensureUserDocumentMutation.mutateAsync({ uid: user.uid, phoneNumber: user.phoneNumber });
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

        <View style={styles.logoBadge}>
          <Image
            source={require("../assets/images/swim-icon-blue.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>Swimy</Text>

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

    logoBadge:{
      width:160,
      height:160,
      borderRadius:34,
      backgroundColor:"#ffffff",
      justifyContent:"center",
      alignItems:"center",
      shadowColor:"#000",
      shadowOpacity:0.15,
      shadowRadius:12,
      shadowOffset:{ width:0, height:4 },
      elevation:4
    },

    logo:{
      width:108,
      height:81
    },

    title:{
      fontSize:48,
      color:"#ffffff",
      fontWeight:"600",
      marginTop:10
    },

    subtitle:{
      color:"#ffffff",
      fontSize:18
    }
  });
}