import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ProgressBar from './ProgressBar';
import { colors, WATER_GOAL_OZ } from '../constants';

const QUICK_ADD_AMOUNTS = [8, 16, 24];

export default function WaterScreen({
  water,
  waterTotal,
  onAddWater,
  onDeleteWater,
}) {
  // Kept as text while typing so the field can be cleared and retyped;
  // converted to a number only when the entry is added.
  const [customAmount, setCustomAmount] = useState('');

  const goalReached = waterTotal >= WATER_GOAL_OZ;
  const parsedCustom = Number(customAmount);
  const canAddCustom = parsedCustom > 0;

  function handleAddCustom() {
    if (!canAddCustom) {
      return;
    }
    onAddWater(Math.round(parsedCustom));
    setCustomAmount('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Water</Text>

      <View style={styles.card}>
        <Text style={styles.bigNumber}>{waterTotal} oz</Text>
        <Text style={styles.goalText}>
          {goalReached
            ? 'Goal reached — nice work! 🎉'
            : `${WATER_GOAL_OZ - waterTotal} oz to go of your ${WATER_GOAL_OZ} oz goal`}
        </Text>
        <ProgressBar progress={waterTotal / WATER_GOAL_OZ} />
      </View>

      <View style={styles.buttonRow}>
        {QUICK_ADD_AMOUNTS.map((amount) => (
          <Pressable
            key={amount}
            style={styles.addButton}
            onPress={() => onAddWater(amount)}
          >
            <Text style={styles.addButtonText}>+{amount} oz</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.customRow}>
        <TextInput
          style={styles.customInput}
          value={customAmount}
          onChangeText={setCustomAmount}
          keyboardType="number-pad"
          placeholder="Custom amount"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={handleAddCustom}
        />
        <Text style={styles.customUnit}>oz</Text>
        <Pressable
          style={[styles.customButton, !canAddCustom && styles.disabledButton]}
          onPress={handleAddCustom}
          disabled={!canAddCustom}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Logged today</Text>
        {water.length === 0 ? (
          <Text style={styles.emptyText}>
            No water logged yet — tap a button above to start.
          </Text>
        ) : (
          water.map((entry) => (
            <View key={entry.id} style={styles.entryRow}>
              <Text style={styles.entryAmount}>{entry.amountOz} oz</Text>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDeleteWater(entry.id)}
              >
                <Text style={styles.deleteButtonText}>✕</Text>
              </Pressable>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
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
  goalText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  customUnit: {
    fontSize: 15,
    color: colors.textMuted,
  },
  customButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  deleteButton: {
    padding: 6,
  },
  deleteButtonText: {
    fontSize: 16,
    color: colors.textMuted,
  },
});
