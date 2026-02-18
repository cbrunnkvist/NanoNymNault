# Angular Modernization Analysis

> **Status**: Analyzed February 2026
> **Angular Version**: 17.3.12
> **RxJS Version**: 6.5.5 (severely outdated)

This document catalogs Angular best practice violations and modernization opportunities. Each item can be addressed independently in separate sessions.

---

## Executive Summary

The codebase has **significant technical debt** from legacy Angular patterns. While the application functions correctly, there are:

- **3 critical architecture issues** (NgModule, RxJS version, memory leaks)
- **3 high-priority performance issues** (change detection, signals, DI)
- **1 medium priority maintainability issue** (type safety)

**Estimated effort**: 3-5 sessions for core fixes, 2-3 additional sessions for full modernization.

---

## 🔴 Critical Issues

### 1. NgModule Instead of Standalone Components

**Location**: `src/app/app.module.ts`

**Current State**:
- 31 components declared in a single `AppModule`
- No components use `standalone: true`
- All components, pipes, and directives declared in `declarations` array

**Why This Matters**:
- Angular 14+ deprecated NgModules in favor of standalone components
- Angular 18+ will require standalone components
- Standalone components reduce boilerplate and improve tree-shaking
- Easier lazy loading and code splitting

**Components Affected**: All 31 components in `app.module.ts` (lines 76-115)

**Recommendation**:
```
Phase 1: Start with leaf components (helpers, pipes)
Phase 2: Migrate service-provided components 
Phase 3: Migrate routing components
Phase 4: Remove app.module.ts entirely
```

---

### 2. RxJS Version: 6.5.5 (Incompatible)

**Location**: `package.json` lines 89-90

**Current State**:
```json
"rxjs": "^6.5.5",
"rxjs-compat": "^6.5.5"
```

**Why This Matters**:
- Angular 17 requires RxJS 6.6+ minimum
- RxJS 7.x provides: `firstValueFrom`, `lastValueFrom`, better types
- `rxjs-compat` adds ~30KB bundle size overhead
- Missing modern operators and pipe improvements

**Recommendation**:
```bash
npm install rxjs@^7.8.0
npm uninstall rxjs-compat
```

**Migration Notes**:
- Most code will work without changes
- Check for deprecated `subscribe()` signatures
- Remove any `Observable.prototype` extensions

---

### 3. Memory Leaks: Missing Subscription Cleanup

**Location**: Multiple components

**Current State**: 52 `.subscribe()` calls across 22 files, but only 6 files have cleanup.

| File | Subscriptions | Has Cleanup? |
|------|---------------|--------------|
| `change-rep-widget.component.ts` | 5 | ❌ NO |
| `wallet-widget.component.ts` | 3 | ❌ NO |
| `app.component.ts` | 3 | ❌ NO |
| `sign.component.ts` | 1+ | ❌ NO |
| `manage-wallet.component.ts` | 1+ | ❌ NO |
| `representatives.component.ts` | 1+ | ❌ NO |

**Example of the Problem** (`change-rep-widget.component.ts`):
```typescript
// Lines 31-62: Subscriptions never cleaned up
this.repService.walletReps$.subscribe(async reps => { ... });
this.walletService.wallet.selectedAccount$.subscribe(async acc => { ... });
this.walletService.wallet.newWallet$.subscribe(shouldReload => { ... });
this.blockService.newOpenBlock$.subscribe(async shouldReload => { ... });
this.repService.changeableReps$.subscribe(async reps => { ... });

// No ngOnDestroy! These subscriptions live forever.
```

**Recommendation**:
```typescript
// Use DestroyRef (Angular 16+)
constructor(private destroyRef: DestroyRef) {
  this.walletService.wallet.selectedAccount$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(...);
}

// Or use takeUntil with Subject (legacy but reliable)
private destroy$ = new Subject<void>();

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

---

## 🟠 High Priority Issues

### 4. No Change Detection Strategy

**Current State**: 0 components use `ChangeDetectionStrategy.OnPush`

**Why This Matters**:
- Default change detection runs on every browser event (click, hover, scroll)
- OnPush only runs when `@Input()` references change or events fire in component
- Can improve performance 2-10x for complex views

**Example** (`send.component.ts`):
```typescript
// CURRENT - Runs on EVERY change in the entire app
@Component({
  selector: 'app-send',
  templateUrl: './send.component.html',
})
export class SendComponent implements OnInit { }

// RECOMMENDED - Runs only when inputs change or events fire
@Component({
  selector: 'app-send',
  templateUrl: './send.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendComponent implements OnInit { 
  constructor(private cdr: ChangeDetectorRef) {}
}
```

**Recommendation**: Prioritize components with heavy computations or frequent updates.

---

### 5. No Angular Signals Usage

**Current State**: Zero signals in the codebase

**Why This Matters**:
- Angular Signals (Angular 16+) provide finer-grained reactivity
- Simpler mental model than RxJS BehaviorSubject + subscriptions
- Better performance for synchronous state updates

**Migration Example**:
```typescript
// CURRENT (RxJS)
export class SendComponent {
  amount = new BehaviorSubject<string>('');
  
  getAmount(): string {
    return this.amount.value;
  }
}

// WITH SIGNALS
export class SendComponent {
  amount = signal<string>('');
  
  getAmount(): string {
    return this.amount();
  }
}
```

**Recommendation**: Start with simple component state, keep RxJS for async operations.

---

### 6. Dependency Injection: Legacy Module Providers

**Location**: `src/app/app.module.ts` lines 128-152

**Current State**: 18 services provided in NgModule instead of `providedIn: 'root'`

**Services Missing `providedIn: 'root'`**:
- `UtilService`
- `WalletService`
- `NotificationService`
- `ApiService`
- `AddressBookService`
- `ModalService`
- `WorkPoolService`
- `AppSettingsService`
- `WebsocketService`
- `NanoBlockService`
- `PriceService`
- `PowService`
- `RepresentativeService`
- `NodeService`
- `LedgerService`
- `DesktopService`
- `RemoteSignService`
- `NinjaService`

**Why This Matters**:
- Services provided in module are eagerly instantiated
- `providedIn: 'root'` enables tree-shaking and lazy instantiation
- Makes testing easier (no need to provide in test module)

**Recommendation**:
```typescript
// CURRENT (app.module.ts)
providers: [
  WalletService,
  // ...
]

// RECOMMENDED (wallet.service.ts)
@Injectable({ providedIn: 'root' })
export class WalletService { }
```

**Note**: 10 services already use this pattern - just need to fix the remaining 18.

---

## 🟡 Medium Priority Issues

### 7. Type Safety: Excessive `any` Usage

**Current State**: 85+ `any` type usages across 31 files

**Examples**:
```typescript
// send.component.ts
fromAccount: any = {};
fromAccountID: any = "";
selectedStealthAccounts: any[] = [];

// wallet.service.ts  
secret: any;
keyPair: any;

// account-details.component.ts
account: any = {};
transaction: any = {};
```

**Recommendation**: Define proper interfaces for common types.

```typescript
// types/wallet-account.types.ts
export interface WalletAccountInfo {
  id: string;
  frontier: string | null;
  secret: Uint8Array;
  keyPair: KeyPair;
  index: number;
  balance: BigNumber;
  // ...
}
```

---

## ✅ What's Already Done Well

- 10 services correctly use `providedIn: 'root'`
- 6 components have proper `ngOnDestroy` cleanup
- Using modern Angular 17.3.x framework packages
- Proper use of Reactive Forms module
- Using ng-bootstrap (modern Angular UI library)
- Using Transloco for internationalization

---

## 📋 Prioritized Action Items

### Session 1: Fix Memory Leaks (High Impact, Low Risk)

- [ ] Add `ngOnDestroy` + subscription cleanup to `change-rep-widget.component.ts`
- [ ] Add `ngOnDestroy` + subscription cleanup to `wallet-widget.component.ts`
- [ ] Add `ngOnDestroy` + subscription cleanup to `app.component.ts`
- [ ] Add `ngOnDestroy` + subscription cleanup to `sign.component.ts`
- [ ] Add `ngOnDestroy` + subscription cleanup to `manage-wallet.component.ts`
- [ ] Add `ngOnDestroy` + subscription cleanup to `representatives.component.ts`

### Session 2: Update RxJS (Medium Impact, Low Risk)

- [ ] Update RxJS from 6.5.5 to 7.x in package.json
- [ ] Remove rxjs-compat dependency
- [ ] Run tests to verify nothing broke
- [ ] Check for any deprecated operator usage

### Session 3: Add OnPush Change Detection (High Impact, Medium Risk)

- [ ] Add OnPush to helper components (nano-identicon, nano-account-id, etc.)
- [ ] Add OnPush to presentation components (notifications, address-book)
- [ ] Add OnPush to heavy computational components (accounts, send, receive)
- [ ] Test thoroughly - OnPush can break apps that mutate state incorrectly

### Session 4: Fix Service DI (Medium Impact, Low Risk)

- [ ] Add `providedIn: 'root'` to remaining 18 services
- [ ] Remove from app.module.ts providers array (after all added)

### Session 5+: Type Safety Improvements (Ongoing)

- [ ] Define WalletAccountInfo interface
- [ ] Define TransactionInfo interface  
- [ ] Replace `any` with proper types across components
- [ ] Consider strict mode in tsconfig

### Session N: Standalone Components (Large Effort)

- [ ] Create migration plan (see Phase recommendations in Issue #1)
- [ ] Start with leaf components (pipes, helpers)
- [ ] Progress through components by dependency depth
- [ ] Remove app.module.ts once all migrated

---

## References

- [Angular Standalone Components Guide](https://angular.io/guide/standalone-components)
- [RxJS 7 Migration Guide](https://rxjs.dev/guide/v7/migration)
- [Angular Signals](https://angular.io/guide/signals)
- [Change Detection Strategies](https://angular.io/api/core/ChangeDetectionStrategy)
- [Angular DI Guide](https://angular.io/guide/dependency-injection)

---

## Notes for AI Assistants

- **Critical invariant**: None of these changes should affect the core NanoNym workflow (Send → Receive → Spend)
- **Test after each session**: Run `npm test` before and after changes
- **Incremental approach**: Do NOT attempt all changes in one session
- **Watch for BehaviorSubject leaks**: The wallet service has many - ensure cleanup is added