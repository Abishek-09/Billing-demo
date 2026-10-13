import { create } from 'zustand';

const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'success', duration = 3000) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, exiting: false }],
    }));

    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.map(t =>
          t.id === id ? { ...t, exiting: true } : t
        ),
      }));
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter(t => t.id !== id),
        }));
      }, 300);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.map(t =>
        t.id === id ? { ...t, exiting: true } : t
      ),
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id),
      }));
    }, 300);
  },
}));

export default useToastStore;
