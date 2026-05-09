import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useFormValidation, { required, minLength, max, email } from './useFormValidation';

describe('useFormValidation Hook', () => {
  it('built-in validators should work correctly', () => {
    // required
    expect(required()('hello')).toBeNull();
    expect(required()('')).toBe('Trường này là bắt buộc');
    expect(required()(null)).toBe('Trường này là bắt buộc');

    // minLength
    expect(minLength(3)('abc')).toBeNull();
    expect(minLength(3)('ab')).toBe('Tối thiểu 3 ký tự');
    
    // max
    expect(max(10)('5')).toBeNull();
    expect(max(10)('15')).toBe('Tối đa 10');

    // email
    expect(email()('test@example.com')).toBeNull();
    expect(email()('invalid-email')).toBe('Email không hợp lệ');
  });

  it('should initialize correctly', () => {
    const rules = { name: [required()] };
    const { result } = renderHook(() => useFormValidation({ rules }));
    
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
    expect(result.current.isValid).toBe(true);
  });

  it('should validate all fields', () => {
    const rules = { 
      name: [required()],
      age: [max(100, 'Too old')]
    };
    const { result } = renderHook(() => useFormValidation({ rules }));
    
    act(() => {
      result.current.validate({ name: '', age: 105 });
    });

    expect(result.current.errors).toEqual({
      name: 'Trường này là bắt buộc',
      age: 'Too old'
    });
    expect(result.current.isValid).toBe(false);
  });

  it('should touch and validate single field via getFieldProps', () => {
    const rules = { name: [required()] };
    const { result } = renderHook(() => useFormValidation({ rules }));
    
    const onChangeMock = vi.fn();
    const props = result.current.getFieldProps('name', '', onChangeMock);

    // Call blur to touch it
    act(() => {
      props.onBlur();
    });

    expect(result.current.touched.name).toBe(true);
    expect(result.current.hasError('name')).toBe(true);
    expect(result.current.getError('name')).toBe('Trường này là bắt buộc');

    // Call onChange with valid value using fresh props
    act(() => {
      result.current.getFieldProps('name', '', onChangeMock).onChange({ target: { value: 'Valid Name' } });
    });

    expect(onChangeMock).toHaveBeenCalledWith('Valid Name');
    expect(result.current.hasError('name')).toBe(false);
  });

  it('should touch all fields', () => {
    const rules = { a: [], b: [], c: [] };
    const { result } = renderHook(() => useFormValidation({ rules }));
    
    act(() => {
      result.current.touchAll();
    });

    expect(result.current.touched).toEqual({ a: true, b: true, c: true });
  });

  it('should reset state', () => {
    const rules = { name: [required()] };
    const { result } = renderHook(() => useFormValidation({ rules }));
    
    act(() => {
      result.current.touchAll();
      result.current.validate({ name: '' });
    });

    expect(result.current.isValid).toBe(false);

    act(() => {
      result.current.reset();
    });

    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
    expect(result.current.isValid).toBe(true);
  });
});
