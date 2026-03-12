# CLAUDE.md

Guidance for Claude Code when working on this repository.

---

# Project Purpose

This repository provides a backend API for serving **all-time Liverpool player statistics**.

The backend will power:

- museum installations
- interactive kiosks
- Webflow visualisations
- leaderboard displays
- player comparison tools

The system must support multiple data sources, including future integration with Stats Perform datasets.

---

# Core Architecture

The application uses a **provider-based architecture**.

Data can come from multiple sources while exposing the same API.

Providers include:

- mockProvider
- staticProvider
- statsPerformProvider

The active provider is controlled by:

```
DATA_PROVIDER
```

---

# Rules for modifying this repo

When working on this project:

### 1. Do not break provider abstraction

All data access must go through the provider interface.
Never directly import JSON or external APIs inside routes.
Routes must use services.

---

### 2. Routes must remain thin

API routes should:

- validate input
- call services
- return response

Business logic belongs in `/services`.

---

### 3. All new data models require Zod validation

Add schemas to:

```
/src/lib/schemas
```

---

### 4. Avoid tight coupling to Stats Perform

Stats Perform integration is **not guaranteed yet**.

Do not assume specific endpoint formats.

Instead:

- build mapping layers
- isolate provider logic

---

### 5. Maintain strong typing

The project uses strict TypeScript.
Avoid `any`.
Prefer explicit types.

---

### 6. Maintain API stability

Existing endpoints should not change response shape without versioning.

---

# Project Structure

```
src/
  app/api
    health
    players
    leaderboards
    compare
  lib/
    providers/
      provider.types.ts
      provider.factory.ts
      mock.provider.ts
      static.provider.ts
      statsperform.provider.ts
    services/
      players.service.ts
      leaderboard.service.ts
      compare.service.ts
    schemas/
      player.schema.ts
      query.schema.ts
    utils/
  data/
tests/
```

---

# Provider Interface

All providers must implement:

```
getPlayers()
getPlayerBySlug()
getPlayerById()
getLeaderboard(metric)
comparePlayers()
```

Providers must return data in the **normalised player model**.

---

# Normalised Player Model

```
LiverpoolPlayerRecord
```

Defined in:

```
/src/lib/schemas/player.schema.ts
```

All providers must map their raw data into this format.

---

# Adding New Features

If new endpoints are needed:

1. create service
2. create schema
3. add route
4. add tests

---

# Testing Requirements

All new logic must include tests.

Tests should cover:

- provider behaviour
- leaderboard generation
- player lookup
- invalid input handling

Use:

```
Vitest
```

Run tests with: `npm run test`

---

# Code Style

Follow:

- ESLint rules
- Prettier formatting
- descriptive naming
- minimal comments where code is self-explanatory

---

# Deployment

The project must remain deployable to **Vercel**.

API routes should function as serverless endpoints.
