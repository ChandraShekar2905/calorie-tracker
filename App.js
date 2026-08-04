import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import TabBar from './components/TabBar';
import TodayScreen from './components/TodayScreen';
import LogFoodScreen from './components/LogFoodScreen';
import WaterScreen from './components/WaterScreen';
import MealAnalysis from './components/MealAnalysis';
import { todayKey, loadDay, saveDay } from './utils/storage';
import { colors } from './constants';

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  const [foods, setFoods] = useState([]);
  // Water is a list of amounts (e.g. [8, 16]) so "undo last" can remove one.
  const [water, setWater] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  // When a photo is taken/picked, it lands here and the MealAnalysis
  // screen takes over until the user confirms or cancels.
  const [pendingPhoto, setPendingPhoto] = useState(null);

  // Load today's saved data once when the app opens.
  useEffect(() => {
    async function load() {
      const day = await loadDay(todayKey());
      setFoods(day.foods);
      setWater(day.water);
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
    saveDay(todayKey(), { foods, water });
  }, [foods, water, isLoaded]);

  function addFood(name, calories) {
    const entry = {
      id: Date.now().toString(),
      name,
      calories,
      time: new Date().toISOString(),
    };
    setFoods([...foods, entry]);
    setActiveTab('today');
  }

  // Called when the user confirms the analyzed meal. Each detected item
  // becomes its own log entry, all sharing the meal photo.
  function confirmMeal(mealItems, photoUri) {
    const time = new Date().toISOString();
    const entries = mealItems.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      name: item.name,
      calories: item.calories,
      time,
      photoUri,
    }));
    setFoods([...foods, ...entries]);
    setPendingPhoto(null);
    setActiveTab('today');
  }

  function addWater(amountOz) {
    setWater([...water, amountOz]);
  }

  function undoWater() {
    setWater(water.slice(0, -1));
  }

  const waterTotal = water.reduce((sum, amountOz) => sum + amountOz, 0);

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
                  waterTotal={waterTotal}
                  onAddWater={addWater}
                  onUndo={undoWater}
                  canUndo={water.length > 0}
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
