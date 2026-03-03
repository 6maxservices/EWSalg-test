# Module Playbook

## General Principles

1.  **Encapsulation**: Each module should be self-contained and expose a clear API.
2.  **Stateless Logic**: Algorithm logic should be pure and testable where possible.
3.  **Error Handling**: Modules must handle invalid data gracefully (e.g., non-numeric CSV values).

## Design Pattern

Use the **Module Pattern** (ESM) to export functions or class instances.

```javascript
// Example
export const Pipeline = {
  calculateEWMA: (data, alpha) => { ... },
  calculateZScore: (ewma, baseline) => { ... }
};
```

## Performance

- Avoid re-calculating the entire series on every playback step.
- Update charts incrementally if possible, or use efficient re-renders.
