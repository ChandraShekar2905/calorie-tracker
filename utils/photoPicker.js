import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// quality 0.5 keeps the base64 payload small enough to send to the API quickly.
const PICKER_OPTIONS = {
  mediaTypes: ['images'],
  quality: 0.5,
  base64: true,
};

// Opens the camera. Returns { uri, base64, mimeType } or null if the user
// cancels, denies permission, or something goes wrong.
export async function takePhoto() {
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
export async function pickPhoto() {
  try {
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    return toPhoto(result);
  } catch (error) {
    console.warn('NourishTrack: photo library failed', error);
    return null;
  }
}

function toPhoto(result) {
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}
