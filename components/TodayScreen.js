import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ProgressBar from './ProgressBar';
import { colors, WATER_GOAL_OZ } from '../constants';
import { takePhoto } from '../utils/photoPicker';

function formatDate(date) {
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TodayScreen({ foods, waterTotal, onPhotoSelected }) {
  const totalCalories = foods.reduce((sum, food) => sum + food.calories, 0);

  async function handleSnapMeal() {
    const photo = await takePhoto();
    if (photo) {
      onPhotoSelected(photo);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.date}>{formatDate(new Date())}</Text>

      <Pressable style={styles.snapButton} onPress={handleSnapMeal}>
        <Text style={styles.snapButtonText}>📷 Snap your meal</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Calories today</Text>
        <Text style={styles.bigNumber}>{totalCalories}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Water</Text>
        <Text style={styles.waterText}>
          <Text style={styles.waterNumber}>{waterTotal}</Text> of {WATER_GOAL_OZ} oz
        </Text>
        <ProgressBar progress={waterTotal / WATER_GOAL_OZ} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Logged today</Text>
        {foods.length === 0 ? (
          <Text style={styles.emptyText}>
            Nothing logged yet — head to Log Food to add your first meal.
          </Text>
        ) : (
          foods.map((food) => (
            <View key={food.id} style={styles.foodRow}>
              {food.photoUri && (
                <Image source={{ uri: food.photoUri }} style={styles.thumbnail} />
              )}
              <View style={styles.foodInfo}>
                <Text style={styles.foodName}>{food.name}</Text>
                <Text style={styles.foodTime}>{formatTime(food.time)}</Text>
              </View>
              <Text style={styles.foodCalories}>{food.calories} cal</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  date: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  snapButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  snapButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: colors.border,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.accent,
  },
  waterText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  waterNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.accent,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  foodInfo: {
    flexShrink: 1,
    paddingRight: 12,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  foodTime: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  foodCalories: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
});
