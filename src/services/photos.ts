import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '../firebase/firebase';

export async function uploadGroupPhoto(params: { groupId: string; uid: string; uri: string }) {
  const res = await fetch(params.uri);
  const blob = await res.blob();

  const objectPath = `groups/${params.groupId}/photos/${params.uid}/${Date.now()}.jpg`;
  const objectRef = ref(storage, objectPath);
  await uploadBytes(objectRef, blob);
  return await getDownloadURL(objectRef);
}


