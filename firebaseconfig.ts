import { getAuth, signInWithPhoneNumber, signOut } from "@react-native-firebase/auth";

// React Native Firebase reads the Android and iOS Firebase configuration from
// google-services.json and GoogleService-Info.plist during the native build.
// The native SDK persists the signed-in session to disk automatically, so a
// user stays logged in across app restarts until signOutUser() is called.
const auth = getAuth();

let confirmationResult: Awaited<ReturnType<typeof signInWithPhoneNumber>> | null = null;

export async function sendPhoneVerification(phoneNumber: string) {
  confirmationResult = await signInWithPhoneNumber(auth, phoneNumber);
}

export async function confirmPhoneVerification(code: string) {
  if (!confirmationResult) {
    throw new Error("Please request a new verification code.");
  }

  const result = await confirmationResult.confirm(code);
  confirmationResult = null;
  return result;
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function signOutUser() {
  await signOut(auth);
}
