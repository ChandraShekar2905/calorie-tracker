import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import TabBar from './components/TabBar';
import TodayScreen from './components/TodayScreen';
import LogFoodScreen from './components/LogFoodScreen';
import WaterScreen from './components/WaterScreen';
import MealAnalysis from './components/MealAnalysis';
import { todayKey, loadDay, saveDay } from './utils/storage';
import { syncPendingChanges } from './utils/sync';
import { colors } from './constants';

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  const [foods, setFoods] = useState([]);
  // Water is a list of amounts (e.g. [8, 16]) so a single entry can be removed.
  const [water, setWater] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  // When a photo is taken/picked, it lands here and the MealAnalysis
  // screen takes over until the user confirms or cancels.
  const [pendingPhoto, setPendingPhoto] = useState(null);

  // Ids of entries deleted locally that the server hasn't been told about
  // yet. Kept separately because once an entry is gone from `foods` there's
  // nothing left to hang the pending delete off.
  const [pendingDeletes, setPendingDeletes] = useState([]);
  const [pendingWaterDeletes, setPendingWaterDeletes] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  // Bumped by the Retry button to re-run the sync effect when nothing else
  // has changed.
  const [syncAttempt, setSyncAttempt] = useState(0);
  // A ref, not state, because the sync effect has to check "am I already
  // running?" synchronously — a state update wouldn't have committed yet.
  const isSyncingRef = useRef(false);
  const waterCounterRef = useRef(0);

  // Load today's saved data once when the app opens.
  useEffect(() => {
    async function load() {
      const day = await loadDay(todayKey());
      setFoods(day.foods);
      setWater(day.water);
      setPendingDeletes(day.pendingDeletes);
      setPendingWaterDeletes(day.pendingWaterDeletes);
      setIsLoaded(true);
    }
    load();
  }, []);

  // Save whenever the data changes (but not before the initial load,
  // so we don't overwrite saved data with the empty starting state).
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    saveDay(todayKey(), { foods, water, pendingDeletes, pendingWaterDeletes });
  }, [foods, water, pendingDeletes, pendingWaterDeletes, isLoaded]);

  // Push anything the server hasn't seen. Local storage above is the source
  // of truth for the UI, so this can fail freely without the user noticing
  // anything beyond the status line on the Today screen.
  useEffect(() => {
    if (!isLoaded || isSyncingRef.current) {
      return;
    }
    const hasWork =
      foods.some((food) => !food.synced) ||
      water.some((entry) => !entry.synced) ||
      pendingDeletes.length > 0 ||
      pendingWaterDeletes.length > 0;
    if (!hasWork) {
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    syncPendingChanges({ foods, water, pendingDeletes, pendingWaterDeletes })
      .then((result) => {
        // Marking entries synced changes `foods`/`water`, which re-runs this
        // effect and picks up anything logged while the sync was in flight.
        if (result.syncedFoodIds.length > 0) {
          setFoods((current) =>
            current.map((food) =>
              result.syncedFoodIds.includes(food.id)
                ? { ...food, synced: true }
                : food
            )
          );
        }
        if (result.syncedWaterIds.length > 0) {
          setWater((current) =>
            current.map((entry) =>
              result.syncedWaterIds.includes(entry.id)
                ? { ...entry, synced: true }
                : entry
            )
          );
        }
        // Only replace a queue when deletes actually went through — handing
        // back a new-but-identical array would re-trigger this effect and
        // spin forever while the server is unreachable.
        setPendingDeletes((current) =>
          current.length === result.pendingDeletes.length
            ? current
            : result.pendingDeletes
        );
        setPendingWaterDeletes((current) =>
          current.length === result.pendingWaterDeletes.length
            ? current
            : result.pendingWaterDeletes
        );
      })
      .finally(() => {
        isSyncingRef.current = false;
        setIsSyncing(false);
      });
  }, [foods, water, pendingDeletes, pendingWaterDeletes, isLoaded, syncAttempt]);

  function addFood(name, calories) {
    // A typed food is a meal of one item, so it gets a mealId too and the
    // sync layer doesn't need a special case for it.
    const mealId = `meal-${Date.now()}`;
    const entry = {
      id: `${mealId}-0`,
      mealId,
      name,
      calories,
      portion: '',
      confidence: null,
      source: 'manual',
      time: new Date().toISOString(),
      localDate: todayKey(),
      synced: false,
    };
    setFoods([...foods, entry]);
    setActiveTab('today');
  }

  // Called when the user confirms the analyzed meal. Each detected item
  // becomes its own log entry, all sharing one mealId and the meal photo.
  // Known limitation: only the photo's file URI is persisted (never the
  // base64 — that would bloat AsyncStorage), and expo-image-picker writes
  // the file to the app's CACHE directory, which the OS may purge. If it
  // does, old thumbnails go blank. Fix if needed: copy the file to the
  // documents directory with expo-file-system before saving the entry.
  function confirmMeal(mealItems, photoUri) {
    const mealId = `meal-${Date.now()}`;
    const time = new Date().toISOString();
    const localDate = todayKey();
    const entries = mealItems.map((item, index) => ({
      id: `${mealId}-${index}`,
      mealId,
      name: item.name,
      calories: item.calories,
      portion: item.portion,
      confidence: item.confidence,
      source: 'photo',
      time,
      localDate,
      photoUri,
      synced: false,
    }));
    setFoods([...foods, ...entries]);
    setPendingPhoto(null);
    setActiveTab('today');
  }

  function deleteFood(id) {
    const deleted = foods.find((food) => food.id === id);
    setFoods(foods.filter((food) => food.id !== id));
    // An entry the server never received doesn't need a delete request.
    if (deleted && deleted.synced) {
      setPendingDeletes([...pendingDeletes, id]);
    }
  }

  function addWater(amountOz) {
    const entry = {
      // The counter keeps two quick taps in the same millisecond from
      // producing the same id, which would silently overwrite one of them
      // in Postgres.
      id: `water-${Date.now()}-${waterCounterRef.current++}`,
      amountOz,
      time: new Date().toISOString(),
      localDate: todayKey(),
      synced: false,
    };
    setWater([...water, entry]);
  }

  function deleteWater(id) {
    const deleted = water.find((entry) => entry.id === id);
    setWater(water.filter((entry) => entry.id !== id));
    if (deleted && deleted.synced) {
      setPendingWaterDeletes([...pendingWaterDeletes, id]);
    }
  }

  const waterTotal = water.reduce((sum, entry) => sum + entry.amountOz, 0);
  const unsyncedCount =
    foods.filter((food) => !food.synced).length +
    water.filter((entry) => !entry.synced).length +
    pendingDeletes.length +
    pendingWaterDeletes.length;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {pendingPhoto ? (
          <MealAnalysis
            photo={pendingPhoto}
            onConfirm={confirmMeal}
            onCancel={() => setPendingPhoto(null)}
          />
        ) : (
          <>
            <View style={styles.screen}>
              {activeTab === 'today' && (
                <TodayScreen
                  foods={foods}
                  waterTotal={waterTotal}
                  onPhotoSelected={setPendingPhoto}
                  onDeleteFood={deleteFood}
                  isSyncing={isSyncing}
                  unsyncedCount={unsyncedCount}
                  onRetrySync={() => setSyncAttempt(syncAttempt + 1)}
                />
              )}
              {activeTab === 'log' && (
                <LogFoodScreen
                  onAddFood={addFood}
                  onPhotoSelected={setPendingPhoto}
                />
              )}
              {activeTab === 'water' && (
                <WaterScreen
                  water={water}
                  waterTotal={waterTotal}
                  onAddWater={addWater}
                  onDeleteWater={deleteWater}
                />
              )}
            </View>
            <TabBar activeTab={activeTab} onSelectTab={setActiveTab} />
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
});
