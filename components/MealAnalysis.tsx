import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { analyzeMealPhoto, MealAnalysisError } from '../utils/analyzeMeal';
import { colors, confidenceColors } from '../constants';
import type { AnalyzedItem, ConfirmedItem, Photo } from '../types';

// An analyzed item plus the bits only this screen needs: a stable key for the
// list, and the calories held as text so the input can be cleared and retyped
// freely. Converted back to numbers on Confirm.
type EditableItem = AnalyzedItem & {
  key: string;
  caloriesText: string;
};

type Status = 'loading' | 'results' | 'error';

type MealAnalysisProps = {
  photo: Photo;
  onConfirm: (items: ConfirmedItem[], photoUri: string) => void;
  onCancel: () => void;
};

// Shown after a photo is taken/picked. Handles the whole analyze flow:
// loading → results (editable) or error (retryable), then Confirm/Cancel.
export default function MealAnalysis({
  photo,
  onConfirm,
  onCancel,
}: MealAnalysisProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<EditableItem[]>([]);
  // Seconds until Retry is allowed again after a rate-limit (429) error.
  const [retryWait, setRetryWait] = useState(0);

  async function analyze() {
    setStatus('loading');
    try {
      const result = await analyzeMealPhoto(photo.base64, photo.mimeType);
      setItems(
        result.items.map((item, index) => ({
          ...item,
          key: String(index),
          caloriesText: String(item.calories),
        }))
      );
      setStatus('results');
    } catch (error) {
      console.warn('NourishTrack: meal analysis failed', error);
      // A caught value is `unknown`, so this has to be narrowed before the
      // rate-limit fields can be read — which also stops an unrelated
      // failure from being mistaken for a rate limit.
      if (error instanceof MealAnalysisError && error.isRateLimit) {
        setRetryWait(error.retryAfterSeconds);
      }
      setStatus('error');
    }
  }

  // Analyze once as soon as the screen appears.
  useEffect(() => {
    analyze();
  }, []);

  // Tick the rate-limit countdown down once per second.
  useEffect(() => {
    if (retryWait <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setRetryWait(retryWait - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryWait]);

  function updateCalories(key: string, text: string) {
    setItems(
      items.map((item) =>
        item.key === key ? { ...item, caloriesText: text } : item
      )
    );
  }

  function removeItem(key: string) {
    setItems(items.filter((item) => item.key !== key));
  }

  function handleConfirm() {
    // Portion and confidence ride along so they can be stored in Postgres —
    // they're what makes a logged meal auditable after the fact.
    const confirmed: ConfirmedItem[] = items.map((item) => ({
      name: item.name,
      portion: item.portion,
      confidence: item.confidence,
      calories: Number(item.caloriesText) || 0,
    }));
    onConfirm(confirmed, photo.uri);
  }

  const totalCalories = items.reduce(
    (sum, item) => sum + (Number(item.caloriesText) || 0),
    0
  );
  const hasLowConfidence = items.some((item) => item.confidence === 'low');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your meal</Text>
      <Image source={{ uri: photo.uri }} style={styles.photo} />

      {status === 'loading' && (
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.statusText}>Analyzing your meal...</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.card}>
          <Text style={styles.statusText}>
            {retryWait > 0
              ? `Rate limited — try again in ${retryWait}s`
              : 'Something went wrong analyzing your photo. Check your connection and try again.'}
          </Text>
          <Pressable
            style={[
              styles.primaryButton,
              retryWait > 0 && styles.disabledButton,
            ]}
            onPress={analyze}
            disabled={retryWait > 0}
          >
            <Text style={styles.primaryButtonText}>
              {retryWait > 0 ? `Retry in ${retryWait}s` : 'Retry'}
            </Text>
          </Pressable>
        </View>
      )}

      {status === 'results' && items.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.statusText}>
            No food detected — try another photo.
          </Text>
          <Pressable style={styles.primaryButton} onPress={analyze}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {status === 'results' && items.length > 0 && (
        <View style={styles.card}>
          {hasLowConfidence && (
            <Text style={styles.note}>
              Estimates are rough — tap to adjust.
            </Text>
          )}

          {items.map((item) => (
            <View key={item.key} style={styles.itemRow}>
              <View
                style={[
                  styles.confidenceDot,
                  { backgroundColor: confidenceColors[item.confidence] },
                ]}
              />
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.portion !== '' && (
                  <Text style={styles.itemPortion}>{item.portion}</Text>
                )}
              </View>
              <TextInput
                style={styles.caloriesInput}
                value={item.caloriesText}
                onChangeText={(text) => updateCalories(item.key, text)}
                keyboardType="number-pad"
              />
              <Text style={styles.calUnit}>cal</Text>
              <Pressable
                style={styles.removeButton}
                onPress={() => removeItem(item.key)}
              >
                <Text style={styles.removeButtonText}>✕</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{totalCalories} cal</Text>
          </View>

          <Pressable style={styles.reanalyzeButton} onPress={analyze}>
            <Text style={styles.reanalyzeText}>Re-analyze photo</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        {status === 'results' && items.length > 0 && (
          <Pressable style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.primaryButtonText}>Confirm</Text>
          </Pressable>
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
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: colors.border,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    alignItems: 'stretch',
  },
  statusText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  note: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  confidenceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  itemPortion: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  caloriesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 16,
    color: colors.text,
    minWidth: 64,
    textAlign: 'right',
    backgroundColor: colors.background,
  },
  calUnit: {
    fontSize: 14,
    color: colors.textMuted,
  },
  removeButton: {
    padding: 6,
  },
  removeButtonText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  reanalyzeButton: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  reanalyzeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
