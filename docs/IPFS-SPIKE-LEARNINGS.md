# IPFS Notification Spike Learnings

**Date**: January 10-11, 2026
**Branch**: `ipfs_as_notification_alternative`
**Status**: Unblocked - Angular 17 migration completed

---

## Summary

Originally blocked by Node.js version and webpack compatibility issues with Angular 13. **Successfully resolved** by upgrading Angular 13 → 17 and Node.js 16 → 20.

Helia and OrbitDB v3 now install and build successfully.

---

## Migration Path Completed

| Step | From → To | Key Changes |
|------|-----------|-------------|
| 1 | Angular 13 → 14 | TypeScript 4.5 → 4.8, RxJS 7.4+ |
| 2 | Angular 14 → 15 | Node 16 → 18, standalone components |
| 3 | Angular 15 → 16 | TypeScript 4.9 → 5.1 |
| 4 | Angular 16 → 17 | Node 18 → 20, TypeScript 5.4, SwUpdate API changes |

### Additional Package Upgrades Required
- `@ng-bootstrap/ng-bootstrap` 11 → 16 (for Angular 17)
- `@zxing/ngx-scanner` 3.4 → 17 (for Angular 17)
- `@zxing/browser` 0.0.10 → 0.1.4
- `@zxing/library` 0.18 → 0.21
- `@popperjs/core` (new dependency for ng-bootstrap 16)
- `jasmine-core` 3.6 → 5.1
- `karma-jasmine` 4.0 → 5.1
- `karma-jasmine-html-reporter` 1.7 → 2.1
- `zone.js/testing` (new testing import pattern)

---

## Current Status

### Working
- Helia and @orbitdb/core install without errors
- Build completes successfully (11.2 MB bundle)
- OrbitDBNotificationService created with dynamic imports
- Test suite runs (117 passed, 1 flaky mock test, 60 skipped)
- All 18 cryptography tests pass

### Test Configuration Changes
- `src/test.ts` simplified (removed `__karma__` handling)
- `angular.json` test config: added `"include": ["src/**/*.spec.ts"]`
- `angular.json` test config: polyfills changed to array format including `zone.js/testing`

---

## Previous Blockers (Now Resolved)

### 1. Node.js Version Requirements
Modern IPFS ecosystem requires Node.js >= 20:
- `@orbitdb/core@3.0.2` - requires Node >= 20
- `helia` - multiple dependencies require Node >= 18-20
- `@noble/curves`, `@noble/hashes` - require Node >= 20.19.0

**Resolution**: Upgraded to Node.js 20 via Angular 17 migration.

### 2. Webpack `node:` URI Scheme
Angular 13's webpack couldn't handle `node:` protocol prefix.

**Resolution**: Angular 17's updated webpack configuration handles this natively.

---

## Files Created/Modified

| File | Status |
|------|--------|
| `docs/IPFS-SPIKE-PLAN.md` | Created - spike planning |
| `docs/IPFS-SPIKE-LEARNINGS.md` | Updated - this document |
| `src/app/services/orbitdb-notification.service.ts` | Created - service skeleton |
| `.nvmrc` | Modified - 16 → 20 |
| `package.json` | Modified - Angular 17, helia, @orbitdb/core |
| `angular.json` | Modified - test config updates |
| `src/test.ts` | Modified - Angular 17 test setup |
| `src/app/app.component.ts` | Modified - SwUpdate API for Angular 17 |
| `tsconfig.json` | Modified - added `allowJs: true` |
| `src/typings/custom/index.d.ts` | Created - nanoidenticons type declaration |

---

## Next Steps

1. **Implement OrbitDB global log** per IPFS-SPIKE-PLAN.md approach #1
2. **Test Helia/OrbitDB initialization** in browser
3. **Measure performance** vs Nostr notifications
4. **Evaluate hybrid approach** (Nostr + IPFS)

---

## Reusable Takeaways

1. **Angular major version upgrades** - Must be done one version at a time using `ng update`
2. **Package peer dependencies** - Check compatibility for each Angular version
3. **Test configuration** - Angular 17 uses simplified test.ts and explicit `include` in angular.json
4. **SwUpdate API** - Changed significantly in Angular 17 (use `versionUpdates.pipe(filter(...))`)
5. **Zone.js** - Import path changed from `zone.js/dist/*` to `zone.js/testing`
