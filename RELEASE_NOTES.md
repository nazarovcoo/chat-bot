## 2026-02-28 — Telegram Mini App iOS UX Fix

### Feature Flag
- `MINIAPP_IOS_FIX` (default: enabled)
- Override controls:
  - disable: `?miniapp_ios_fix=0`
  - enable: `?miniapp_ios_fix=1`
  - persistent local override (dev): `localStorage.setItem('MINIAPP_IOS_FIX','0'|'1')`

### Included changes
- iOS Telegram Mini App viewport stabilization (`--app-height` based on Telegram viewport)
- Safe area padding (`env(safe-area-inset-*)`)
- body no-scroll in Mini App iOS mode, internal container scroll only
- iOS input anti-zoom guard (`font-size >= 16px` on mobile controls)
- Telegram WebApp init for app-like behavior (`ready`, `expand`, `viewportChanged`)
- basic client metrics for iOS miniapp focus/resize behavior

### Rollback
1. Open app with `?miniapp_ios_fix=0` to disable immediately.
2. Or set `localStorage.setItem('MINIAPP_IOS_FIX','0')` and reload.
3. For global rollback, deploy a build with `window.MINIAPP_IOS_FIX = false`.
