import { View, Text, Image, ImageBackground, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
    setGender,
    setDateOfBirth,
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

        // Recognize a returning member from their Firestore profile, not
        // just local AsyncStorage - a fresh install/new device otherwise
        // has no stored profile and would wrongly send an already-enrolled
        // member back into onboarding.
        if (!userDoc.userName) {
          router.replace("/onboarding");
          return;
        }
        const storedProfile = await getStoredProfile(phoneDigits);
        setUserName(userDoc.userName);
        if (userDoc.gender) setGender(userDoc.gender);
        if (userDoc.dateOfBirth) setDateOfBirth(userDoc.dateOfBirth);
        setProfilePhotoUri(storedProfile?.profilePhotoUri ?? null);
        setLocationLabel(storedProfile?.locationLabel ?? "");
        setCoordinates(storedProfile?.coordinates ?? "");
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
      <LinearGradient
        colors={["rgba(44,64,240,0.35)", "rgba(0,30,213,0.88)"]}
        style={styles.overlay}
      >
        <View style={styles.glowOuter} />
        <View style={styles.glowInner} />

        <View style={styles.content}>
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
      </LinearGradient>
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

    glowOuter:{
      position:"absolute",
      width:380,
      height:380,
      borderRadius:190,
      backgroundColor:"#2c40f0",
      opacity:0.18
    },

    glowInner:{
      position:"absolute",
      width:260,
      height:260,
      borderRadius:130,
      backgroundColor:"#2c40f0",
      opacity:0.22
    },

    content:{
      justifyContent:"center",
      alignItems:"center",
      paddingHorizontal:20
    },

    logoBadge:{
      width:160,
      height:160,
      borderRadius:32,
      backgroundColor:"#ffffff",
      justifyContent:"center",
      alignItems:"center",
      marginBottom:24,
      shadowColor:"#000",
      shadowOpacity:0.2,
      shadowRadius:16,
      shadowOffset:{ width:0, height:8 },
      elevation:6
    },

    logo:{
      width:108,
      height:81
    },

    title:{
      fontSize:48,
      lineHeight:56,
      color:"#ffffff",
      fontWeight:"700",
      letterSpacing:-0.5,
      textAlign:"center",
      marginBottom:8,
      textShadowColor:"rgba(0,0,0,0.25)",
      textShadowOffset:{ width:0, height:2 },
      textShadowRadius:6
    },

    subtitle:{
      color:"#eef0ff",
      fontSize:18,
      fontWeight:"500",
      letterSpacing:0.3,
      textAlign:"center"
    }
  });
}