import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../constants';
import { takePhoto, pickPhoto } from '../utils/photoPicker';
import type { Photo } from '../types';

type LogFoodScreenProps = {
  onAddFood: (name: string, calories: number) => void;
  onPhotoSelected: (photo: Photo) => void;
};

export default function LogFoodScreen({
  onAddFood,
  onPhotoSelected,
}: LogFoodScreenProps) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');

  const canAdd = name.trim().length > 0 && Number(calories) > 0;

  function handleAdd() {
    if (!canAdd) {
      return;
    }
    onAddFood(name.trim(), Number(calories));
    setName('');
    setCalories('');
  }

  async function handleTakePhoto() {
    const photo = await takePhoto();
    if (photo) {
      onPhotoSelected(photo);
    }
  }

  async function handlePickPhoto() {
    const photo = await pickPhoto();
    if (photo) {
      onPhotoSelected(photo);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log Food</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Food name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Greek yogurt"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Calories</Text>
        <TextInput
          style={styles.input}
          value={calories}
          onChangeText={setCalories}
          placeholder="e.g. 150"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
        />

        <Pressable
          style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
          onPress={handleAdd}
          disabled={!canAdd}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Or log from a photo</Text>
        <Pressable style={styles.photoButton} onPress={handleTakePhoto}>
          <Text style={styles.photoButtonText}>📷 Take a photo</Text>
        </Pressable>
        <Pressable style={styles.photoButton} onPress={handlePickPhoto}>
          <Text style={styles.photoButtonText}>🖼️ Choose from library</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  photoButton: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  photoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
});
