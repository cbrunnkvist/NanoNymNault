import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'rai'
})
export class RaiPipe implements PipeTransform {
  precision = 6;

  mrai = 1000000000000000000000000000000;
  krai = 1000000000000000000000000000;
  rai  = 1000000000000000000000000;

  transform(value: any, args?: any): any {
    // Handle null/undefined gracefully
    if (value == null) {
      return '0';
    }

    const opts = args.split(',');
    const denomination = opts[0] || 'mrai';
    const hideText = opts[1] || false;

    switch (denomination.toLowerCase()) {
      default:
      case 'xrb':
        const xrbValue = value / this.mrai;
        // Check raw value directly to avoid floating point precision loss
        // 10^28 raw = 0.01 XNO, so anything < 10^28 raw is < 0.01 XNO
        // Use BigInt for precise comparison of large numbers
        const rawThreshold = BigInt('10000000000000000000000000000'); // 0.01 XNO in raw
        // Convert to string first to preserve precision, then to BigInt
        const valueStr = typeof value === 'string' ? value : value.toString().split('.')[0];
        const valueBigInt = BigInt(valueStr);
        if (valueBigInt > 0 && valueBigInt < rawThreshold) {
          return hideText ? '<0.01' : '<0.01\u00A0XNO';
        }
        return `${xrbValue.toFixed(6)}${!hideText ? '\u00A0XNO' : ''}`;
      case 'mnano':
        const hasRawValue = (value / this.rai) % 1;
        const rawThresholdMnano = BigInt('10000000000000000000000000000'); // 0.01 XNO in raw
        // Convert to string first to preserve precision, then to BigInt
        const valueStrMnano = typeof value === 'string' ? value : value.toString().split('.')[0];
        const valueBigIntMnano = BigInt(valueStrMnano);
        if (hasRawValue) {
          // Handle negligible amounts: show "<0.01 XNO" instead of rounding to 0
          const xnoValue = value / this.mrai;
          // Check raw value directly using BigInt to avoid floating point precision loss
          if (valueBigIntMnano > 0 && valueBigIntMnano < rawThresholdMnano) {
            return hideText ? '<0.01' : '<0.01\u00A0XNO';
          }
          const newVal = xnoValue < 0.000001 ? 0 : xnoValue;
          return `${this.toFixed(newVal, this.precision)}${!hideText ? '\u00A0XNO' : ''}`;
        } else {
          const xnoValue = value / this.mrai;
          // Check raw value directly using BigInt to avoid floating point precision loss
          if (valueBigIntMnano > 0 && valueBigIntMnano < rawThresholdMnano) {
            return hideText ? '<0.01' : '<0.01\u00A0XNO';
          }
          return `${(value / this.mrai).toFixed(6)}${!hideText ? '\u00A0XNO' : ''}`;
        }
      case 'knano': return `${(value / this.krai).toFixed(3)}${!hideText ? '\u00A0knano' : ''}`;
      case 'nano': return `${(value / this.rai).toFixed(0)}${!hideText ? '\u00A0nano' : ''}`;
      case 'raw': return `${value}${!hideText ? '\u00A0raw' : ''}`;
      case 'dynamic':
        const rai = (value / this.rai);
        // Check for negligible amounts first (applies to all denominations)
        // Check raw value directly using BigInt to avoid floating point precision loss
        const rawThresholdDynamic = BigInt('10000000000000000000000000000'); // 0.01 XNO in raw
        // Convert to string first to preserve precision, then to BigInt
        const valueStrDynamic = typeof value === 'string' ? value : value.toString().split('.')[0];
        const valueBigIntDynamic = BigInt(valueStrDynamic);
        if (valueBigIntDynamic > 0 && valueBigIntDynamic < rawThresholdDynamic) {
          return hideText ? '<0.01' : '<0.01\u00A0XNO';
        }
        if (rai >= 1000000) {
          const mRaiValue = value / this.mrai;
          return `${mRaiValue.toFixed(this.precision)}${!hideText ? '\u00A0mRai' : ''}`;
        } else if (rai >= 1000) {
          return `${(value / this.krai).toFixed(this.precision)}${!hideText ? '\u00A0kRai' : ''}`;
        } else if (rai >= 0.00001) {
          return `${(value / this.rai).toFixed(this.precision)}${!hideText ? '\u00A0Rai' : ''}`;
        } else if (rai === 0) {
          return `${value}${!hideText ? '\u00A0mRai' : ''}`;
        } else {
          return `${value}${!hideText ? '\u00A0raw' : ''}`;
        }
    }
  }

  toFixed(num, fixed) {
    if (isNaN(num)) {
      return 0;
    }
    const re = new RegExp('^-?\\d+(?:\.\\d{0,' + (fixed || -1) + '})?');
    return num.toString().match(re)[0];
  }

}
