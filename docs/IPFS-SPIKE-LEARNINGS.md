# IPFS Notification Spike Learnings

**Date**: January 10, 2026
**Branch**: `ipfs_as_notification_alternative`
**Status**: Blocked - Fundamental compatibility issue

---

## Summary

Attempted to integrate Helia (modern IPFS JS implementation) and OrbitDB v3 for IPFS-based notifications. **Blocked by Node.js version and webpack compatibility issues** with the Angular 13 stack.

---

## Key Findings

### 1. Node.js Version Requirements (Blocker)

Modern IPFS ecosystem requires Node.js >= 20:

```
npm WARN EBADENGINE Unsupported engine {
  package: '@orbitdb/core@3.0.2',
  required: { node: '>=20.0.0' },
  current: { node: 'v16.20.2', npm: '8.19.4' }
}
```

**Affected packages**:
- `@orbitdb/core@3.0.2` - requires Node >= 20
- `helia` - multiple dependencies require Node >= 18-20
- `@noble/curves`, `@noble/hashes` - require Node >= 20.19.0
- `p-queue`, `p-event`, `p-retry` - require Node >= 18-20

The project is locked to Node.js 16 due to Angular 13 requirements.

### 2. Webpack `node:` URI Scheme (Blocker)

Build fails with:
```
node:stream - Error: Module build failed: UnhandledSchemeError:
Reading from "node:stream" is not handled by plugins (Unhandled scheme).
You may need an additional plugin to handle "node:" URIs.
```

Modern Node.js libraries use the `node:` protocol prefix (e.g., `node:fs`, `node:stream`). Angular 13's webpack 5 configuration doesn't handle this by default.

**Impact**: All three planned approaches (OrbitDB, DHT, libp2p Pubsub) use Helia which has this issue.

### 3. Packages Install Despite Warnings

Despite engine warnings, `npm install --legacy-peer-deps` succeeds and installs the packages. The build only fails when the code is actually imported/bundled.

---

## What Was Attempted

1. **Installed dependencies**: `npm add helia @orbitdb/core --legacy-peer-deps`
   - Result: Installed with 20+ engine warnings

2. **Created OrbitDBNotificationService**:
   - `src/app/services/orbitdb-notification.service.ts`
   - Dynamic ESM imports to defer loading
   - Modeled after NostrNotificationService patterns

3. **Integrated with NanoNymManagerService**:
   - Added service injection
   - Added `testOrbitDBInit()` method for console testing

4. **Build test**:
   - Result: Failed with `node:stream` URI error

---

## Potential Workarounds (Not Attempted)

### Option A: Webpack Configuration Override
Add polyfills for Node.js built-ins via `extra-webpack.config.js`:
```javascript
module.exports = {
  resolve: {
    fallback: {
      stream: require.resolve('stream-browserify'),
      // ... other polyfills
    }
  }
};
```
**Risk**: May not work with `node:` protocol; significant config complexity.

### Option B: Upgrade Angular/Node.js
Upgrade to Angular 17+ and Node.js 20+ to meet library requirements.
**Risk**: Major migration effort; out of scope for spike.

### Option C: Find Older Library Versions
Search for Helia/OrbitDB versions that support Node.js 16 and don't use `node:` URIs.
**Risk**: May not exist; security/feature concerns with older versions.

### Option D: Alternative Browser-Compatible IPFS Library
Use js-ipfs (now deprecated) or a pure browser IPFS implementation.
**Risk**: js-ipfs is deprecated; alternatives may have same issues.

### Option E: External Service Approach
Use a separate Node.js 20+ service for IPFS interactions, communicate via WebSocket/HTTP.
**Risk**: Adds infrastructure complexity; defeats "pure p2p" goal.

---

## Conclusion

**The IPFS spike is blocked** by fundamental compatibility issues between modern IPFS libraries and the NanoNymNault Angular 13 + Node.js 16 stack.

**Recommended next steps**:
1. **Continue with Arweave spike** - appears to have better browser compatibility
2. **Revisit IPFS after Angular upgrade** - when project moves to Angular 17+ / Node.js 20+
3. **Document in CLAUDE.md** - Update Tier 2 backup section to note IPFS incompatibility

---

## Files Created/Modified

| File | Status |
|------|--------|
| `docs/IPFS-SPIKE-PLAN.md` | Created - spike planning |
| `docs/IPFS-SPIKE-LEARNINGS.md` | Created - this document |
| `src/app/services/orbitdb-notification.service.ts` | Created - service skeleton |
| `src/app/services/nanonym-manager.service.ts` | Modified - integration (needs revert) |
| `package.json` | Modified - added helia, @orbitdb/core (needs revert) |
| `package-lock.json` | Modified - dependency tree (needs revert) |

---

## Reusable Takeaways for Other Storage Spikes

1. **Check Node.js requirements early** - Modern packages often require Node >= 18-20
2. **Test webpack compatibility before integration** - `node:` URIs are increasingly common
3. **Dynamic imports don't bypass webpack** - ESM dynamic imports still get bundled
4. **Angular 13 limitations** - Older Angular versions have significant ecosystem compatibility constraints
