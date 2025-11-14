import { AmountSplitPipe } from './amount-split.pipe';

describe('AmountSplitPipe', () => {
  let pipe: AmountSplitPipe;

  beforeEach(() => {
    pipe = new AmountSplitPipe();
  });

  describe('handling negligible amounts (< 0.01 XNO)', () => {
    it('should return full "<0.01 XNO" for integer part (index 0)', () => {
      const result = pipe.transform('<0.01 XNO', 0);
      expect(result).toBe('<0.01 XNO');
    });

    it('should return full "<0.01" without unit for integer part (index 0)', () => {
      const result = pipe.transform('<0.01', 0);
      expect(result).toBe('<0.01');
    });

    it('should return empty string for fractional part (index 1) when amount is negligible', () => {
      const result = pipe.transform('<0.01 XNO', 1);
      expect(result).toBe('');
    });

    it('should handle "<0" format (fallback)', () => {
      const result0 = pipe.transform('<0', 0);
      const result1 = pipe.transform('<0', 1);

      expect(result0).toBe('<0');
      expect(result1).toBe('');
    });

    it('should preserve non-breaking space in negligible amount', () => {
      const resultWithNBSP = pipe.transform('<0.01\u00A0XNO', 0);
      expect(resultWithNBSP).toBe('<0.01\u00A0XNO');
    });
  });

  describe('handling normal amounts', () => {
    it('should split integer part correctly', () => {
      const result = pipe.transform('123.456789', 0);
      expect(result).toBe('123');
    });

    it('should split fractional part correctly', () => {
      const result = pipe.transform('123.456789', 1);
      expect(result).toBe('.456789');
    });

    it('should strip trailing zeros from fractional part', () => {
      const result = pipe.transform('123.450000', 1);
      expect(result).toBe('.45');
    });

    it('should return empty string for fractional part when no decimal', () => {
      const result = pipe.transform('123', 1);
      expect(result).toBe('');
    });

    it('should handle whole numbers (integer only)', () => {
      const result = pipe.transform('100', 0);
      expect(result).toBe('100');
    });
  });

  describe('edge cases', () => {
    it('should handle zero value', () => {
      const result0 = pipe.transform('0', 0);
      const result1 = pipe.transform('0', 1);

      expect(result0).toBe('0');
      expect(result1).toBe('');
    });

    it('should handle very small fractional values', () => {
      const result = pipe.transform('0.000001', 1);
      expect(result).toBe('.000001');
    });

    it('should remove BTC prefix from integer part', () => {
      const result = pipe.transform('BTC 123.456', 0);
      expect(result).toBe('123'); // BTC should be removed, only integer part returned
    });
  });
});
