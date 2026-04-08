import { TestBed } from '@angular/core/testing';
import { Observable, of, from } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { map, filter, toArray } from 'rxjs/operators';

describe('RxJS upgrade regression tests', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('Observable creation and subscription', (done) => {
    const values: number[] = [];
    const obs = new Observable<number>((subscriber) => {
      [1, 2, 3].forEach((n) => subscriber.next(n));
      subscriber.complete();
    });

    obs.subscribe({
      next: (v) => values.push(v),
      error: () => done.fail('unexpected error'),
      complete: () => {
        expect(values).toEqual([1, 2, 3]);
        done();
      },
    });
  });

  it('firstValueFrom should resolve to first emitted value', async () => {
    const src$ = of('a', 'b', 'c');
    const val = await firstValueFrom(src$);
    expect(val).toBe('a');
  });

  it('RxJS 7 operators: map and filter produce expected sequence', (done) => {
    from([1, 2, 3, 4]).pipe(
      map((x) => x * 2),
      filter((x) => x > 4),
      toArray()
    ).subscribe({
      next: (arr) => {
        expect(arr).toEqual([6, 8]);
      },
      error: (err) => done.fail(err),
      complete: () => done(),
    });
  });
});
