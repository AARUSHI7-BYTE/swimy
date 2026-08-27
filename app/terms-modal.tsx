import { Ionicons } from "@expo/vector-icons";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemeColors } from "../lib/theme";
import { termsAcknowledgment, termsSections } from "../lib/terms-content";
import { useTheme } from "../context/theme-context";

export default function TermsModal({
  visible,
  onClose,
  onAccept,
}: {
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Terms & Conditions</Text>
            <Text style={styles.subtitle}>Swimy.ai Platform</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {termsSections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.blocks.map((block, index) =>
                block.type === "p" ? (
                  <Text key={index} style={styles.paragraph}>{block.text}</Text>
                ) : (
                  <View key={index} style={styles.list}>
                    {block.items.map((item, itemIndex) => (
                      <View key={itemIndex} style={styles.listRow}>
                        <Text style={styles.bullet}>{"•"}</Text>
                        <Text style={styles.listText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )
              )}
            </View>
          ))}

          <View style={styles.acknowledgment}>
            <Text style={styles.acknowledgmentText}>{termsAcknowledgment}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept} activeOpacity={0.85}>
            <Text style={styles.acceptButtonText}>I've Read the Terms</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 24, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
    section: { marginBottom: 22 },
    sectionHeading: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 10 },
    paragraph: { fontSize: 15, lineHeight: 23, color: colors.textMuted, marginBottom: 8 },
    list: { marginBottom: 8 },
    listRow: { flexDirection: "row", marginBottom: 8, paddingRight: 4 },
    bullet: { fontSize: 15, color: colors.textMuted, marginRight: 10, lineHeight: 23 },
    listText: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.textMuted },
    acknowledgment: {
      borderWidth: 1,
      borderColor: colors.successSoft,
      backgroundColor: colors.successSoft,
      borderRadius: 12,
      padding: 16,
      marginTop: 6,
    },
    acknowledgmentText: { fontSize: 14.5, lineHeight: 21, color: colors.success },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    acceptButton: {
      height: 56,
      backgroundColor: colors.primary,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    acceptButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  });
}
