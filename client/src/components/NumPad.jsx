import React, { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Large-digit numeric keypad optimized for touch.
 * Supports PIN entry, weight entry, and quantity entry.
 * @param {Object} props
 * @param {function} props.onSubmit - Called with the entered value
 * @param {function} props.onChange - Called on every digit change
 * @param {string} props.value - Controlled value
 * @param {number} props.maxLength - Maximum digits
 * @param {boolean} props.allowDecimal - Allow decimal point
 * @param {string} props.submitLabel - Label for submit button
 * @param {boolean} props.autoSubmitLength - Auto-submit when this length is reached
 * @param {boolean} props.masked - Show dots instead of digits (for PIN)
 */
export default function NumPad({
  onSubmit,
  onChange,
  value: controlledValue,
  maxLength = 10,
  allowDecimal = false,
  submitLabel = '✓',
  autoSubmitLength = null,
  masked = false,
  className = '',
}) {
  const [internalValue, setInternalValue] = useState('');
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const setValue = controlledValue !== undefined ? (onChange || (() => {})) : setInternalValue;
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const handleDigit = useCallback((digit) => {
    const newVal = value + digit;
    if (newVal.length > maxLength) return;
    if (digit === '.' && value.includes('.')) return;
    if (digit === '.' && !allowDecimal) return;

    if (controlledValue !== undefined) {
      onChange?.(newVal);
    } else {
      setInternalValue(newVal);
      onChange?.(newVal);
    }

    // Auto-submit
    if (autoSubmitLength && newVal.length >= autoSubmitLength) {
      setTimeout(() => submitRef.current?.(newVal), 100);
    }
  }, [value, maxLength, allowDecimal, autoSubmitLength, controlledValue, onChange]);

  const handleBackspace = useCallback(() => {
    const newVal = value.slice(0, -1);
    if (controlledValue !== undefined) {
      onChange?.(newVal);
    } else {
      setInternalValue(newVal);
      onChange?.(newVal);
    }
  }, [value, controlledValue, onChange]);

  const handleClear = useCallback(() => {
    if (controlledValue !== undefined) {
      onChange?.('');
    } else {
      setInternalValue('');
      onChange?.('');
    }
  }, [controlledValue, onChange]);

  const handleSubmit = useCallback(() => {
    if (value) {
      onSubmit?.(value);
    }
  }, [value, onSubmit]);

  // Keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === '.' && allowDecimal) {
        handleDigit('.');
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDigit, handleBackspace, handleSubmit, handleClear, allowDecimal]);

  const displayValue = masked
    ? '●'.repeat(value.length)
    : value;

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimal ? '.' : 'C', '0', '⌫'],
  ];

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Display */}
      <div className="bg-cream-dark rounded-card px-5 py-4 text-center min-h-[60px] flex items-center justify-center">
        <span className={`font-sans font-bold tracking-widest ${value ? 'text-espresso text-3xl' : 'text-brown/40 text-2xl'}`}>
          {displayValue || (masked ? '● ● ● ●' : '0')}
        </span>
      </div>

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-2">
        {keys.flat().map((key) => (
          <button
            key={key}
            type="button"
            className={`
              numpad-key
              ${key === '⌫'
                ? 'bg-brown/10 text-brown hover:bg-brown/20'
                : key === 'C'
                  ? 'bg-crimson/10 text-crimson hover:bg-crimson/20'
                  : 'bg-cream-card text-espresso hover:bg-cream-dark shadow-soft'
              }
            `}
            onClick={() => {
              if (key === '⌫') handleBackspace();
              else if (key === 'C') handleClear();
              else handleDigit(key);
            }}
            aria-label={key === '⌫' ? 'Backspace' : key === 'C' ? 'Clear' : key}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Submit button */}
      {onSubmit && (
        <button
          type="button"
          className="btn-primary w-full text-lg py-4 mt-1"
          onClick={handleSubmit}
          disabled={!value}
          aria-label="Submit"
        >
          {submitLabel}
        </button>
      )}
    </div>
  );
}
