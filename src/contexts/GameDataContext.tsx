'use client';

/**
 * Fetches Uniques, Abilities, and Formulas from Google Sheets and updates the
 * module-level data stores so all components see fresh values.
 *
 * Tab names in the spreadsheet:
 *   "Uniques"   → unique item definitions  (same columns as uniques CSV)
 *   "Abilities" → ability definitions      (same columns as abilities CSV)
 *   "Formulas"  → damage formula constants (Key/Value rows, see damage_formulas.csv)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  buildClassDefsFromSheets,
  parseAbilitiesCSV,
  parseClassUpgradesCSV,
  parseClassesCSV,
  parseEquipmentCSV,
  parseEquipmentModifiersCSV,
  parseFormulaConstantsCSV,
  parseUniquesCSV,
} from '../lib/parseSheetData';
import { updateUniqueDefinitions } from '../data/eocUniques';
import { updateAbilityDefinitions } from '../data/eocAbilities';
import { updateFormulaConstants } from '../data/formulaConstants';
import { invalidateEquipmentItemsCache } from '../data/equipment';
import { updateBaseEquipmentDefinitions } from '../data/eocBaseEquipment';
import { updateModifierDefinitions } from '../data/eocModifiers';
import { updateGameClassDefinitions } from '../data/gameClasses';

export interface GameDataState {
  loading: boolean;
  error: string | null;
  /** Unix ms timestamp of the last successful fetch, or null if using static fallback. */
  lastUpdated: number | null;
}

const GameDataContext = createContext<GameDataState>({
  loading: false,
  error: null,
  lastUpdated: null,
});

async function fetchSheetCSV(tab: string): Promise<string> {
  const res = await fetch(`/api/sheets?tab=${encodeURIComponent(tab)}`);
  if (!res.ok) throw new Error(`Failed to fetch "${tab}" tab (HTTP ${res.status})`);
  return res.text();
}

export function GameDataProvider({ children }: { children: React.ReactNode }) {
  // Start as false so SSR and the initial client render match (avoids hydration mismatch).
  // useEffect immediately flips to true before the fetch begins.
  const [state, setState] = useState<GameDataState>({
    loading: false,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, lastUpdated: null });

    async function loadAll() {
      const errors: string[] = [];

      // Fetch all tabs concurrently; each failure is non-fatal
      const [uniquesResult, abilitiesResult, formulasResult, equipResult, modsResult, classesResult, classUpgradesResult] =
        await Promise.allSettled([
          fetchSheetCSV('Uniques'),
          fetchSheetCSV('Abilities'),
          fetchSheetCSV('Formulas'),
          fetchSheetCSV('Equipment'),
          fetchSheetCSV('Equipment_Modifiers'),
          fetchSheetCSV('Classes'),
          fetchSheetCSV('Class_Upgrades'),
        ]);
      if (cancelled) return;

      if (uniquesResult.status === 'fulfilled') {
        const defs = parseUniquesCSV(uniquesResult.value);
        if (defs.length > 0) {
          updateUniqueDefinitions(defs);
          invalidateEquipmentItemsCache();
        }
      } else {
        errors.push(`Uniques: ${uniquesResult.reason}`);
      }

      if (abilitiesResult.status === 'fulfilled') {
        const defs = parseAbilitiesCSV(abilitiesResult.value);
        if (defs.length > 0) updateAbilityDefinitions(defs);
      } else {
        errors.push(`Abilities: ${abilitiesResult.reason}`);
      }

      if (formulasResult.status === 'fulfilled') {
        const patch = parseFormulaConstantsCSV(formulasResult.value);
        if (Object.keys(patch).length > 0) updateFormulaConstants(patch);
      } else {
        errors.push(`Formulas: ${formulasResult.reason}`);
      }

      if (equipResult.status === 'fulfilled') {
        const defs = parseEquipmentCSV(equipResult.value);
        if (defs.length > 0) updateBaseEquipmentDefinitions(defs);
      } else {
        errors.push(`Equipment: ${equipResult.reason}`);
      }

      if (modsResult.status === 'fulfilled') {
        const defs = parseEquipmentModifiersCSV(modsResult.value);
        if (defs.length > 0) updateModifierDefinitions(defs);
      } else {
        errors.push(`EquipmentModifiers: ${modsResult.reason}`);
      }

      // Classes (class specials / upgrades)
      if (classesResult.status === 'fulfilled' && classUpgradesResult.status === 'fulfilled') {
        const clsRows = parseClassesCSV(classesResult.value);
        const upgRows = parseClassUpgradesCSV(classUpgradesResult.value);
        const defs = buildClassDefsFromSheets(clsRows, upgRows);
        if (defs.length > 0) updateGameClassDefinitions(defs);
      } else {
        if (classesResult.status !== 'fulfilled') errors.push(`Classes: ${classesResult.reason}`);
        if (classUpgradesResult.status !== 'fulfilled') errors.push(`ClassUpgrades: ${classUpgradesResult.reason}`);
      }

      if (!cancelled) {
        setState({
          loading: false,
          error: errors.length > 0 ? errors.join(' | ') : null,
          lastUpdated: Date.now(),
        });
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, []);

  return (
    <GameDataContext.Provider value={state}>
      {children}
    </GameDataContext.Provider>
  );
}

export function useGameData(): GameDataState {
  return useContext(GameDataContext);
}
