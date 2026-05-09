// hooks/useFormValidation.js — [UX-04 N18] Lightweight form validation
//
// Vấn đề UX-04: Mix HTML5 `required` + JS validate thủ công ở mỗi component.
// Mỗi form tự viết check riêng → không nhất quán, lặp code (vi phạm DRY).
//
// Giải pháp: Hook đơn giản, KHÔNG cần Yup/Zod (YAGNI — personal project).
// Cung cấp interface nhất quán:
//   - validate(values) → errors object
//   - touched tracking → chỉ hiện lỗi field đã interact
//   - helpers: getFieldProps, getError, hasError
//
// Usage example:
//   const { validate, errors, touched, touch, getError, hasError } = useFormValidation({
//     rules: {
//       name:     [required(), minLength(2)],
//       email:    [required(), email()],
//       quantity: [required(), min(1), integer()],
//     }
//   });
//
//   // Khi submit:
//   const errs = validate(formValues);
//   if (Object.keys(errs).length > 0) return; // có lỗi
//
//   // Trong JSX field:
//   <input {...getFieldProps('name')} />
//   {hasError('name') && <div className="form-error">{getError('name')}</div>}

import { useState, useCallback } from 'react';

// ── Built-in validators ────────────────────────────────────────────
export const required = (msg = 'Trường này là bắt buộc') =>
  (v) => (v === null || v === undefined || String(v).trim() === '') ? msg : null;

export const minLength = (n, msg) =>
  (v) => v && String(v).trim().length < n ? (msg || `Tối thiểu ${n} ký tự`) : null;

export const maxLength = (n, msg) =>
  (v) => v && String(v).trim().length > n ? (msg || `Tối đa ${n} ký tự`) : null;

export const min = (n, msg) =>
  (v) => v !== '' && v !== null && v !== undefined && Number(v) < n ? (msg || `Tối thiểu ${n}`) : null;

export const max = (n, msg) =>
  (v) => v !== '' && v !== null && v !== undefined && Number(v) > n ? (msg || `Tối đa ${n}`) : null;

export const integer = (msg = 'Phải là số nguyên') =>
  (v) => v !== '' && v !== null && v !== undefined && !Number.isInteger(Number(v)) ? msg : null;

export const positive = (msg = 'Phải là số dương') =>
  (v) => v !== '' && v !== null && v !== undefined && Number(v) <= 0 ? msg : null;

export const email = (msg = 'Email không hợp lệ') =>
  (v) => v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? msg : null;

export const pattern = (regex, msg = 'Định dạng không hợp lệ') =>
  (v) => v && !regex.test(String(v)) ? msg : null;

export const oneOf = (values, msg) =>
  (v) => v && !values.includes(v) ? (msg || `Phải là một trong: ${values.join(', ')}`) : null;

// ── Hook ──────────────────────────────────────────────────────────
/**
 * @param {{ rules: Record<string, Function[]> }} config
 * rules: { fieldName: [validator1, validator2, ...] }
 */
export default function useFormValidation({ rules = {} } = {}) {
  const [errors,  setErrors]  = useState({});
  const [touched, setTouched] = useState({});

  /**
   * Validate all fields, returns error map.
   * Also updates `errors` state.
   * @param {Record<string, any>} values
   * @returns {Record<string, string>} errors
   */
  const validate = useCallback((values) => {
    const errs = {};
    for (const [field, validators] of Object.entries(rules)) {
      const value = values[field];
      for (const validator of (validators || [])) {
        const msg = validator(value);
        if (msg) { errs[field] = msg; break; } // first error wins per field
      }
    }
    setErrors(errs);
    return errs;
  }, [rules]);

  /**
   * Validate a single field (on blur/change).
   */
  const validateField = useCallback((field, value) => {
    const validators = rules[field] || [];
    for (const validator of validators) {
      const msg = validator(value);
      if (msg) {
        setErrors(prev => ({ ...prev, [field]: msg }));
        return msg;
      }
    }
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
    return null;
  }, [rules]);

  /** Mark field as touched (called onBlur) */
  const touch = useCallback((field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  /** Mark all fields touched (before submit) */
  const touchAll = useCallback(() => {
    const all = {};
    for (const k of Object.keys(rules)) all[k] = true;
    setTouched(all);
  }, [rules]);

  /** Reset validation state */
  const reset = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  /** Get error string for field (only if touched) */
  const getError = useCallback((field) => {
    return touched[field] ? (errors[field] || null) : null;
  }, [errors, touched]);

  /** Returns true if field is touched AND has an error */
  const hasError = useCallback((field) => {
    return !!(touched[field] && errors[field]);
  }, [errors, touched]);

  /**
   * Spread props for a controlled input field.
   * Handles onChange, onBlur, and aria-invalid.
   * @param {string} field
   * @param {any} value
   * @param {Function} onChange - (value) => void
   */
  const getFieldProps = useCallback((field, value, onChange) => ({
    value,
    onChange: (e) => {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      onChange(v);
      if (touched[field]) validateField(field, v);
    },
    onBlur: () => {
      touch(field);
      validateField(field, value);
    },
    'aria-invalid': hasError(field) || undefined,
    className: hasError(field) ? 'form-control is-invalid' : 'form-control',
  }), [touched, validateField, touch, hasError]);

  return {
    errors,
    touched,
    validate,
    validateField,
    touch,
    touchAll,
    reset,
    getError,
    hasError,
    getFieldProps,
    isValid: Object.keys(errors).length === 0,
  };
}
