# Decisions
- Use SimplePool configuration with enablePing: true and a backoff-based enableReconnect that respects a 6-day window and a 4-day fallback.
- Introduce placeholder getLastSeenTimestamp() for future integration with NostrSyncStateService.
