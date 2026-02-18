# Angular Critical Fixes

## TL;DR

> **Quick Summary**: Fix critical Angular technical debt: memory leaks in 6 components, upgrade RxJS 6.5.5 → 7.x, and modernize service DI by adding `providedIn: 'root'` to 18 services.
>
> **Deliverables**:
> - 6 components with proper subscription cleanup (DestroyRef pattern)
> - RxJS 7.8.0+ with rxjs-compat removed
> - 18 services converted to `providedIn: 'root'`
> - Regression tests for all changes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: RxJS upgrade (blocking) → Memory leak fixes → Service DI → Final verification

---

## Context

### Original Request
Based on docs/ANGULAR-MODERNIZATION.md, address critical Angular technical debt:
1. Memory leaks from 52 `.subscribe()` calls without cleanup
2. RxJS 6.5.5 (outdated, incompatible with Angular 17)
3. Legacy service DI in NgModule instead of `providedIn: 'root'`

### Interview Summary
**Key Discussions**:
- Fix ALL critical issues in one plan (memory leaks + RxJS + Service DI)
- Include automated tests for each fix
- High Accuracy Mode requested (Momus review)
- Must preserve Critical Invariant: "Send to NanoNym → Receive via Nostr → Stealth funds spendable and recoverable from seed alone"

**Research Findings**:
- package.json: "rxjs": "^6.5.5", "rxjs-compat": "^6.5.5" (lines 89-90)
- app.module.ts: 31 components in declarations, 18 services in providers
- 6 components confirmed missing `ngOnDestroy`:
  - change-rep-widget.component.ts (5 subscriptions)
  - wallet-widget.component.ts (3 subscriptions)
  - app.component.ts (router.events + versionUpdates subscriptions)
  - sign.component.ts
  - manage-wallet.component.ts
  - representatives.component.ts

### Metis Review
**Identified Gaps** (addressed in plan):
- Guardrails: No runtime behavior changes, bundle size monitoring
- Scope boundaries: NO Angular version upgrade, NO new features
- Critical Invariant protection: Wallet service priority, transaction component isolation
- Acceptance criteria: Memory leak verification, service singleton check

---

## Work Objectives

### Core Objective
Fix critical Angular technical debt while maintaining 100% runtime compatibility and preserving the NanoNym workflow invariant.

### Concrete Deliverables
1. **Memory Leak Fixes** (6 components):
   - `change-rep-widget.component.ts`
   - `wallet-widget.component.ts`
   - `app.component.ts`
   - `sign.component.ts`
   - `manage-wallet.component.ts`
   - `representatives.component.ts`

2. **RxJS Modernization**:
   - Upgrade to rxjs@^7.8.0
   - Remove rxjs-compat dependency
   - Fix any deprecated API usage

3. **Service DI Modernization** (18 services):
   - Add `providedIn: 'root'` to each service
   - Remove from app.module.ts providers array

4. **Regression Tests**:
   - Unit tests for subscription cleanup
   - Service DI verification tests
   - RxJS API compatibility tests

### Definition of Done
- [ ] `npm run build` completes without RxJS errors
- [ ] All 18 services have `providedIn: 'root'`
- [ ] All 6 components pass subscription cleanup tests
- [ ] Bundle size ≤ current +5%
- [ ] NanoNym workflow: Send → Receive → Spend verified working
- [ ] `npm run test` passes all tests
- [ ] `npm run e2e:pw` passes critical path tests

### Must Have
- Subscription cleanup using DestroyRef (Angular 16+ pattern)
- RxJS 7.8.0+ with zero breaking changes for existing code
- All services converted to tree-shakable pattern
- Tests for every component modified

### Must NOT Have (Guardrails)
- NO changes to component logic or behavior
- NO Angular version upgrades
- NO new features or functionality
- NO refactoring beyond the specified scope
- NO changes to the NanoNym send/receive/stealth workflow

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (jasmine/karma configured)
- **Automated tests**: YES (Tests after implementation)
- **Framework**: Karma/Jasmine + Playwright for e2e
- **Agent-Executed QA**: YES for all verification

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| Code Changes | Bash (git diff + tsc) | Compile check, import validation |
| Service DI | Bash (grep) | Verify `providedIn: 'root'` presence |
| Memory Leaks | Playwright | Component lifecycle tests, memory profiling |
| RxJS Upgrade | Bash (npm test) | Run full test suite |
| NanoNym Workflow | Playwright | End-to-end send/receive flow |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Blocking, must complete first):
├── Task 1: RxJS upgrade 6.5.5 → 7.8.0 [unspecified-high]
├── Task 2: RxJS compatibility fixes [quick]
└── Task 3: RxJS regression tests [quick]

Wave 2 (After Wave 1 - Memory leaks, MAX PARALLEL):
├── Task 4: Fix change-rep-widget memory leak [quick]
├── Task 5: Fix wallet-widget memory leak [quick]
├── Task 6: Fix app.component memory leak [quick]
├── Task 7: Fix sign.component memory leak [quick]
├── Task 8: Fix manage-wallet memory leak [quick]
└── Task 9: Fix representatives memory leak [quick]

Wave 3 (After Wave 1 - Service DI, MAX PARALLEL):
├── Task 10: Fix services 1-6 DI [quick]
├── Task 11: Fix services 7-12 DI [quick]
├── Task 12: Fix services 13-18 DI [quick]
└── Task 13: Update app.module.ts providers [quick]

Wave 4 (After Waves 2-3 - Verification):
├── Task 14: Memory leak verification tests [unspecified-high]
├── Task 15: Service DI verification [quick]
├── Task 16: Bundle size check [quick]
└── Task 17: NanoNym workflow e2e test [unspecified-high]

Wave FINAL (After ALL tasks - independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4-9 (any) → Task 14 → Task 17 → F1-F4
Parallel Speedup: ~60% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1-3 | — | 4-13, 14-17 | 1 |
| 4-9 | Task 1-3 | Task 14 | 2 |
| 10-13 | Task 1-3 | Task 15 | 3 |
| 14 | 4-9 | Task 17 | 4 |
| 15 | 10-13 | Task 17 | 4 |
| 17 | 14-15 | F1-F4 | 4 |
| F1-F4 | 1-17 | — | FINAL |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **3** | T1-T3 → `unspecified-high`/`quick` |
| 2 | **6** | T4-T9 → `quick` |
| 3 | **4** | T10-T13 → `quick` |
| 4 | **4** | T14-T17 → `unspecified-high`/`quick` |
| FINAL | **4** | F1-F4 → `oracle`/`unspecified-high`/`deep` |

---

## TODOs

- [ ] 1. Upgrade RxJS from 6.5.5 to 7.8.0+

  **What to do**:
  - Update package.json: change `"rxjs": "^6.5.5"` to `"rxjs": "^7.8.0"`
  - Remove `"rxjs-compat": "^6.5.5"` from dependencies
  - Run `nvm exec npm ci` to install updated dependencies
  - Verify installation with `nvm exec npm ls rxjs`

  **Must NOT do**:
  - Do not change any other dependencies
  - Do not upgrade Angular framework packages
  - Do not run `npm install` (use `npm ci` to respect lock file)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (dependency management requires care)
  - **Skills**: None needed (standard npm operations)

  **Parallelization**:
  - **Can Run In Parallel**: NO (blocks all other tasks)
  - **Parallel Group**: Wave 1 (foundation)
  - **Blocks**: Tasks 2-17, F1-F4
  - **Blocked By**: None (first task)

  **References**:
  - `package.json:89-90` - Current RxJS version specification
  - RxJS 7 migration guide: https://rxjs.dev/guide/v7/migration

  **Acceptance Criteria**:
  - [ ] package.json shows `"rxjs": "^7.8.0"` (or higher)
  - [ ] rxjs-compat removed from dependencies
  - [ ] `nvm exec npm ci` completes successfully
  - [ ] `nvm exec npm ls rxjs` shows version 7.8.0+

  **QA Scenarios**:
  ```
  Scenario: RxJS package upgraded
    Tool: Bash
    Preconditions: package.json has old rxjs version
    Steps:
      1. Read package.json lines 89-90
      2. Verify rxjs version is ^7.8.0
      3. Verify rxjs-compat is NOT in dependencies
      4. Run: nvm exec npm ls rxjs
    Expected Result: Shows rxjs@7.8.0 or higher
    Failure Indicators: Version still 6.x, rxjs-compat present, npm errors
    Evidence: .sisyphus/evidence/task-1-rxjs-version.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): upgrade rxjs 6.5.5 to 7.8.0`
  - Files: `package.json`, `package-lock.json`
  - Pre-commit: None (dependency change only)

- [ ] 2. Fix RxJS deprecated API usage

  **What to do**:
  - Search for deprecated `toPromise()` calls (use `firstValueFrom` instead)
  - Search for deprecated `subscribe()` signatures with multiple callbacks
  - Check for any `Observable.prototype` extensions
  - Update imports if any paths changed
  - Run `nvm exec npm run build` to verify compilation

  **Must NOT do**:
  - Do not change any logic or behavior
  - Do not modify component state management patterns
  - Do not add new RxJS operators unless required for compatibility

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - RxJS 7 breaking changes: https://rxjs.dev/guide/v7/migration#breaking-changes
  - Search patterns: `toPromise()`, `subscribe(next, error, complete)`

  **Acceptance Criteria**:
  - [ ] `nvm exec npm run build` completes without RxJS-related errors
  - [ ] No `toPromise()` calls remain (use grep to verify)
  - [ ] No deprecated subscribe signatures remain

  **QA Scenarios**:
  ```
  Scenario: RxJS deprecated APIs fixed
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: grep -r "toPromise()" src/ --include="*.ts"
      2. Run: grep -r "subscribe.*,.*,.*" src/ --include="*.ts" | grep -v "//"
      3. Run: nvm exec npm run build 2>&1 | tee build.log
    Expected Result: grep returns empty, build succeeds
    Failure Indicators: toPromise() found, build errors with RxJS
    Evidence: .sisyphus/evidence/task-2-rxjs-fixes.log
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `refactor(rxjs): migrate deprecated API usage for v7`
  - Files: Any modified .ts files
  - Pre-commit: `nvm exec npm run build`

- [ ] 3. Create RxJS regression tests

  **What to do**:
  - Create test file: `src/app/services/rxjs-upgrade.spec.ts`
  - Test that Observables still emit correctly
  - Test that subscriptions still work with new patterns
  - Run `nvm exec npm test` to verify tests pass

  **Must NOT do**:
  - Do not test component internals (test public API only)
  - Do not add tests for existing functionality not related to RxJS

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed (standard jasmine tests)

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - Existing test patterns in `src/app/**/*.spec.ts`

  **Acceptance Criteria**:
  - [ ] Test file created with at least 3 test cases
  - [ ] Tests cover Observable creation and subscription
  - [ ] `nvm exec npm test` passes

  **QA Scenarios**:
  ```
  Scenario: RxJS regression tests created
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Create test file with basic Observable tests
      2. Run: nvm exec npm test -- --grep="rxjs"
    Expected Result: Tests pass, no RxJS errors
    Failure Indicators: Test failures, RxJS errors
    Evidence: .sisyphus/evidence/task-3-rxjs-tests.log
  ```

  **Commit**: YES (groups with Task 1-2)
  - Message: `test(rxjs): add regression tests for RxJS v7 upgrade`
  - Files: `src/app/services/rxjs-upgrade.spec.ts`
  - Pre-commit: `nvm exec npm test -- --grep="rxjs"`

- [ ] 4. Fix memory leak: change-rep-widget.component.ts

  **What to do**:
  - Read `src/app/components/change-rep-widget/change-rep-widget.component.ts`
  - Add `DestroyRef` import from '@angular/core'
  - Inject `DestroyRef` in constructor
  - Add `.pipe(takeUntilDestroyed(this.destroyRef))` to all 5 subscriptions:
    - `repService.walletReps$.subscribe`
    - `walletService.wallet.selectedAccount$.subscribe`
    - `walletService.wallet.newWallet$.subscribe`
    - `blockService.newOpenBlock$.subscribe`
    - `repService.changeableReps$.subscribe`
  - Create test file to verify cleanup

  **Must NOT do**:
  - Do not change subscription logic or callback functions
  - Do not reorder ngOnInit statements
  - Do not add new functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 5-9)
  - **Blocks**: Task 14 (verification)
  - **Blocked By**: Tasks 1-3 (RxJS upgrade)

  **References**:
  - `src/app/components/change-rep-widget/change-rep-widget.component.ts:30-75` - Current subscription code
  - Angular DestroyRef docs: https://angular.io/api/core/DestroyRef
  - takeUntilDestroyed operator: https://angular.io/api/core/rxjs-interop/takeUntilDestroyed

  **Acceptance Criteria**:
  - [ ] All 5 subscriptions use `takeUntilDestroyed(this.destroyRef)`
  - [ ] Component implements OnDestroy no longer needed (DestroyRef handles automatically)
  - [ ] Test passes: component cleanup test

  **QA Scenarios**:
  ```
  Scenario: Subscriptions cleaned up on destroy
    Tool: Playwright
    Preconditions: Task 3 complete (RxJS stable)
    Steps:
      1. Navigate to page with change-rep-widget
      2. Verify component renders (waitForSelector)
      3. Navigate away (trigger destroy)
      4. Check console for any subscription errors
    Expected Result: No memory leaks, no console errors
    Failure Indicators: Console errors about destroyed subscriptions
    Evidence: .sisyphus/evidence/task-4-rep-widget-cleanup.png
  ```

  **Commit**: YES
  - Message: `fix(memory): add subscription cleanup to change-rep-widget`
  - Files: `src/app/components/change-rep-widget/change-rep-widget.component.ts`
  - Pre-commit: `nvm exec npm test -- --grep="change-rep"`

- [ ] 5. Fix memory leak: wallet-widget.component.ts

  **What to do**:
  - Read `src/app/components/wallet-widget/wallet-widget.component.ts`
  - Add `DestroyRef` injection
  - Add cleanup to 3 subscriptions:
    - `ledgerService.ledgerStatus$.subscribe`
    - `powService.powAlert$.subscribe`
    - `walletService.wallet.unlockModalRequested$.subscribe`
  - Note: Modal UIkit subscriptions are handled by UIkit internally

  **Must NOT do**:
  - Do not modify modal/UIkit event handlers
  - Do not change wallet unlock logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 1-3

  **References**:
  - `src/app/components/wallet-widget/wallet-widget.component.ts:37-63` - Subscription code

  **Acceptance Criteria**:
  - [ ] 3 RxJS subscriptions use `takeUntilDestroyed`
  - [ ] Modal functionality unchanged

  **QA Scenarios**:
  ```
  Scenario: Wallet widget subscriptions cleaned
    Tool: Playwright
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Navigate to page with wallet-widget
      2. Trigger unlock modal
      3. Navigate away
    Expected Result: No subscription errors, modal works
    Evidence: .sisyphus/evidence/task-5-wallet-widget-cleanup.png
  ```

  **Commit**: YES
  - Message: `fix(memory): add subscription cleanup to wallet-widget`
  - Files: `src/app/components/wallet-widget/wallet-widget.component.ts`
  - Pre-commit: Component test passes

- [ ] 6. Fix memory leak: app.component.ts

  **What to do**:
  - Read `src/app/app.component.ts`
  - Add `DestroyRef` injection
  - Add cleanup to subscriptions:
    - `router.events.subscribe` (constructor, line 49)
    - `updates.versionUpdates.pipe(...)` (2 subscriptions, lines 189-204)
    - `desktop.on('deeplink', ...)` - check if needs cleanup
  - Be careful: Router events are long-lived but component is root - still needs cleanup for hot reloading

  **Must NOT do**:
  - Do not change router navigation logic
  - Do not modify service worker update handling
  - Do not break deeplink functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 1-3

  **References**:
  - `src/app/app.component.ts:49` - Router events subscription
  - `src/app/app.component.ts:189-204` - Service worker subscriptions
  - `src/app/app.component.ts:183` - Deeplink handler

  **Acceptance Criteria**:
  - [ ] Router events subscription cleaned up
  - [ ] Service worker update subscriptions cleaned up
  - [ ] App still navigates correctly
  - [ ] Service worker updates still detected

  **QA Scenarios**:
  ```
  Scenario: App component subscriptions cleaned
    Tool: Playwright
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Load app
      2. Navigate between routes
      3. Verify no router subscription errors
    Expected Result: Navigation works, no console errors
    Evidence: .sisyphus/evidence/task-6-app-component-cleanup.png
  ```

  **Commit**: YES
  - Message: `fix(memory): add subscription cleanup to app.component`
  - Files: `src/app/app.component.ts`
  - Pre-commit: `nvm exec npm run build`

- [ ] 7. Fix memory leak: sign.component.ts

  **What to do**:
  - Read `src/app/components/sign/sign.component.ts`
  - Add `DestroyRef` injection
  - Add cleanup to any subscriptions found
  - Look for:
    - Route parameter subscriptions
    - BehaviorSubject subscriptions
    - Service subscriptions

  **Must NOT do**:
  - Do not change signing logic
  - Do not modify cryptographic operations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 1-3

  **References**:
  - `src/app/components/sign/sign.component.ts` - Full file analysis needed

  **Acceptance Criteria**:
  - [ ] All identified subscriptions use `takeUntilDestroyed`

  **QA Scenarios**:
  ```
  Scenario: Sign component subscriptions cleaned
    Tool: Bash (code review)
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Read sign.component.ts
      2. Verify takeUntilDestroyed on all subscriptions
      3. Run: nvm exec npm run build
    Expected Result: No errors, subscriptions cleaned
    Evidence: .sisyphus/evidence/task-7-sign-component.txt
  ```

  **Commit**: YES
  - Message: `fix(memory): add subscription cleanup to sign.component`
  - Files: `src/app/components/sign/sign.component.ts`
  - Pre-commit: Build passes

- [ ] 8. Fix memory leak: manage-wallet.component.ts

  **What to do**:
  - Read `src/app/components/manage-wallet/manage-wallet.component.ts`
  - Add `DestroyRef` injection
  - Add cleanup to any subscriptions found

  **Must NOT do**:
  - Do not change wallet management logic
  - Do not modify storage operations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 1-3

  **References**:
  - `src/app/components/manage-wallet/manage-wallet.component.ts`

  **Acceptance Criteria**:
  - [ ] All subscriptions use `takeUntilDestroyed`

  **QA Scenarios**:
  ```
  Scenario: Manage wallet subscriptions cleaned
    Tool: Bash (code review)
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Read manage-wallet.component.ts
      2. Verify takeUntilDestroyed on all subscriptions
      3. Run: nvm exec npm run build
    Expected Result: Build passes, subscriptions cleaned
    Evidence: .sisyphus/evidence/task-8-manage-wallet.txt
  ```

  **Commit**: YES
  - Message: `fix(memory): add subscription cleanup to manage-wallet`
  - Files: `src/app/components/manage-wallet/manage-wallet.component.ts`
  - Pre-commit: Build passes

- [ ] 9. Fix memory leak: representatives.component.ts

  **What to do**:
  - Read `src/app/components/representatives/representatives.component.ts`
  - Add `DestroyRef` injection
  - Add cleanup to any subscriptions found

  **Must NOT do**:
  - Do not change representative voting logic
  - Do not modify delegation calculations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 1-3

  **References**:
  - `src/app/components/representatives/representatives.component.ts`

  **Acceptance Criteria**:
  - [ ] All subscriptions use `takeUntilDestroyed`

  **QA Scenarios**:
  ```
  Scenario: Representatives subscriptions cleaned
    Tool: Bash (code review)
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Read representatives.component.ts
      2. Verify takeUntilDestroyed on all subscriptions
      3. Run: nvm exec npm run build
    Expected Result: Build passes, subscriptions cleaned
    Evidence: .sisyphus/evidence/task-9-representatives.txt
  ```

  **Commit**: YES
  - Message: `fix(memory): add subscription cleanup to representatives`
  - Files: `src/app/components/representatives/representatives.component.ts`
  - Pre-commit: Build passes

- [ ] 10. Fix Service DI: Services 1-6 (UtilService, WalletService, NotificationService, ApiService, AddressBookService, ModalService)

  **What to do**:
  - For each service, add `providedIn: 'root'` to @Injectable():
    - `src/app/services/util.service.ts`
    - `src/app/services/wallet.service.ts`
    - `src/app/services/notification.service.ts`
    - `src/app/services/api.service.ts`
    - `src/app/services/address-book.service.ts`
    - `src/app/services/modal.service.ts`
  - Change from `@Injectable()` to `@Injectable({ providedIn: 'root' })`
  - Verify no circular dependencies exist

  **Must NOT do**:
  - Do not change service logic or methods
  - Do not modify service constructors unless required
  - Do not change service method signatures

  **CRITICAL: WalletService** - This is CRITICAL for NanoNym workflow:
  - Test this FIRST before other services
  - Ensure wallet loading still works
  - Ensure NanoNym manager still functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 3 (with Tasks 11-13)
  - **Blocks**: Task 15 (DI verification)
  - **Blocked By**: Tasks 1-3

  **References**:
  - `src/app/services/*.service.ts` - Service files
  - `src/app/app.module.ts:128-152` - Current providers array

  **Acceptance Criteria**:
  - [ ] All 6 services have `providedIn: 'root'`
  - [ ] Services compile without errors
  - [ ] WalletService loads wallet correctly (test manually)

  **QA Scenarios**:
  ```
  Scenario: Services have providedIn root
    Tool: Bash
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Read each service file
      2. Verify: @Injectable({ providedIn: 'root' })
      3. Run: grep -r "@Injectable({ providedIn: 'root' }" src/app/services/ | wc -l
    Expected Result: Count shows 6 services updated
    Failure Indicators: Missing providedIn, compilation errors
    Evidence: .sisyphus/evidence/task-10-services-1-6.txt
  ```

  **Commit**: YES
  - Message: `refactor(services): add providedIn root to core services`
  - Files: `src/app/services/util.service.ts`, `src/app/services/wallet.service.ts`, `src/app/services/notification.service.ts`, `src/app/services/api.service.ts`, `src/app/services/address-book.service.ts`, `src/app/services/modal.service.ts`
  - Pre-commit: `nvm exec npm run build`

- [ ] 11. Fix Service DI: Services 7-12 (WorkPoolService, AppSettingsService, WebsocketService, NanoBlockService, PriceService, PowService)

  **What to do**:
  - Add `providedIn: 'root'` to:
    - `src/app/services/work-pool.service.ts`
    - `src/app/services/app-settings.service.ts`
    - `src/app/services/websocket.service.ts`
    - `src/app/services/nano-block.service.ts`
    - `src/app/services/price.service.ts`
    - `src/app/services/pow.service.ts`

  **Must NOT do**:
  - Do not change service logic
  - Do not break WebSocket connections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 1-3

  **Acceptance Criteria**:
  - [ ] All 6 services have `providedIn: 'root'`

  **QA Scenarios**:
  ```
  Scenario: Services 7-12 updated
    Tool: Bash
    Preconditions: Tasks 1-3, 10 complete
    Steps:
      1. Verify @Injectable({ providedIn: 'root' }) in each
      2. Run: nvm exec npm run build
    Expected Result: Build passes
    Evidence: .sisyphus/evidence/task-11-services-7-12.txt
  ```

  **Commit**: YES
  - Message: `refactor(services): add providedIn root to infrastructure services`
  - Files: The 6 service files listed above
  - Pre-commit: Build passes

- [ ] 12. Fix Service DI: Services 13-18 (RepresentativeService, NodeService, LedgerService, DesktopService, RemoteSignService, NinjaService)

  **What to do**:
  - Add `providedIn: 'root'` to:
    - `src/app/services/representative.service.ts`
    - `src/app/services/node.service.ts`
    - `src/app/services/ledger.service.ts`
    - `src/app/services/desktop.service.ts`
    - `src/app/services/remote-sign.service.ts`
    - `src/app/services/ninja.service.ts`

  **Must NOT do**:
  - Do not break Ledger integration
  - Do not break desktop app functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 1-3

  **Acceptance Criteria**:
  - [ ] All 6 services have `providedIn: 'root'`

  **QA Scenarios**:
  ```
  Scenario: Services 13-18 updated
    Tool: Bash
    Preconditions: Tasks 1-3, 10-11 complete
    Steps:
      1. Verify @Injectable({ providedIn: 'root' }) in each
      2. Run: nvm exec npm run build
    Expected Result: Build passes
    Evidence: .sisyphus/evidence/task-12-services-13-18.txt
  ```

  **Commit**: YES
  - Message: `refactor(services): add providedIn root to remaining services`
  - Files: The 6 service files listed above
  - Pre-commit: Build passes

- [ ] 13. Update app.module.ts providers array

  **What to do**:
  - Read `src/app/app.module.ts` lines 128-152
  - Remove all 18 services from `providers` array
  - Keep non-service providers: `NgbActiveModal`, `QrModalService`, `DeeplinkService`, `MusigService`, `NoPaddingZerosPipe`
  - Verify app still compiles and runs

  **Must NOT do**:
  - Do not remove non-service providers
  - Do not touch `declarations` array
  - Do not touch `imports` array

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1, after Tasks 10-12)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 1-3, 10-12

  **References**:
  - `src/app/app.module.ts:128-152` - Current providers array

  **Acceptance Criteria**:
  - [ ] 18 services removed from providers array
  - [ ] Only non-service providers remain
  - [ ] `nvm exec npm run build` succeeds

  **QA Scenarios**:
  ```
  Scenario: App module providers cleaned
    Tool: Bash
    Preconditions: Tasks 10-12 complete
    Steps:
      1. Read app.module.ts providers section
      2. Verify no service names in providers
      3. Run: nvm exec npm run build
      4. Run: nvm exec npm start &
      5. Wait 10s, verify server starts
    Expected Result: Build passes, dev server starts
    Failure Indicators: DI errors, missing providers
    Evidence: .sisyphus/evidence/task-13-app-module.txt
  ```

  **Commit**: YES (groups with Task 12)
  - Message: `refactor(app): remove service providers from app.module`
  - Files: `src/app/app.module.ts`
  - Pre-commit: `nvm exec npm run build && timeout 15 nvm exec npm start || true`

- [ ] 14. Create memory leak verification tests

  **What to do**:
  - Create test file: `src/app/components/memory-leak.spec.ts`
  - Test each of the 6 fixed components:
    - Instantiate component
    - Trigger subscriptions
    - Destroy component
    - Verify no memory leaks (check for detached DOM nodes)
  - Use Angular TestBed and detectChanges()
  - Tests should pass with the new DestroyRef pattern

  **Must NOT do**:
  - Do not test internal subscription arrays
  - Do not rely on private implementation details

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed (Angular testing expertise)

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Waves 2-3)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 17 (if tests fail, e2e might be affected)
  - **Blocked By**: Tasks 4-13

  **References**:
  - Existing test files in `src/app/**/*.spec.ts`
  - Angular testing guide: https://angular.io/guide/testing

  **Acceptance Criteria**:
  - [ ] Test file covers all 6 fixed components
  - [ ] Tests pass with `nvm exec npm test -- --grep="memory"`
  - [ ] No memory leak errors in test output

  **QA Scenarios**:
  ```
  Scenario: Memory leak tests pass
    Tool: Bash
    Preconditions: Tasks 4-13 complete
    Steps:
      1. Create memory-leak.spec.ts with tests
      2. Run: nvm exec npm test -- --grep="memory"
    Expected Result: All tests pass
    Failure Indicators: Test failures, memory errors
    Evidence: .sisyphus/evidence/task-14-memory-tests.log
  ```

  **Commit**: YES
  - Message: `test(memory): add verification tests for subscription cleanup`
  - Files: `src/app/components/memory-leak.spec.ts`
  - Pre-commit: `nvm exec npm test -- --grep="memory"`

- [ ] 15. Verify Service DI singleton behavior

  **What to do**:
  - Create test file: `src/app/services/di-verification.spec.ts`
  - Test that services are truly singletons:
    - Inject same service in two components
    - Verify they are the same instance
  - Verify services still provide correct values
  - Test services specifically needed for NanoNym workflow

  **Must NOT do**:
  - Do not test service internals
  - Do not mock services (test real DI)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Waves 2-3)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 10-13

  **Acceptance Criteria**:
  - [ ] Test file created with singleton verification
  - [ ] WalletService singleton tested (critical for NanoNym)
  - [ ] All 18 services verified as singletons

  **QA Scenarios**:
  ```
  Scenario: Service singletons verified
    Tool: Bash
    Preconditions: Tasks 10-13 complete
    Steps:
      1. Create di-verification.spec.ts
      2. Run: nvm exec npm test -- --grep="DI"
    Expected Result: All singleton tests pass
    Evidence: .sisyphus/evidence/task-15-di-tests.log
  ```

  **Commit**: YES
  - Message: `test(di): add singleton verification tests for services`
  - Files: `src/app/services/di-verification.spec.ts`
  - Pre-commit: `nvm exec npm test -- --grep="DI"`

- [ ] 16. Check bundle size impact

  **What to do**:
  - Run production build: `nvm exec npm run wallet:build`
  - Check `dist/` folder for main bundle size
  - Compare to baseline (current main.js size)
  - Verify bundle did not grow >5%
  - Document any significant changes

  **Must NOT do**:
  - Do not change build configuration
  - Do not modify optimization settings

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Waves 2-3)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 1-13

  **Acceptance Criteria**:
  - [ ] Production build succeeds
  - [ ] Main bundle size ≤ current +5%
  - [ ] No increase from removing rxjs-compat (should decrease)

  **QA Scenarios**:
  ```
  Scenario: Bundle size acceptable
    Tool: Bash
    Preconditions: Tasks 1-13 complete
    Steps:
      1. Run: nvm exec npm run wallet:build
      2. List: ls -lh dist/main.*.js
      3. Compare to baseline size
    Expected Result: Build succeeds, size within 5% of baseline
    Failure Indicators: Build fails, size increase >5%
    Evidence: .sisyphus/evidence/task-16-bundle-size.txt
  ```

  **Commit**: NO (verification only, no code changes)

- [ ] 17. NanoNym workflow E2E verification

  **What to do**:
  - Create Playwright test: `e2e/nanonym-workflow.spec.ts`
  - Test the Critical Invariant:
    1. Create/load wallet with seed
    2. Generate a NanoNym
    3. Send to NanoNym (mock or testnet)
    4. Verify Nostr notification received
    5. Verify funds show in stealth account
    6. Verify funds can be spent
  - This is THE most important verification

  **Must NOT do**:
  - Do not skip this test
  - Do not test only parts of the workflow
  - Do not modify wallet/NanoNym logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright-testing`

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Waves 2-3)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 1-16

  **References**:
  - `AGENTS.md` - Prime Directive: "Send to NanoNym → Receive via Nostr → Stealth funds spendable"
  - Existing e2e tests: `e2e/*.spec.ts`

  **Acceptance Criteria**:
  - [ ] E2E test covers full NanoNym workflow
  - [ ] Test passes: `nvm exec npm run e2e:pw -- e2e/nanonym-workflow.spec.ts`
  - [ ] No errors in send/receive/spend flow

  **QA Scenarios**:
  ```
  Scenario: NanoNym workflow intact
    Tool: Playwright
    Preconditions: All previous tasks complete, dev server running
    Steps:
      1. Load wallet/create new
      2. Generate NanoNym
      3. Send transaction to NanoNym
      4. Wait for notification
      5. Verify stealth account balance
      6. Spend from stealth account
    Expected Result: All steps succeed, funds flow correctly
    Failure Indicators: Wallet errors, notification failures, spend failures
    Evidence: .sisyphus/evidence/task-17-nanonym-workflow.png
  ```

  **Commit**: YES
  - Message: `test(e2e): add NanoNym workflow verification test`
  - Files: `e2e/nanonym-workflow.spec.ts`
  - Pre-commit: `nvm exec npm run e2e:pw -- e2e/nanonym-workflow.spec.ts`

---

## Final Verification Wave (AFTER ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  
  **Task**: Read this plan end-to-end. For each TODO:
  - Verify file was modified (check git log)
  - Verify acceptance criteria met
  - Check "Must NOT do" constraints
  - Verify evidence files exist
  
  **Output**: `TODOs [N/N complete] | Must NOT do [N/N compliant] | Evidence [N/N exists] | VERDICT: APPROVE/REJECT`

  **Rejection Criteria**:
  - Any TODO acceptance criteria not met
  - Any "Must NOT do" violated
  - Missing evidence files
  - Critical Invariant broken

- [ ] F2. **Code Quality Review** — `unspecified-high`
  
  **Task**: Run full quality checks:
  - `nvm exec npm run lint` - No linting errors
  - `nvm exec npm run build` - Build succeeds
  - `nvm exec npm test` - All tests pass
  - Check for AI slop: excessive comments, generic names, unused imports
  
  **Output**: `Lint [PASS/FAIL] | Build [PASS/FAIL] | Tests [PASS/FAIL] | AI Slop [CLEAN/N issues] | VERDICT`

  **Rejection Criteria**:
  - Any quality check fails
  - AI slop patterns detected
  - TypeScript strict mode violations

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  
  **Task**: Execute EVERY QA scenario from Tasks 1-17:
  - Run each bash command and verify output
  - Run each Playwright test and capture evidence
  - Test cross-task integration
  - Verify Critical Invariant still works
  
  **Output**: `Scenarios [N/N pass] | NanoNym Flow [PASS/FAIL] | Integration [PASS/FAIL] | VERDICT`

  **Rejection Criteria**:
  - Any QA scenario fails
  - NanoNym workflow broken
  - Integration issues between components

- [ ] F4. **Scope Fidelity Check** — `deep`
  
  **Task**: Verify 1:1 mapping between plan and implementation:
  - Read each task's "What to do" section
  - Read actual git diff for that task
  - Verify no logic changes beyond scope
  - Verify no feature creep
  - Check for cross-task contamination
  
  **Output**: `Tasks [N/N compliant] | Scope Creep [CLEAN/N issues] | Contamination [CLEAN/N files] | VERDICT`

  **Rejection Criteria**:
  - Logic changed beyond subscription cleanup/DI/RxJS
  - Feature creep detected
  - Cross-task contamination (files modified by wrong task)

---

## Commit Strategy

| Task | Commit? | Message | Files | Pre-commit Verification |
|------|---------|---------|-------|------------------------|
| 1-3 | YES | `chore(deps): upgrade rxjs 6.5.5 to 7.8.0` | package.json, package-lock.json | `nvm exec npm ci` |
| 2 | YES | `refactor(rxjs): migrate deprecated API usage for v7` | Modified .ts files | `nvm exec npm run build` |
| 3 | YES | `test(rxjs): add regression tests for RxJS v7 upgrade` | rxjs-upgrade.spec.ts | `nvm exec npm test -- --grep="rxjs"` |
| 4 | YES | `fix(memory): add subscription cleanup to change-rep-widget` | change-rep-widget.component.ts | Component tests pass |
| 5 | YES | `fix(memory): add subscription cleanup to wallet-widget` | wallet-widget.component.ts | Build passes |
| 6 | YES | `fix(memory): add subscription cleanup to app.component` | app.component.ts | Build passes |
| 7 | YES | `fix(memory): add subscription cleanup to sign.component` | sign.component.ts | Build passes |
| 8 | YES | `fix(memory): add subscription cleanup to manage-wallet` | manage-wallet.component.ts | Build passes |
| 9 | YES | `fix(memory): add subscription cleanup to representatives` | representatives.component.ts | Build passes |
| 10 | YES | `refactor(services): add providedIn root to core services` | 6 service files | `nvm exec npm run build` |
| 11 | YES | `refactor(services): add providedIn root to infrastructure services` | 6 service files | Build passes |
| 12 | YES | `refactor(services): add providedIn root to remaining services` | 6 service files | Build passes |
| 13 | YES | `refactor(app): remove service providers from app.module` | app.module.ts | Build + dev server starts |
| 14 | YES | `test(memory): add verification tests for subscription cleanup` | memory-leak.spec.ts | `nvm exec npm test -- --grep="memory"` |
| 15 | YES | `test(di): add singleton verification tests for services` | di-verification.spec.ts | DI tests pass |
| 16 | NO | — | — | — |
| 17 | YES | `test(e2e): add NanoNym workflow verification test` | nanonym-workflow.spec.ts | E2E test passes |
| F1-F4 | NO | — | — | — |

---

## Success Criteria

### Verification Commands

```bash
# 1. RxJS upgraded successfully
nvm exec npm ls rxjs | grep "rxjs@7"
# Expected: Shows rxjs@7.8.0 or higher

# 2. No deprecated APIs remain
grep -r "toPromise()" src/ --include="*.ts"
# Expected: No output

# 3. All services have providedIn: 'root'
grep -r "@Injectable({ providedIn: 'root' })" src/app/services/ | wc -l
# Expected: 28 (18 fixed + 10 already correct)

# 4. Services removed from app.module.ts
grep -A 30 "providers:" src/app/app.module.ts | grep -E "(WalletService|ApiService|NotificationService)"
# Expected: No output (services not in providers)

# 5. Memory leak tests pass
nvm exec npm test -- --grep="memory"
# Expected: All tests pass

# 6. Build succeeds
nvm exec npm run wallet:build
# Expected: Build completes without errors

# 7. Bundle size acceptable
ls -lh dist/main.*.js | awk '{print $5}'
# Expected: Size within 5% of baseline

# 8. All tests pass
nvm exec npm test
# Expected: Full test suite passes

# 9. NanoNym workflow intact
nvm exec npm run e2e:pw -- e2e/nanonym-workflow.spec.ts
# Expected: E2E test passes

# 10. No lint errors
nvm exec npm run lint
# Expected: No errors
```

### Final Checklist

- [ ] RxJS upgraded to 7.8.0+
- [ ] rxjs-compat removed
- [ ] 6 components have subscription cleanup
- [ ] 18 services have `providedIn: 'root'`
- [ ] Services removed from app.module.ts providers
- [ ] All tests pass (unit + e2e)
- [ ] Build succeeds
- [ ] Bundle size ≤ +5%
- [ ] NanoNym workflow verified working
- [ ] No lint errors
- [ ] Critical Invariant preserved

### Critical Invariant Status

**Must Verify**: `Send to NanoNym → Receive via Nostr → Stealth funds spendable and recoverable from seed alone`

- [ ] WalletService DI change does not break NanoNym manager
- [ ] Nostr subscriptions in NanoNymManager still work after RxJS upgrade
- [ ] Stealth account opening still functions
- [ ] Recovery from seed still works
- [ ] No regression in send/receive/spend flow

---

## Notes for Executor

### Pre-Execution Checklist

Before starting any task, verify:
1. Node version: `node --version` should show v22.x
2. nvm available: `source ~/.nvm/nvm.sh` if needed
3. Dependencies installed: `nvm exec npm ci`

### RxJS 7 Breaking Changes to Watch

Per https://rxjs.dev/guide/v7/migration:
- `toPromise()` is deprecated → Use `firstValueFrom()` / `lastValueFrom()`
- `subscribe(next, error, complete)` signature deprecated → Use observer object
- Observable prototype extensions removed (if any exist)

### Memory Leak Fix Pattern

Use Angular 16+ `DestroyRef` + `takeUntilDestroyed`:

```typescript
import { Component, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({...})
export class MyComponent implements OnInit {
  constructor(private destroyRef: DestroyRef) {}

  ngOnInit() {
    this.service.observable$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(...);
  }
}
```

### Service DI Pattern

Change from:
```typescript
@Injectable()
export class MyService { }
```

To:
```typescript
@Injectable({ providedIn: 'root' })
export class MyService { }
```

### Recovery Strategy

If any task fails:
1. Check if it's a dependency of later tasks
2. If yes: Stop and report to user
3. If no: Document failure, continue with independent tasks
4. Never proceed if Critical Invariant is at risk

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RxJS 7 breaks existing code | Low | High | Thorough testing, migration guide followed |
| Service DI causes circular deps | Low | Medium | Verify imports before changes |
| NanoNym workflow broken | Very Low | Critical | E2E test Task 17, rollback plan ready |
| Bundle size increases | Very Low | Low | Monitor size, rxjs-compat removal should help |
| Subscription cleanup changes timing | Very Low | Medium | Test thoroughly, no logic changes |

**Overall Risk Level**: LOW

With proper test coverage (Tasks 3, 14, 15, 17) and the Critical Invariant verification, this plan has minimal risk of breaking functionality.

---

*Plan generated based on docs/ANGULAR-MODERNIZATION.md analysis*
*Critical Invariant: "Send to NanoNym → Receive via Nostr → Stealth funds spendable and recoverable from seed alone"*
