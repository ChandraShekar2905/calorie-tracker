import { Pressable, StyleSheet, Text, View } from 'react-native';
import ProgressBar from './ProgressBar';
import { colors, WATER_GOAL_OZ } from '../constants';

const QUICK_ADD_AMOUNTS = [8, 16, 24];

export default function WaterScreen({ waterTotal, onAddWater, onUndo, canUndo }) {
  const goalReached = waterTotal >= WATER_GOAL_OZ;

  return (
    <View style={styles.container}>
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

      <Pressable
        style={[styles.undoButton, !canUndo && styles.undoButtonDisabled]}
        onPress={onUndo}
        disabled={!canUndo}
      >
        <Text style={styles.undoButtonText}>Undo last</Text>
      </Pressable>
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
    gap: 10,
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
  undoButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  undoButtonDisabled: {
    opacity: 0.4,
  },
  undoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
