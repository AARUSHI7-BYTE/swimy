import { create } from "zustand";
import { UserRole } from "../lib/firestore";

export type Member = {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
};

type AppState = {
  userName: string;
  setUserName: (name: string) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  phoneNumber: string;
  setPhoneNumber: (phoneNumber: string) => void;
  gender: string;
  setGender: (gender: string) => void;
  dateOfBirth: string;
  setDateOfBirth: (dateOfBirth: string) => void;
  profilePhotoUri: string | null;
  setProfilePhotoUri: (uri: string | null) => void;
  locationLabel: string;
  setLocationLabel: (location: string) => void;
  coordinates: string;
  setCoordinates: (coordinates: string) => void;
  members: Member[];
  addMember: (member: Omit<Member, "id">) => void;
  uid: string;
  setUid: (uid: string) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  poolIds: string[];
  setPoolIds: (poolIds: string[]) => void;
  selectedPoolId: string | null;
  setSelectedPoolId: (poolId: string | null) => void;
  // Tracks which entry/exit confirmation popup on the Home screen the
  // swimmer has already dismissed. Kept here (not component state) because
  // the bottom nav uses router.replace("/home") to switch tabs, which
  // remounts Home and would otherwise wipe a local dismissal and re-show
  // the popup for a still-open entry every time the swimmer leaves and
  // returns to Home.
  dismissedEntryKey: string | null;
  setDismissedEntryKey: (key: string | null) => void;
  resetSession: () => void;
};

export const useAppContext = create<AppState>((set) => ({
  userName: "",
  setUserName: (userName) => set({ userName }),
  email: "",
  setEmail: (email) => set({ email }),
  password: "",
  setPassword: (password) => set({ password }),
  phoneNumber: "",
  setPhoneNumber: (phoneNumber) => set({ phoneNumber }),
  gender: "",
  setGender: (gender) => set({ gender }),
  dateOfBirth: "",
  setDateOfBirth: (dateOfBirth) => set({ dateOfBirth }),
  profilePhotoUri: null,
  setProfilePhotoUri: (profilePhotoUri) => set({ profilePhotoUri }),
  locationLabel: "",
  setLocationLabel: (locationLabel) => set({ locationLabel }),
  coordinates: "",
  setCoordinates: (coordinates) => set({ coordinates }),
  members: [],
  addMember: (member) =>
    set((state) => ({
      members: [...state.members, { ...member, id: `${Date.now()}-${Math.random()}` }],
    })),
  uid: "",
  setUid: (uid) => set({ uid }),
  role: "user",
  setRole: (role) => set({ role }),
  poolIds: [],
  setPoolIds: (poolIds) => set({ poolIds }),
  selectedPoolId: null,
  setSelectedPoolId: (selectedPoolId) => set({ selectedPoolId }),
  dismissedEntryKey: null,
  setDismissedEntryKey: (dismissedEntryKey) => set({ dismissedEntryKey }),
  resetSession: () =>
    set({
      userName: "",
      email: "",
      password: "",
      phoneNumber: "",
      gender: "",
      dateOfBirth: "",
      profilePhotoUri: null,
      locationLabel: "",
      coordinates: "",
      members: [],
      uid: "",
      role: "user",
      poolIds: [],
      selectedPoolId: null,
      dismissedEntryKey: null,
    }),
}));
