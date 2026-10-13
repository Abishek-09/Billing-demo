import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import useAuthStore from '../store/authStore.js';
import NumPad from '../components/NumPad.jsx';

/**
 * PIN Login page — full-screen, centered, large tap targets.
 * Works fully offline against cached credential hashes.
 */
export default function LoginPage() {
  const { t } = useI18n();
  const { login, error, loading, clearError } = useAuthStore();
  const [pin, setPin] = useState('');

  const handleLogin = async (enteredPin) => {
    const success = await login(enteredPin);
    if (!success) {
      setPin('');
    }
  };

  const handleChange = (val) => {
    setPin(val);
    if (error) clearError();
  };

  return (
    <div className="h-full flex items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Brand header */}
        <div className="text-center mb-8">
          {/* Logo mark */}
          <div className="w-16 h-16 bg-teal rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-medium">
            <span className="text-white text-2xl font-serif font-bold">B</span>
          </div>
          <h1 className="font-serif font-bold text-espresso text-3xl">
            Bake & Brew
          </h1>
          <p className="text-brown/60 font-sans text-sm mt-1">{t('app.tagline')}</p>
        </div>

        {/* Login card */}
        <div className="card p-6 shadow-medium">
          <h2 className="font-serif font-semibold text-espresso text-xl text-center mb-1">
            {t('login.title')}
          </h2>
          <p className="text-brown/50 text-sm text-center mb-5 font-sans">
            {t('login.subtitle')}
          </p>

          {/* Error message */}
          {error && (
            <div className="bg-crimson/10 text-crimson text-sm font-medium px-4 py-2.5 rounded-btn mb-4 text-center animate-fade-in">
              {t('login.error')}
            </div>
          )}

          <NumPad
            value={pin}
            onChange={handleChange}
            onSubmit={handleLogin}
            maxLength={4}
            masked
            submitLabel={loading ? t('login.logging_in') : t('login.title')}
            autoSubmitLength={4}
          />
        </div>

        {/* Demo Credentials Box */}
        <div className="mt-5 bg-white/80 border border-brown/15 rounded-card p-4 shadow-subtle">
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-brown/10">
            <span className="text-xs font-serif font-bold text-espresso tracking-wide">
              Localhost Login PINs
            </span>
            <span className="text-[10px] text-brown/60 uppercase font-mono tracking-wider font-semibold">
              Tap to Login
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setPin('1234'); handleLogin('1234'); }}
              className="p-2.5 rounded-btn bg-cream hover:bg-teal/10 hover:border-teal/30 border border-brown/10 transition-all text-left group"
            >
              <div className="text-[11px] text-brown/70 font-sans">Cashier (Raju)</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-mono font-bold text-teal text-base tracking-widest">1234</span>
                <span className="text-[10px] text-teal/70 font-medium group-hover:translate-x-0.5 transition-transform">Use →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { setPin('5678'); handleLogin('5678'); }}
              className="p-2.5 rounded-btn bg-cream hover:bg-teal/10 hover:border-teal/30 border border-brown/10 transition-all text-left group"
            >
              <div className="text-[11px] text-brown/70 font-sans">Cashier (Priya)</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-mono font-bold text-teal text-base tracking-widest">5678</span>
                <span className="text-[10px] text-teal/70 font-medium group-hover:translate-x-0.5 transition-transform">Use →</span>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => { setPin('0000'); handleLogin('0000'); }}
            className="w-full mt-2 p-2 rounded-btn bg-cream hover:bg-teal/10 hover:border-teal/30 border border-brown/10 transition-all flex items-center justify-between group"
          >
            <div className="text-left">
              <span className="text-[11px] text-brown/70 font-sans">Manager / Owner: </span>
              <span className="font-mono font-bold text-teal text-sm tracking-widest ml-1">0000</span>
            </div>
            <span className="text-[10px] text-teal/70 font-medium group-hover:translate-x-0.5 transition-transform">Use →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
