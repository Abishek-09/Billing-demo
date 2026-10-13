import React, { createContext, useContext, useCallback } from 'react';
import en from './en.json';

const I18nContext = createContext();

/**
 * Get a nested value from an object using dot notation.
 * Supports {{key}} interpolation.
 */
function getNestedValue(obj, path, params = {}) {
  const value = path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);

  if (value === null) return path; // fallback to key

  if (typeof value === 'string' && params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return params[key] !== undefined ? params[key] : `{{${key}}}`;
    });
  }

  return value;
}

export function I18nProvider({ children }) {
  const t = useCallback((key, params) => {
    return getNestedValue(en, key, params);
  }, []);

  return (
    <I18nContext.Provider value={{ t, lang: 'en' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
