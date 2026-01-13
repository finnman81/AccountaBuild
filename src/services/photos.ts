import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '../firebase/firebase';

async function uriToBlob(uri: string) {
  const res = await fetch(uri);
  return await res.blob();
}

export async function uploadGroupPhoto(params: { groupId: string; uid: string; uri: string }) {
  const blob = await uriToBlob(params.uri);

  const objectPath = `groups/${params.groupId}/photos/${params.uid}/${Date.now()}.jpg`;
  const objectRef = ref(storage, objectPath);
  await uploadBytes(objectRef, blob);
  return await getDownloadURL(objectRef);
}

export async function uploadUserAvatar(params: { uid: string; uri: string }) {
  const blob = await uriToBlob(params.uri);
  const objectPath = `users/${params.uid}/avatar/${Date.now()}.jpg`;
  const objectRef = ref(storage, objectPath);
  await uploadBytes(objectRef, blob);
  return await getDownloadURL(objectRef);
}

export async function uploadGroupLogo(params: { groupId: string; uri: string }) {
  const blob = await uriToBlob(params.uri);
  const objectPath = `groups/${params.groupId}/logo/${Date.now()}.jpg`;
  const objectRef = ref(storage, objectPath);
  await uploadBytes(objectRef, blob);
  return await getDownloadURL(objectRef);
}


