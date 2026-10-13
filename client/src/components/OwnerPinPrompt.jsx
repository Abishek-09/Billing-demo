import React, { useState } from 'react';
import NumPad from './NumPad.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

/**
 * Owner PIN verification inline panel.
 * Used for destructive actions (void, reopen day).
 * No modal — slides in inline.
 */
export default function OwnerPinPrompt({ onVerified, onCancel, title }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (enteredPin) => {
    setLoading(true);
    setError(false);
    const result = await onVerified(enteredPin);
    if (!result) {
      setError(true);
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="animate-fade-in bg-cream-card rounded-card shadow-medium p-6 max-w-xs mx-auto">
      <h3 className="font-serif font-semibold text-espresso text-lg mb-1 text-center">
        {title || t('common.owner_pin')}
      </h3>
      {error && (
        <p className="text-crimson text-sm text-center mb-2 font-medium">
          {t('common.owner_pin_invalid')}
        </p>
      )}
      <NumPad
        value={pin}
        onChange={setPin}
        onSubmit={handleSubmit}
        maxLength={4}
        masked
        submitLabel={loading ? '...' : t('common.confirm')}
      />
      <button
        type="button"
        className="w-full mt-3 text-brown text-sm font-medium hover:text-espresso transition-colors py-2"
        onClick={onCancel}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}
