import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { useTheme } from "./theme-context";
import { ThemeColors } from "../lib/theme";

const steps = [
  { source: require("../assets/images/image1.png"), ratio: 570 / 736 },
  { source: require("../assets/images/image2.png"), ratio: 686 / 772 },
  { source: require("../assets/images/image3.png"), ratio: 568 / 782 },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stepHeight = (width - 50) / steps.reduce((sum, s) => sum + s.ratio, 0);

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/welcome");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {steps.map((step, index) => (
          <Image
            key={index}
            source={step.source}
            resizeMode="contain"
            style={{ height: stepHeight, width: stepHeight * step.ratio }}
          />
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 25, justifyContent: "center" },
    stepsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  });
}
