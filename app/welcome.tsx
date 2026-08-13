import { useMemo } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { router } from "expo-router";
import { ThemeColors } from "../lib/theme";
import { useLanguage } from "./language-context";
import { useTheme } from "./theme-context";

export default function Welcome() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (

    <View style={styles.container}>

      <Image
        source={require("../assets/images/pool.jpg")}
        style={styles.image}
      />

      <View style={styles.card}>
        <View style={{
          display: 'flex',
          gap: 8
        }}>
          <Text style={styles.heading}>
            {t("welcome.heading")}
          </Text>

          <Text style={styles.desc}>
            {t("welcome.desc")}
          </Text>
        </View>

        <View style={{
          display: 'flex',
          gap: 12
        }}>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/login")}
        >

          <Text style={styles.buttonText}>
            {t("welcome.getStarted")}
          </Text>

        </TouchableOpacity>

        <TouchableOpacity style={styles.login} onPress={() => router.push("/signin")}>

          <Text style={styles.loginText}>
            {t("welcome.login")}
          </Text>

        </TouchableOpacity>
        </View>

      </View>

    </View>

  );

}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({

    container: {
      flex: 1,
      backgroundColor: colors.background
    },

    image: {
      width: "100%",
      height: "55%"
    },

    card: {
      flex: 1,
      padding: 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      marginTop: -30,
      backgroundColor: colors.background
    },

    heading: {
      fontSize: 40,
      fontWeight: "700",
      color: colors.text,
      fontStyle: 'normal',
    },

    desc: {
      fontSize: 20,
      fontWeight: '500',
      color: colors.textMuted
    },

    button: {
      marginTop: 40,
      height: 58,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 12
    },

    buttonText: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "600"
    },

    login: {
      height: 58,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 12
    },

    loginText: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text
    }

  });
}
