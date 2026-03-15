# Score Update & Live Leaderboard — Module Specification

## Table of Contents

1. [Overview](#overview)
2. [High-Level Design](#1-high-level-design)
   - [Business Context](#11-business-context)
   - [System Context Diagram](#12-system-context-diagram)
   - [Key Design Decisions](#13-key-design-decisions)
3. [Mid-Level Design](#2-mid-level-design)
   - [Component Architecture](#21-component-architecture)
   - [Module Responsibilities](#22-module-responsibilities)
   - [Technology Choices](#23-technology-choices)
4. [Low-Level Design](#3-low-level-design)
   - [API Reference](#31-api-reference)
   - [WebSocket Protocol](#32-websocket-protocol)
   - [Score Update Sequence](#33-score-update-sequence-diagram)
   - [WebSocket Lifecycle](#34-websocket-lifecycle-diagram)
   - [Security Model](#35-security-model)
   - [Data Models](#36-data-models)
   - [Error Codes](#37-error-codes)
   - [Configuration](#38-configuration)
5. [Scalability Design](#4-scalability-design)
6. [Improvement Recommendations](#5-improvement-recommendations)

---

## Overview

This module handles **real-time score updates** and **live leaderboard broadcasting** for the application's scoreboard feature.

It exposes:
- A secured REST endpoint for authenticated score submission.
- A WebSocket channel for live top-10 leaderboard delivery to all connected clients.

Scope boundary: this module **does not** issue JWTs, manage user accounts, or define what an "action" is. Those concerns belong to other services.

---

## 1. High-Level Design

### 1.1 Business Context

| # | Requirement | Design Response |
|---|-------------|-----------------|
| 1 | Show top-10 scores on a scoreboard | Leaderboard sorted set in Redis; queried on every update |
| 2 | Live update of the scoreboard | WebSocket hub broadcasts after each successful score change |
| 3 | User completes an action → score increases | REST endpoint increments score atomically in DB |
| 4 | Frontend dispatches API call after action completion | `POST /api/v1/scores/update` with JWT + action ID |
| 5 | Prevent unauthorised score inflation | JWT auth + rate limiting + idempotency + server-controlled delta |

### 1.2 System Context Diagram

> **Diagram:** [`diagrams/01_system_context.puml`](diagrams/01_system_context.puml)

```
                     ┌────────────────────────────────────────┐
   User (Browser) ──►│            API Server                  │◄── External Auth Service
                     │   (This Module)                        │    (issues JWTs only)
                     │                                        │
                     │  POST /api/v1/scores/update            │
                     │  WS   /ws/scoreboard                   │
                     └──────────┬─────────────────┬──────────┘
                                │                 │
                          ┌─────▼────┐     ┌──────▼──────┐
                          │PostgreSQL│     │    Redis     │
                          │(scores)  │     │(leaderboard) │
                          └──────────┘     └─────────────┘
```

### 1.3 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Live updates transport | WebSocket (server-push) | Lower latency and overhead than polling; suitable for real-time leaderboard |
| Leaderboard storage | Redis Sorted Set | O(log N) insert, O(log N + K) top-K fetch; in-memory speed |
| Score persistence | PostgreSQL (ACID transaction) | Authoritative source; guarantees no lost increments |
| Score delta source | Server-defined (not client-supplied) | Client cannot manipulate the increment amount |
| Replay prevention | Idempotency key (`action_id` UUID) | Prevents double-submission and replay attacks |
| Auth mechanism | JWT Bearer token | Stateless; integrates with existing auth service |
| Horizontal WS scaling | Redis Pub/Sub | Broadcast across multiple server instances without shared memory |

---

## 2. Mid-Level Design

### 2.1 Component Architecture

> **Diagram:** [`diagrams/02_component_architecture.puml`](diagrams/02_component_architecture.puml)

```
┌──────────────────────────────────────────────────────────────┐
│                         API Server                           │
│                                                              │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │    Transport Layer   │    │      Transport Layer      │  │
│  │  REST Router         │    │   WebSocket Handler       │  │
│  │  POST /scores/update │    │   WS /ws/scoreboard       │  │
│  └──────────┬───────────┘    └─────────────┬─────────────┘  │
│             │                              │                 │
│  ┌──────────▼──────────────────────────────▼─────────────┐  │
│  │                  Middleware Chain                      │  │
│  │  Auth MW  →  Rate Limiter  →  Idempotency Guard        │  │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐   │
│  │                  Business Logic                       │   │
│  │      Score Service  ←→  Leaderboard Service           │   │
│  └──────┬───────────────────────────────┬───────────────┘   │
│         │                               │                   │
│  ┌──────▼──────┐  ┌──────────────┐  ┌──▼──────────────┐    │
│  │ DB Repo     │  │ Redis Adapter │  │  WebSocket Hub  │    │
│  │(PostgreSQL) │  │(Sorted Set +  │  │(conn registry + │    │
│  │             │  │ Pub/Sub)      │  │ broadcaster)    │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Module Responsibilities

#### Auth Middleware
- Validates the JWT Bearer token on every incoming request and WebSocket handshake.
- Extracts `user_id` (`sub` claim) and `roles`.
- Rejects expired, malformed, or unsigned tokens immediately with `401`.
- **User ID is NEVER taken from the request body** — always derived from the token.

#### Rate Limiter
- Per-user sliding-window or token-bucket check, enforced in Redis.
- Prevents burst abuse by a single authenticated user.
- Returns `429` with `Retry-After` header when the limit is exceeded.
- Default: **10 requests per 60-second window** per `user_id` (configurable).

#### Idempotency Guard
- Each request carries a client-generated `action_id` (UUID v4).
- Checks the `processed_actions` table before processing.
- Rejects duplicate submissions with `409 Conflict`.
- Protects against client retries and replay attacks.

#### Score Service
- Orchestrates the full score-update workflow.
- Runs an atomic DB transaction: insert `processed_action` + increment score.
- Delegates leaderboard refresh and WebSocket broadcast after the commit.

#### Leaderboard Service
- Wraps Redis Sorted Set operations.
- `ZADD leaderboard <score> <user_id>` after each update.
- `ZREVRANGE leaderboard 0 9 WITHSCORES` to retrieve current top 10.
- `ZREVRANK leaderboard <user_id>` to return the user's current rank.

#### WebSocket Hub
- Maintains a registry of all active WebSocket connections.
- On new connection: validates JWT, sends `scoreboard:init` with current top 10.
- On score update: broadcasts `scoreboard:update` to all registered connections.
- Manages heartbeat (ping/pong) and idle timeout.
- Subscribes to Redis Pub/Sub for multi-instance fanout.

### 2.3 Technology Choices

| Layer | Technology | Notes |
|-------|-----------|-------|
| Transport | HTTP/1.1 REST + WebSocket | Standard browser-compatible protocols |
| Auth | JWT (HS256 or RS256) | Issued externally; verified here |
| Database | PostgreSQL | ACID transactions for score integrity |
| Cache & Pub/Sub | Redis | Sorted Set for leaderboard; Pub/Sub for scaling |
| Rate limiting | Redis (sliding window) | Atomic counters, shared across instances |

---

## 3. Low-Level Design

### 3.1 API Reference

#### `POST /api/v1/scores/update`

Submits a completed action to increment the authenticated user's score.

**Headers**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <JWT>` | Yes |
| `Content-Type` | `application/json` | Yes |

**Request Body**

```json
{
  "action_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `action_id` | UUID v4 | Client-generated unique identifier for this action instance. Must be submitted exactly once. |

> **Implementation note:** The score delta (increment value) is **server-defined**, not client-supplied. The server maps the authenticated user's context to the correct increment. Do not accept a `delta` field from the client.

**Success Response — `200 OK`**

```json
{
  "user_id": "user_abc123",
  "new_score": 1450,
  "rank": 3
}
```

**Error Responses**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `INVALID_ACTION` | `action_id` missing or not a valid UUID |
| 401 | `UNAUTHORIZED` | JWT missing, expired, or invalid signature |
| 409 | `ALREADY_PROCESSED` | `action_id` already submitted |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests for this user |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### 3.2 WebSocket Protocol

#### Connection

```
WS  /ws/scoreboard
WSS /ws/scoreboard          ← required in production

Token delivery (choose one):
  Query param:  ?token=<JWT>       ← for browsers (native WebSocket API)
  Header:       Authorization: Bearer <JWT>  ← for non-browser clients
```

> **Security note:** When using query-param token delivery, the JWT is visible in server access logs. Use short-lived tokens (≤ 5 minutes) for WS handshakes, or a dedicated single-use WS ticket issued by the auth service.

#### Server → Client Events

**`scoreboard:init`** — sent immediately after a successful connection.

```json
{
  "event": "scoreboard:init",
  "payload": {
    "top10": [
      { "rank": 1, "user_id": "user_xyz", "username": "PlayerOne", "score": 9800 },
      { "rank": 2, "user_id": "user_abc", "username": "PlayerTwo", "score": 8750 }
    ]
  }
}
```

**`scoreboard:update`** — broadcast to all connected clients after any score update.

```json
{
  "event": "scoreboard:update",
  "payload": {
    "top10": [
      { "rank": 1, "user_id": "user_xyz", "username": "PlayerOne", "score": 9800 }
    ]
  }
}
```

#### Connection Lifecycle Rules

| Rule | Value |
|------|-------|
| Server ping interval | 30 seconds |
| Idle timeout (no pong) | 60 seconds |
| Client reconnect strategy | Exponential backoff: 1s → 2s → 4s → … → 30s (max) |
| Token expiry handling | Server closes with code `4001`; client must reconnect with fresh token |

---

### 3.3 Score Update Sequence Diagram

> **Diagram:** [`diagrams/03_score_update_sequence.puml`](diagrams/03_score_update_sequence.puml)

Covers:
- **Happy path:** JWT validation → rate check → idempotency check → DB transaction → Redis update → WebSocket broadcast → `200 OK`
- **Failure: expired JWT** → `401`
- **Failure: rate limit** → `429`
- **Failure: duplicate action_id** → `409`

**Happy path summary:**

```
Client                  API Server                    DB          Redis        WS Clients
  │                         │                          │             │              │
  ├─POST /scores/update─────►│                          │             │              │
  │                         ├─Validate JWT──────────────┤             │              │
  │                         ├─Rate check (Redis)─────────────────────►│              │
  │                         ├─Idempotency check (DB)───►│             │              │
  │                         ├─BEGIN TX──────────────────►│             │              │
  │                         ├─INSERT processed_action───►│             │              │
  │                         ├─UPDATE score──────────────►│             │              │
  │                         ├─COMMIT────────────────────►│             │              │
  │                         ├─ZADD / ZREVRANGE────────────────────────►│              │
  │                         ├─Broadcast scoreboard:update──────────────────────────►│
  │◄──200 OK────────────────┤                          │             │              │
```

---

### 3.4 WebSocket Lifecycle Diagram

> **Diagram:** [`diagrams/04_websocket_lifecycle.puml`](diagrams/04_websocket_lifecycle.puml)

Covers:
- Initial connection and JWT handshake
- `scoreboard:init` delivery
- Periodic ping/pong heartbeat
- Score update broadcast from Redis Pub/Sub
- Idle timeout disconnect
- Token expiry disconnect and client reconnect

---

### 3.5 Security Model

#### Authentication

All requests (REST and WebSocket handshake) require a valid JWT signed with the server's secret.

| Claim | Description |
|-------|-------------|
| `sub` | User ID (unique identifier) |
| `exp` | Expiry timestamp (Unix epoch) |
| `iat` | Issued-at timestamp |
| `roles` | Array of role strings (e.g. `["user"]`) |

Tokens are **issued by the external auth service** and verified here only.

#### Authorization

The `user_id` is **always extracted from the JWT `sub` claim**, never from the request body. This prevents a user from submitting score updates on behalf of another user.

#### Idempotency & Replay Prevention

- Each `action_id` (UUID v4) is stored in `processed_actions` after first processing.
- Any re-submission of the same `action_id` → `409 Conflict`.
- Protects against network-retry double-submission and captured-request replay attacks.

#### Rate Limiting

| Parameter | Default |
|-----------|---------|
| Max requests per window | 10 |
| Window duration | 60 seconds |
| Scope | Per `user_id` |
| Storage | Redis (atomic counter) |

Exceeding the limit returns `429` with a `Retry-After: <seconds>` header.

#### Transport Security

- All traffic must be served over **HTTPS / WSS**.
- Plain HTTP and WS connections must be rejected or redirected.

---

### 3.6 Database Design

#### 3.6.1 Entity-Relationship Diagram (ERD)

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│            users             │        │        processed_actions          │
├─────────────────────────────┤        ├──────────────────────────────────┤
│ PK  id           VARCHAR(64) │◄───────│ PK  action_id    UUID             │
│     username     VARCHAR(100)│  1:N   │ FK  user_id      VARCHAR(64)      │
│     score        BIGINT      │        │     processed_at TIMESTAMPTZ      │
│     updated_at   TIMESTAMPTZ │        └──────────────────────────────────┘
└─────────────────────────────┘
            │
            │ 1:N  (optional — Improvement #6)
            ▼
┌────────────────────────────────────────────────────────┐
│                     score_audit_log                     │
├────────────────────────────────────────────────────────┤
│ PK  id               BIGSERIAL                          │
│     user_id          VARCHAR(64)   -- denormalized      │
│     action_id        UUID                               │
│     delta            INT                                │
│     score_before     BIGINT                             │
│     score_after      BIGINT                             │
│     ip_address       INET                               │
│     outcome          VARCHAR(20)   -- success/rejected  │
│     rejection_reason VARCHAR(50)                        │
│     created_at       TIMESTAMPTZ                        │
└────────────────────────────────────────────────────────┘
```

#### 3.6.2 PostgreSQL — Full DDL

##### `users` table

```sql
CREATE TABLE users (
  id          VARCHAR(64)   PRIMARY KEY,
  username    VARCHAR(100)  NOT NULL,
  score       BIGINT        NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_score_non_negative CHECK (score >= 0)
);

-- Supports leaderboard seed query on server startup
CREATE INDEX idx_users_score_desc ON users (score DESC);
```

##### `processed_actions` table

```sql
CREATE TABLE processed_actions (
  action_id    UUID          PRIMARY KEY,           -- idempotency key
  user_id      VARCHAR(64)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Supports per-user history queries and archival cron job
CREATE INDEX idx_processed_actions_user    ON processed_actions (user_id);
CREATE INDEX idx_processed_actions_cleanup ON processed_actions (processed_at);
```

> **Key constraint:** `action_id` is the PRIMARY KEY so idempotency lookups are O(1) — no separate index needed.

> **Archival:** Run a nightly cron to delete rows older than 30 days. The 30-day window provides adequate replay protection while preventing unbounded table growth. See [Improvement #7](#7-processed_actions-archival).

##### `score_audit_log` table *(optional — Improvement #6)*

```sql
CREATE TABLE score_audit_log (
  id               BIGSERIAL     PRIMARY KEY,
  user_id          VARCHAR(64)   NOT NULL,  -- denormalized; no FK to avoid lock contention
  action_id        UUID,
  delta            INT           NOT NULL DEFAULT 0,
  score_before     BIGINT        NOT NULL,
  score_after      BIGINT        NOT NULL,
  ip_address       INET,
  outcome          VARCHAR(20)   NOT NULL,        -- 'success' | 'rejected' | 'error'
  rejection_reason VARCHAR(50),                   -- 'rate_limit' | 'duplicate' | 'invalid_jwt' | NULL
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);               -- monthly partitions for query performance

CREATE TABLE score_audit_log_y2026m03
  PARTITION OF score_audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Indexes for forensic queries
CREATE INDEX idx_audit_user_time ON score_audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_rejected  ON score_audit_log (outcome, created_at DESC)
  WHERE outcome != 'success';
```

#### 3.6.3 Atomic Transaction — Score Update

The entire write path executes within a **single ACID transaction**:

```sql
BEGIN;

-- Step 1: Mark action as processed (replay prevention)
-- If action_id already exists → PK violation → ROLLBACK → 409
INSERT INTO processed_actions (action_id, user_id)
VALUES ($1, $2);                    -- $1 = action_id, $2 = user_id

-- Step 2: Atomically increment score
UPDATE users
SET    score      = score + $3,     -- $3 = SCORE_DELTA (server-defined, never client-supplied)
       updated_at = NOW()
WHERE  id = $2
RETURNING score AS new_score;

COMMIT;
```

Redis update and WebSocket broadcast are performed **outside the transaction** after `COMMIT` to avoid holding row locks during I/O.

#### 3.6.4 Redis Data Structures

| Structure | Key | Description | TTL |
|-----------|-----|-------------|-----|
| Sorted Set | `leaderboard` | member = `user_id`, score = numeric points | No TTL |
| String | `ratelimit:{user_id}:{window_ts}` | Sliding-window request counter | = window duration (60s) |
| Pub/Sub channel | `scoreboard_channel` | Fanout leaderboard updates across server instances | — |

**Key Redis commands:**

```
# Update leaderboard after DB commit
ZADD leaderboard <new_score> <user_id>

# Fetch top 10
ZREVRANGE leaderboard 0 9 WITHSCORES

# Get a user's rank (0-indexed → add 1 for display)
ZREVRANK leaderboard <user_id>

# Rate limiting — atomic increment with auto-expiry
SET  ratelimit:{user_id}:{window_ts}  0  EX 60  NX   -- initialise if absent
INCR ratelimit:{user_id}:{window_ts}                  -- count this request

# Broadcast after score update
PUBLISH scoreboard_channel <json_payload>
```

**Leaderboard warm-up on server startup:**

```sql
-- Seed sorted set from PostgreSQL before accepting connections
SELECT id, score FROM users ORDER BY score DESC LIMIT 100;
```

```
ZADD leaderboard <score_1> <user_id_1> <score_2> <user_id_2> ...
```

Only after this bulk `ZADD` completes should the server begin accepting WebSocket connections and REST requests (see [Improvement #8](#8-leaderboard-cache-warm-up)).

#### 3.6.5 Data Lifecycle & Cleanup

| Table / Key | Retention | Mechanism |
|---|---|---|
| `processed_actions` | 30 days | Nightly cron: `DELETE WHERE processed_at < NOW() - INTERVAL '30 days'` |
| `score_audit_log` | 90 days online, 1 year cold | Drop old monthly partitions; export to S3 / data warehouse |
| Redis `leaderboard` | Indefinite (cache) | Rebuild from DB on startup or after flush |
| Redis `ratelimit:*` | Auto-expire | TTL = window duration (60s) |

#### 3.6.6 PostgreSQL ↔ Redis Consistency

The Redis Sorted Set is an **eventually consistent cache** of the PostgreSQL `score` column:

| Scenario | Behaviour |
|---|---|
| Redis is down during a score update | DB commit still succeeds; WS broadcast fails but no score is lost |
| Redis is flushed or restarted | Server re-seeds the sorted set from DB on next startup |
| Redis and DB drift out of sync | Run a periodic reconciliation job or schedule a full rebuild during off-peak hours |

---

### 3.7 Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `INVALID_ACTION` | Request body missing required fields or malformed |
| 401 | `UNAUTHORIZED` | JWT absent, expired, or signature invalid |
| 409 | `ALREADY_PROCESSED` | `action_id` was already submitted and processed |
| 429 | `RATE_LIMIT_EXCEEDED` | User exceeded the allowed request rate |
| 500 | `INTERNAL_ERROR` | Unhandled server error; details logged server-side only |

---

### 3.8 Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT verification (HS256) | — (required) |
| `JWT_ALGORITHM` | Algorithm used for JWT signing | `HS256` |
| `RATE_LIMIT_MAX` | Max score updates per window per user | `10` |
| `RATE_LIMIT_WINDOW_SEC` | Rate limit window in seconds | `60` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `DB_URL` | PostgreSQL connection URL | — (required) |
| `WS_PING_INTERVAL_SEC` | WebSocket ping interval in seconds | `30` |
| `WS_IDLE_TIMEOUT_SEC` | WebSocket idle timeout in seconds | `60` |
| `LEADERBOARD_SIZE` | Number of top users to track and broadcast | `10` |
| `SCORE_DELTA` | Points awarded per completed action | `10` |

---

## 4. Scalability Design

> **Diagram:** [`diagrams/05_horizontal_scaling.puml`](diagrams/05_horizontal_scaling.puml)

When deployed across multiple server instances behind a load balancer, WebSocket connections are distributed across instances. A score update processed by **Instance 1** must still broadcast to clients connected to **Instance 2** and **Instance 3**.

**Solution: Redis Pub/Sub fanout**

1. Every server instance subscribes to the Redis channel `scoreboard_channel` on startup.
2. After a successful score update, the Score Service publishes to `scoreboard_channel`.
3. All instances receive the message and broadcast to their locally connected WebSocket clients.

```
 Client A ──► Instance 1 ──► PostgreSQL
 Client B ──► Instance 2         │
 Client C ──► Instance 3         │
                   │          Redis Sorted Set
                   └──────────► Redis Pub/Sub ──► Instance 1 → Client A
                                              ├──► Instance 2 → Client B
                                              └──► Instance 3 → Client C
```

**Rate limiting** already uses Redis atomic counters, so it remains accurate across instances without changes.

---

## 5. Improvement Recommendations

The following are not required for the initial implementation but are recommended for production readiness.

### 1. Server-Issued Action Tokens (High Priority)

**Problem:** The current spec accepts any client-generated UUID as an `action_id`. A malicious user could fabricate UUIDs to simulate completed actions.

**Recommendation:** When an action begins, the server issues a short-lived signed `action_token` (JWT or HMAC, TTL ≤ 5 minutes). The score update endpoint verifies this token rather than a bare UUID. This proves the action was legitimately started server-side.

```
Action Start                         Score Update
     │                                     │
     ▼                                     ▼
Server issues signed action_token  ◄──── Client submits action_token
(stored server-side or self-contained)     Server verifies + redeems it
```

### 2. Server-Defined Score Delta

The score increment per action must be **defined entirely on the server**. The client must not supply a `delta` field. This is already reflected in the API spec (`action_id` only), but the implementation must enforce this explicitly—never read a score value from the request body.

### 3. Selective WebSocket Broadcast

**Problem:** Every score update broadcasts the full top-10 to all clients, even if the top-10 did not change (e.g., the user was ranked 500th).

**Recommendation:** Before broadcasting, compare the new top-10 against the last broadcast snapshot. Only broadcast if the list changed. This can reduce WebSocket traffic by 80–90% in a large user base.

### 4. WebSocket Token Refresh

WebSocket connections can be long-lived, but the JWT used at handshake time will expire. Options:

- **Option A (simple):** Close the connection when the token expires (code `4001`). Client reconnects with a fresh token.
- **Option B (seamless):** Implement a client-initiated token refresh message over the WebSocket channel before expiry.

Option A is sufficient for the initial implementation.

### 5. Anomaly Detection

A background service should monitor per-user score velocity over longer windows (hourly, daily). Unusual patterns (e.g., 10× historical average in one hour) should trigger:
- A flag for manual review, or
- Automatic temporary suspension pending investigation.

This is distinct from rate limiting, which only protects short windows.

### 6. Audit Logging

All score update events (successful and failed) should be written to an immutable append-only audit log with:

| Field | Description |
|-------|-------------|
| `user_id` | Who submitted |
| `action_id` | Which action |
| `timestamp` | When |
| `ip_address` | Source IP |
| `outcome` | `success` / `rejected` / `error` |
| `rejection_reason` | e.g. `rate_limit`, `duplicate`, `invalid_jwt` |

This supports forensic analysis and appeals for wrongful blocks.

### 7. `processed_actions` Archival

The `processed_actions` table will grow indefinitely. Implement a scheduled job (e.g., nightly cron) to archive rows older than 30 days to a cold-storage table or data warehouse. The 30-day window provides a reasonable replay protection period.

### 8. Leaderboard Cache Warm-Up

On server startup (or after a Redis flush), the leaderboard sorted set must be seeded from the database. Without this, the first broadcast would show an empty leaderboard.

**Suggested startup sequence:**
1. Query `SELECT id, score FROM users ORDER BY score DESC LIMIT <LEADERBOARD_SIZE * 10>`.
2. Bulk `ZADD leaderboard` for all returned users.
3. Only then start accepting WebSocket connections and REST requests.
