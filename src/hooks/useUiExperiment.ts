import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ui_experiments';

type UiExperiment = 'txn_row_v2';

const defaults: Record<UiExperiment, boolean> = {
  txn_row_v2: __DEV__,
};

let cache: Record<string, boolean> | null = null;

async function loadExperiments(): Promise<Record<string, boolean>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export function useUiExperiment(name: UiExperiment): boolean {
  const [enabled, setEnabled] = useState(defaults[name]);

  useEffect(() => {
    loadExperiments().then((experiments) => {
      if (name in experiments) {
        setEnabled(experiments[name]);
      }
    });
  }, [name]);

  return enabled;
}

export async function setUiExperiment(name: UiExperiment, enabled: boolean) {
  const experiments = await loadExperiments();
  experiments[name] = enabled;
  cache = experiments;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
}
