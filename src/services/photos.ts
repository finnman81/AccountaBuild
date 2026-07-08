import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';

import { storage } from '../firebase/firebase';

async function uriToBlob(uri: string) {
  const res = await fetch(uri);
  return await res.blob();
}

/** Downscale + JPEG-compress before upload to keep Storage usage small. */
async function compress(uri: string, maxWidth: number, quality: number): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri; // fall back to the original if manipulation fails
  }
}

export async function uploadGroupPhoto(params: { groupId: string; uid: string; uri: string }) {
  // Progress photos are a timeline → unique paths, but compressed.
  const uri = await compress(params.uri, 1280, 0.7);
  const blob = await uriToBlob(uri);
  const objectRef = ref(storage, `groups/${params.groupId}/photos/${params.uid}/${Date.now()}.jpg`);
  await uploadBytes(objectRef, blob);
  return await getDownloadURL(objectRef);
}

export async function uploadUserAvatar(params: { uid: string; uri: string }) {
  // Stable path → each new avatar OVERWRITES the old one instead of piling up
  // orphaned files (the old Date.now() path grew Storage on every change).
  const uri = await compress(params.uri, 512, 0.8);
  const blob = await uriToBlob(uri);
  const objectRef = ref(storage, `users/${params.uid}/avatar.jpg`);
  await uploadBytes(objectRef, blob);
  const url = await getDownloadURL(objectRef);
  // Cache-bust so the UI shows the new image immediately (same path each time).
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

export async function uploadGroupLogo(params: { groupId: string; uri: string }) {
  const uri = await compress(params.uri, 512, 0.8);
  const blob = await uriToBlob(uri);
  const objectRef = ref(storage, `groups/${params.groupId}/logo.jpg`);
  await uploadBytes(objectRef, blob);
  const url = await getDownloadURL(objectRef);
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}
