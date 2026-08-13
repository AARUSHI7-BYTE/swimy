import {
View,
Text,
StyleSheet,
TextInput,
TouchableOpacity,
ActivityIndicator,
Platform
} from "react-native";

import { useMemo, useState } from "react";
import { router } from "expo-router";
import { sendPhoneVerification } from "../../firebaseconfig";
import { useLanguage } from "../language-context";
import { useTheme } from "../theme-context";
import { ThemeColors } from "../../lib/theme";

export default function Login(){
const { colors } = useTheme();
const { t } = useLanguage();
const styles = useMemo(() => createStyles(colors), [colors]);
const [phoneNumber, setPhoneNumber] = useState("");
const [isSending, setIsSending] = useState(false);
const [errorMessage, setErrorMessage] = useState("");

const sendOtp = async () => {
  const normalizedPhone = phoneNumber.replace(/\D/g, "");

  if (normalizedPhone.length !== 10) {
    setErrorMessage(t("auth.errorInvalidPhone"));
    return;
  }

  if (Platform.OS === "web") {
    setErrorMessage(t("auth.errorWebUnsupported"));
    return;
  }

  setErrorMessage("");
  setIsSending(true);
  try {
    await sendPhoneVerification(`+91${normalizedPhone}`);
    router.push({ pathname: "/otp", params: { phone: normalizedPhone, mode: "signup" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : t("auth.errorSendFailed");
    setErrorMessage(message);
  } finally {
    setIsSending(false);
  }
};

return(

<View style={styles.container}>

<Text style={styles.title}>
{t("auth.title")}
</Text>

<Text style={styles.subtitle}>
{t("auth.subtitle")}
</Text>

<Text style={styles.label}>
{t("auth.phoneLabel")}
</Text>

<View style={styles.inputBox}>

<Text style={styles.country}>
+91
</Text>

<TextInput

placeholder="9876543210"
placeholderTextColor={colors.textFaint}
keyboardType="phone-pad"
style={styles.input}
value={phoneNumber}
onChangeText={(value) => { setPhoneNumber(value); setErrorMessage(""); }}
maxLength={10}

/>

</View>

{errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

<TouchableOpacity
style={[styles.button, isSending && styles.buttonDisabled]}
onPress={sendOtp}
disabled={isSending}
>

{isSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("common.continue")}</Text>}

</TouchableOpacity>

<Text style={styles.footer}>
{t("auth.footerPrefix")}
<Text style={{color: colors.primary}}>
{t("auth.terms")}
</Text>
{t("auth.and")}
<Text style={{color: colors.primary}}>
{t("auth.privacy")}
</Text>

</Text>

</View>

);

}

function createStyles(colors: ThemeColors) {
return StyleSheet.create({

container:{
flex:1,
padding:25,
paddingTop:100,
backgroundColor:colors.background
},

title:{
fontSize:34,
fontWeight:"700",
color:colors.text
},

subtitle:{
fontSize:18,
marginTop:10,
color:colors.textMuted
},

label:{
marginTop:40,
fontSize:16,
fontWeight:"600",
color:colors.text
},

inputBox:{
marginTop:12,
borderWidth:1,
borderColor:colors.border,
height:60,
borderRadius:12,
flexDirection:"row",
alignItems:"center",
paddingHorizontal:18
},

country:{
fontSize:18,
fontWeight:"600",
color:colors.text
},

input:{
marginLeft:15,
fontSize:18,
flex:1,
color:colors.text
},

errorText:{
marginTop:10,
color:colors.danger,
fontSize:14
},

button:{
height:60,
backgroundColor:colors.primary,
justifyContent:"center",
alignItems:"center",
borderRadius:12,
marginTop:40
},

buttonText:{
color:"#fff",
fontSize:18,
fontWeight:"600"
},

buttonDisabled:{
opacity:0.7
},

footer:{
marginTop:80,
textAlign:"center",
color:colors.textMuted,
lineHeight:25
}

});
}
