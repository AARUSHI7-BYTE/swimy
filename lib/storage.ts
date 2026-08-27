import { deleteObject, getDownloadURL, getStorage, putFile, ref } from "@react-native-firebase/storage";

const storage = getStorage();

// Uploads a locally picked image (from expo-image-picker) to
// pools/{poolId}/cover.jpg and returns its public download URL.
export async function uploadPoolImage(poolId: string, localUri: string): Promise<string> {
  const imageRef = ref(storage, `pools/${poolId}/cover.jpg`);
  await putFile(imageRef, localUri);
  return getDownloadURL(imageRef);
}

// Uploads a member's sign-up photo, captured by facility staff during
// membership enrollment, to pools/{poolId}/members/{phone}/{index}.jpg.
export async function uploadMemberPhoto(poolId: string, phone: string, index: number, localUri: string): Promise<string> {
  const photoRef = ref(storage, `pools/${poolId}/members/${phone || "offline"}/${index}-${Date.now()}.jpg`);
  await putFile(photoRef, localUri);
  return getDownloadURL(photoRef);
}

// Uploads one photo for the facility-editable pool profile gallery, to
// pools/{poolId}/profile/{index}-{timestamp}.jpg.
export async function uploadPoolPhoto(poolId: string, index: number, localUri: string): Promise<string> {
  const photoRef = ref(storage, `pools/${poolId}/profile/${index}-${Date.now()}.jpg`);
  await putFile(photoRef, localUri);
  return getDownloadURL(photoRef);
}

// Uploads a swimmer's profile photo to users/{uid}/photo.jpg and returns its
// public download URL, so facility staff can see it on the entry scan pop-up.
export async function uploadUserPhoto(uid: string, localUri: string): Promise<string> {
  const photoRef = ref(storage, `users/${uid}/photo.jpg`);
  await putFile(photoRef, localUri);
  return getDownloadURL(photoRef);
}

// Best-effort cleanup of a pool's cover image when the pool itself is deleted.
// Ignored if no image was ever uploaded for this pool.
export async function deletePoolImage(poolId: string): Promise<void> {
  try {
    await deleteObject(ref(storage, `pools/${poolId}/cover.jpg`));
  } catch {
    // no cover image to delete
  }
}
