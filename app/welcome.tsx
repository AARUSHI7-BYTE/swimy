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
import { useLanguage } from "../context/language-context";
import { useTheme } from "../context/theme-context";

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
        <View style={styles.copy}>
          <Text style={styles.heading}>
            {t("welcome.heading")}
          </Text>

          <Text style={styles.desc}>
            {t("welcome.desc")}
          </Text>
        </View>

        <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={() => router.push("/signin")}>
          <Text style={styles.buttonText}>
            {t("welcome.login")}
          </Text>
        </TouchableOpacity>
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
      height: "62%"
    },

    card: {
      flex: 1,
      paddingHorizontal: 28,
      paddingTop: 40,
      paddingBottom: 44,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      marginTop: -32,
      backgroundColor: colors.background,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -6 },
      elevation: 6
    },

    copy: {
      gap: 8
    },

    heading: {
      fontSize: 36,
      lineHeight: 42,
      fontWeight: "700",
      color: colors.text
    },

    desc: {
      fontSize: 16,
      lineHeight: 23,
      fontWeight: '500',
      color: colors.textMuted
    },

    button: {
      marginTop: 36,
      height: 58,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 14,
      shadowColor: colors.primary,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3
    },

    buttonText: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "600"
    }

  });
}
