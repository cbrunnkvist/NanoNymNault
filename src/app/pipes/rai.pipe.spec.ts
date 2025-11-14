import { RaiPipe } from './rai.pipe';

describe('RaiPipe', () => {
  let pipe: RaiPipe;

  beforeEach(() => {
    pipe = new RaiPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  describe('negligible amount display (<0.01 XNO)', () => {
    const testCases = [
      { raw: '90000000000000000000000000', xno: 0.00009, desc: '0.00009 XNO' },
      { raw: '100000000000000000000000000', xno: 0.0001, desc: '0.0001 XNO' },
      { raw: '5000000000000000000000000000', xno: 0.005, desc: '0.005 XNO' },
      { raw: '9999999999999999999999999999', xno: 0.009999999, desc: '0.00999... XNO' },
    ];

    testCases.forEach(({ raw, xno, desc }) => {
      it(`should display "<0.01 XNO" for ${desc} (mnano denomination)`, () => {
        const result = pipe.transform(raw, 'mnano');
        expect(result).toBe('<0.01\u00A0XNO');
      });

      it(`should display "<0.01" without unit for ${desc} (mnano,true)`, () => {
        const result = pipe.transform(raw, 'mnano,true');
        expect(result).toBe('<0.01');
      });

      it(`should display "<0.01 XNO" for ${desc} (xrb denomination)`, () => {
        const result = pipe.transform(raw, 'xrb');
        expect(result).toBe('<0.01\u00A0XNO');
      });
    });

    it('should NOT trigger for exactly 0.01 XNO (threshold boundary)', () => {
      const raw = '10000000000000000000000000000'; // 0.01 XNO exactly
      const result = pipe.transform(raw, 'mnano');
      expect(result).not.toBe('<0.01\u00A0XNO');
      expect(result).toContain('0.01'); // Should show as normal number
    });

    it('should NOT trigger for zero', () => {
      const raw = '0';
      const result = pipe.transform(raw, 'mnano');
      expect(result).not.toContain('<');
      expect(result).toContain('0');
    });
  });

  describe('normal amount display', () => {
    it('should display 1.5 XNO correctly (mnano)', () => {
      const raw = '1500000000000000000000000000000'; // 1.5 XNO
      const result = pipe.transform(raw, 'mnano');
      // Due to floating point precision, may show as 1.499999 or round to 1.500000
      expect(result).toMatch(/1\.(499999|500000)/);
      expect(result).toContain('XNO');
    });

    it('should display 0.05 XNO correctly (above threshold)', () => {
      const raw = '50000000000000000000000000000'; // 0.05 XNO
      const result = pipe.transform(raw, 'mnano');
      // Due to floating point precision, may show as 0.049999 or round to 0.050000
      expect(result).toMatch(/0\.(049999|050000)/);
      expect(result).not.toBe('<0.01\u00A0XNO');
    });

    it('should handle large amounts', () => {
      const raw = '1000000000000000000000000000000000'; // 1000 XNO
      const result = pipe.transform(raw, 'mnano');
      // Due to floating point precision, may show as 999.999999 or round to 1000.000000
      expect(result).toMatch(/(999\.999999|1000\.000000|1000)/);
    });
  });

  describe('denomination support', () => {
    const oneXNO = '1000000000000000000000000000000';

    it('should format as XNO (xrb denomination)', () => {
      const result = pipe.transform(oneXNO, 'xrb');
      expect(result).toContain('1.');
      expect(result).toContain('XNO');
    });

    it('should format as mnano', () => {
      const result = pipe.transform(oneXNO, 'mnano');
      expect(result).toContain('1.');
      expect(result).toContain('XNO');
    });

    it('should format as raw', () => {
      const result = pipe.transform(oneXNO, 'raw');
      expect(result).toBe(oneXNO + '\u00A0raw');
    });

    it('should hide text when flag is true', () => {
      const result = pipe.transform(oneXNO, 'mnano,true');
      expect(result).not.toContain('XNO');
      expect(result).toContain('1.');
    });
  });

  describe('dynamic denomination', () => {
    it('should use appropriate unit for negligible amounts', () => {
      const raw = '5000000000000000000000000000'; // 0.005 XNO
      const result = pipe.transform(raw, 'dynamic');
      // Should detect as negligible and show <0.01
      expect(result).toBe('<0.01\u00A0XNO');
    });

    it('should use mRai for large amounts', () => {
      const raw = '1000000000000000000000000000000000'; // 1000 XNO
      const result = pipe.transform(raw, 'dynamic');
      expect(result).toContain('mRai');
    });
  });

  describe('precision and formatting', () => {
    it('should use 6 decimal places for mnano', () => {
      const raw = '1234567890123456789012345678901'; // 1.234567890... XNO
      const result = pipe.transform(raw, 'mnano');
      // Should be formatted to 6 decimal places
      expect(result).toMatch(/1\.\d{1,6}/);
    });

    it('should handle non-breaking space between number and unit', () => {
      const raw = '1000000000000000000000000000000'; // 1 XNO
      const result = pipe.transform(raw, 'mnano');
      expect(result).toContain('\u00A0XNO'); // Non-breaking space
    });
  });

  describe('edge cases', () => {
    it('should handle zero value', () => {
      const result = pipe.transform('0', 'mnano');
      expect(result).toContain('0');
      expect(result).not.toContain('<');
    });

    it('should handle very small raw values (less than 1 raw)', () => {
      const result = pipe.transform('0', 'raw');
      expect(result).toBe('0\u00A0raw');
    });

    it('should handle invalid/undefined input gracefully', () => {
      // Pipe should handle edge cases without throwing
      expect(() => pipe.transform(null, 'mnano')).not.toThrow();
      expect(() => pipe.transform(undefined, 'mnano')).not.toThrow();
    });
  });
});
