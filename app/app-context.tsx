import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { UserRole } from "../lib/firestore";

export type Member = {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
};

type AppContextValue = {
  userName: string;
  setUserName: (name: string) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  phoneNumber: string;
  setPhoneNumber: (phoneNumber: string) => void;
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
  resetSession: () => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [uid, setUid] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [poolIds, setPoolIds] = useState<string[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      userName,
      setUserName,
      email,
      setEmail,
      password,
      setPassword,
      phoneNumber,
      setPhoneNumber,
      profilePhotoUri,
      setProfilePhotoUri,
      locationLabel,
      setLocationLabel,
      coordinates,
      setCoordinates,
      members,
      addMember: (member: Omit<Member, "id">) =>
        setMembers((currentMembers) => [
          ...currentMembers,
          { ...member, id: `${Date.now()}-${Math.random()}` },
        ]),
      uid,
      setUid,
      role,
      setRole,
      poolIds,
      setPoolIds,
      selectedPoolId,
      setSelectedPoolId,
      resetSession: () => {
        setUserName("");
        setEmail("");
        setPassword("");
        setPhoneNumber("");
        setProfilePhotoUri(null);
        setLocationLabel("");
        setCoordinates("");
        setMembers([]);
        setUid("");
        setRole("user");
        setPoolIds([]);
        setSelectedPoolId(null);
      },
    }),
    [userName, email, password, phoneNumber, profilePhotoUri, locationLabel, coordinates, members, uid, role, poolIds, selectedPoolId]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
