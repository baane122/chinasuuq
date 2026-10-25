# @chinasuuq/shared

Shared TypeScript library for ChinaSuuq monorepo. Contains types, constants, utilities, validation schemas, error handling, and API client used by both web and mobile apps.

## Installation

```bash
# In workspace root
pnpm add @chinasuuq/shared
```

Or add to your app's `package.json`:

```json
{
  "dependencies": {
    "@chinasuuq/shared": "workspace:*"
  }
}
```

## What's Included

| Module | Description |
|--------|-------------|
| `@chinasuuq/shared` | Main entry point — exports all public APIs |
| `@chinasuuq/shared/types` | TypeScript interfaces and types |
| `@chinasuuq/shared/constants` | App-wide constants (currency codes, locale strings, etc.) |
| `@chinasuuq/shared/utils` | Utility functions (formatting, parsing, etc.) |
| `@chinasuuq/shared/validation` | Zod schemas for input validation |
| `@chinasuuq/shared/errors` | Custom error classes and error handling utilities |
| `@chinasuuq/shared/api-client` | Supabase client setup and API request helpers |
| `@chinasuuq/shared/hooks` | React hooks (Zustand stores, debouncing, etc.) |

## Usage

### Basic Types

```typescript
import { ShipmentStatus, CarrierType, UserRole } from "@chinasuuq/shared/types";
```

### Validation Schemas

```typescript
import { ShipmentSchema, PackageSchema } from "@chinasuuq/shared/validation";

const result = ShipmentSchema.parse(data);
```

### API Client

```typescript
import { createSupabaseClient } from "@chinasuuq/shared/api-client";

const supabase = createSupabaseClient();
```

### React Hooks

```typescript
import { useDebounce, useLocalStorage } from "@chinasuuq/shared/hooks";
```

## Dependencies

- **Runtime**: None (pure TypeScript)
- **Peer Dependencies**:
  - `react` >= 18.0.0 (optional)
  - `@supabase/supabase-js` >= 2.0.0 (optional)
- **Dependencies**:
  - `zod` ^3.24.0

## Development

```bash
# From workspace root
pnpm --filter @chinasuuq/shared dev
pnpm --filter @chinasuuq/shared build
pnpm --filter @chinasuuq/shared test
```

## Versioning

This package follows semantic versioning (SemVer). Breaking changes will increment the major version.

## License

MIT
