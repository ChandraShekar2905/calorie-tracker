import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { Photo } from '../types';

// quality 0.5 keeps the base64 payload small enough to send to the API quickly.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.5,
  base64: true,
};

// Opens the camera. Returns the photo, or null if the user cancels, denies
// permission, or something goes wrong.
export async function takePhoto(): Promise<Photo | null> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to snap a photo of your meal.'
      );
      return null;
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    return toPhoto(result);
  } catch (error) {
    console.warn('NourishTrack: camera failed', error);
    return null;
  }
}

// Opens the photo library. Same return shape as takePhoto.
export async function pickPhoto(): Promise<Photo | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    return toPhoto(result);
  } catch (error) {
    console.warn('NourishTrack: photo library failed', error);
    return null;
  }
}

function toPhoto(result: ImagePicker.ImagePickerResult): Photo | null {
  if (result.canceled || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  // base64 is optional in the picker's result type even though it's requested
  // above, so it has to be checked rather than assumed. Without it there's
  // nothing to send for analysis, so this counts as a failed pick.
  if (!asset.base64) {
    console.warn('NourishTrack: picker returned no base64 data');
    return null;
  }
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}
