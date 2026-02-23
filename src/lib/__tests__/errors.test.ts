import { toErrorMessage } from '../errors';

describe('toErrorMessage', () => {
  describe('string errors', () => {
    it('should return the string directly', () => {
      expect(toErrorMessage('something went wrong')).toBe('something went wrong');
    });

    it('should return empty string for empty input', () => {
      expect(toErrorMessage('')).toBe('');
    });
  });

  describe('Error objects', () => {
    it('should extract message from Error instance', () => {
      expect(toErrorMessage(new Error('fail'))).toBe('fail');
    });

    it('should extract message from TypeError', () => {
      expect(toErrorMessage(new TypeError('type fail'))).toBe('type fail');
    });

    it('should extract message from RangeError', () => {
      expect(toErrorMessage(new RangeError('range fail'))).toBe('range fail');
    });
  });

  describe('objects with message property', () => {
    it('should extract message from plain object with string message', () => {
      expect(toErrorMessage({ message: 'obj error' })).toBe('obj error');
    });

    it('should fallback when message is a number', () => {
      expect(toErrorMessage({ message: 42 })).toBe('An unexpected error occurred');
    });

    it('should fallback when message is an object', () => {
      expect(toErrorMessage({ message: { nested: true } })).toBe('An unexpected error occurred');
    });
  });

  describe('null, undefined, and other types', () => {
    it('should return default fallback for null', () => {
      expect(toErrorMessage(null)).toBe('An unexpected error occurred');
    });

    it('should return default fallback for undefined', () => {
      expect(toErrorMessage(undefined)).toBe('An unexpected error occurred');
    });

    it('should return default fallback for a number', () => {
      expect(toErrorMessage(42)).toBe('An unexpected error occurred');
    });

    it('should return default fallback for boolean', () => {
      expect(toErrorMessage(true)).toBe('An unexpected error occurred');
    });
  });

  describe('custom fallback', () => {
    it('should use custom fallback when error is null', () => {
      expect(toErrorMessage(null, 'custom msg')).toBe('custom msg');
    });

    it('should use custom fallback when error is undefined', () => {
      expect(toErrorMessage(undefined, 'ops')).toBe('ops');
    });

    it('should NOT use fallback when error is a string', () => {
      expect(toErrorMessage('real error', 'fallback')).toBe('real error');
    });

    it('should NOT use fallback when error is an Error object', () => {
      expect(toErrorMessage(new Error('real'), 'fallback')).toBe('real');
    });
  });
});
