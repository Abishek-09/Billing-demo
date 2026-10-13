import { create } from 'zustand';
import bcrypt from 'bcryptjs';
import db from '../db/dexie.js';

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  error: null,
  loading: false,

  /**
   * Authenticate with PIN against cached user hashes.
   * Works fully offline.
   */
  login: async (pin) => {
    set({ loading: true, error: null });
    try {
      const users = await db.users.where('active').equals(1).toArray();
      for (const user of users) {
        if (bcrypt.compareSync(pin, user.pin_hash)) {
          const session = { ...user, pin_hash: undefined };
          // Cache for offline login
          try {
            localStorage.setItem('pos_current_user', JSON.stringify(session));
          } catch {}
          set({ user: session, isAuthenticated: true, loading: false, error: null });
          // Audit log
          await db.audit_log.add({
            id: crypto.randomUUID(),
            user_id: user.id,
            action: 'login',
            entity_type: 'user',
            entity_id: user.id,
            before_json: null,
            after_json: null,
            created_at: new Date().toISOString(),
          });
          return true;
        }
      }
      set({ loading: false, error: 'invalid_pin' });
      return false;
    } catch (err) {
      console.error('[Auth] Login error:', err);
      set({ loading: false, error: 'error' });
      return false;
    }
  },

  /**
   * Verify an owner PIN (for destructive actions like void/reopen).
   */
  verifyOwnerPin: async (pin) => {
    try {
      const owners = await db.users
        .where('role').equals('owner')
        .and(u => u.active === 1)
        .toArray();
      for (const owner of owners) {
        if (bcrypt.compareSync(pin, owner.pin_hash)) {
          return owner;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Quick switch to another user without full logout.
   */
  switchUser: () => {
    set({ user: null, isAuthenticated: false, error: null });
    try {
      localStorage.removeItem('pos_current_user');
    } catch {}
  },

  /**
   * Unlock and switch session directly to Owner via PIN.
   */
  loginAsOwner: async (pin) => {
    try {
      const owners = await db.users
        .where('role').equals('owner')
        .and(u => u.active === 1)
        .toArray();
      for (const owner of owners) {
        if (bcrypt.compareSync(pin, owner.pin_hash)) {
          const session = { ...owner, pin_hash: undefined };
          try {
            localStorage.setItem('pos_current_user', JSON.stringify(session));
          } catch {}
          set({ user: session, isAuthenticated: true, error: null });
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('[Auth] loginAsOwner error:', err);
      return false;
    }
  },

  /**
   * Switch back to Cashier from Owner.
   */
  switchToCashier: async (cashierId) => {
    try {
      let cashier;
      if (cashierId) {
        cashier = await db.users.get(cashierId);
      } else {
        const cashiers = await db.users
          .where('role').equals('cashier')
          .and(u => u.active === 1)
          .toArray();
        cashier = cashiers[0];
      }
      if (cashier) {
        const session = { ...cashier, pin_hash: undefined };
        try {
          localStorage.setItem('pos_current_user', JSON.stringify(session));
        } catch {}
        set({ user: session, isAuthenticated: true, error: null });
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Auth] switchToCashier error:', err);
      return false;
    }
  },

  logout: async () => {
    const user = get().user;
    if (user) {
      await db.audit_log.add({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'logout',
        entity_type: 'user',
        entity_id: user.id,
        before_json: null,
        after_json: null,
        created_at: new Date().toISOString(),
      });
    }
    set({ user: null, isAuthenticated: false, error: null });
    try {
      localStorage.removeItem('pos_current_user');
    } catch {}
  },

  /**
   * Restore session from localStorage (for page reload).
   */
  restoreSession: () => {
    try {
      const cached = localStorage.getItem('pos_current_user');
      if (cached) {
        const user = JSON.parse(cached);
        set({ user, isAuthenticated: true });
      }
    } catch {}
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
