import { getAuth, onAuthStateChanged, signInWithPhoneNumber, signOut } from "@react-native-firebase/auth";

// React Native Firebase reads the Android and iOS Firebase configuration from
// google-services.json and GoogleService-Info.plist during the native build.
// The native SDK persists the signed-in session to disk automatically, so a
// user stays logged in across app restarts until signOutUser() is called.
const auth = getAuth();

// The native auth session can take a moment to (re)attach after cold start
// or after the app resumes from background - firing a Firestore read whose
// rules require request.auth != null before that finishes fails with
// permission-denied even though the app's own local state (uid/phone in
// context) is already populated. Callers that gate a query on this can wait
// for a confirmed session instead of racing it.
export function subscribeAuthUser(callback: (uid: string | null) => void) {
  return onAuthStateChanged(auth, (user) => callback(user ? user.uid : null));
}

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
