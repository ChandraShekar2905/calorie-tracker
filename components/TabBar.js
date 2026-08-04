import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log Food' },
  { id: 'water', label: 'Water' },
];

export default function TabBar({ activeTab, onSelectTab }) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelectTab(tab.id)}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.accent,
  },
});
