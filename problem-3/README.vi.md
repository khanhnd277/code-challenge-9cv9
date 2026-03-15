# Đặc Tả Module Cập Nhật Điểm & Bảng Xếp Hạng Trực Tiếp

## Mục Lục

1. [Thiết Kế Cấp Cao](#1-thiết-kế-cấp-cao)
   - [Bối Cảnh Nghiệp Vụ](#11-bối-cảnh-nghiệp-vụ)
   - [Sơ Đồ Ngữ Cảnh Hệ Thống](#12-sơ-đồ-ngữ-cảnh-hệ-thống)
   - [Các Quyết Định Thiết Kế Chính](#13-các-quyết-định-thiết-kế-chính)
2. [Thiết Kế Cấp Trung](#2-thiết-kế-cấp-trung)
   - [Kiến Trúc Thành Phần](#21-kiến-trúc-thành-phần)
   - [Trách Nhiệm Của Từng Module](#22-trách-nhiệm-của-từng-module)
   - [Lựa Chọn Công Nghệ](#23-lựa-chọn-công-nghệ)
3. [Thiết Kế Cấp Thấp](#3-thiết-kế-cấp-thấp)
   - [Tài Liệu API](#31-tài-liệu-api)
   - [Giao Thức WebSocket](#32-giao-thức-websocket)
   - [Sơ Đồ Tuần Tự Cập Nhật Điểm](#33-sơ-đồ-tuần-tự-cập-nhật-điểm)
   - [Vòng Đời WebSocket](#34-vòng-đời-websocket)
   - [Mô Hình Bảo Mật](#35-mô-hình-bảo-mật)
   - [Thiết Kế Cơ Sở Dữ Liệu](#36-thiết-kế-cơ-sở-dữ-liệu)
   - [Mã Lỗi](#37-mã-lỗi)
   - [Cấu Hình](#38-cấu-hình)
4. [Thiết Kế Khả Năng Mở Rộng](#4-thiết-kế-khả-năng-mở-rộng)
5. [Đề Xuất Cải Tiến](#5-đề-xuất-cải-tiến)

---

## Tổng Quan

Module này xử lý **cập nhật điểm theo thời gian thực** và **phát sóng bảng xếp hạng trực tiếp** cho tính năng bảng điểm của ứng dụng.

Module cung cấp:
- Một REST endpoint được bảo mật để gửi điểm sau xác thực.
- Một kênh WebSocket để phân phối top 10 bảng xếp hạng theo thời gian thực đến tất cả các client đang kết nối.

Phạm vi: module này **không** cấp phát JWT, quản lý tài khoản người dùng, hay định nghĩa "hành động" là gì. Những trách nhiệm đó thuộc về các service khác.

---

## 1. Thiết Kế Cấp Cao

### 1.1 Bối Cảnh Nghiệp Vụ

| # | Yêu Cầu | Giải Pháp Thiết Kế |
|---|---------|-------------------|
| 1 | Hiển thị top 10 điểm trên bảng xếp hạng | Sorted Set trong Redis; truy vấn sau mỗi lần cập nhật |
| 2 | Cập nhật bảng xếp hạng theo thời gian thực | WebSocket hub phát sóng sau mỗi lần thay đổi điểm thành công |
| 3 | Người dùng hoàn thành hành động → điểm tăng | REST endpoint tăng điểm nguyên tử trong DB |
| 4 | Frontend gọi API sau khi hoàn thành hành động | `POST /api/v1/scores/update` với JWT + action ID |
| 5 | Ngăn chặn tăng điểm trái phép | Xác thực JWT + giới hạn tốc độ + idempotency + delta do server kiểm soát |

### 1.2 Sơ Đồ Ngữ Cảnh Hệ Thống

> **Sơ đồ:** [`diagrams/01_system_context.puml`](diagrams/01_system_context.puml)

```
                     ┌────────────────────────────────────────┐
   Người dùng ───────►│            API Server                  │◄── Auth Service Ngoài
   (Trình duyệt)      │   (Module này)                         │    (chỉ cấp JWT)
                     │                                        │
                     │  POST /api/v1/scores/update            │
                     │  WS   /ws/scoreboard                   │
                     └──────────┬─────────────────┬──────────┘
                                │                 │
                          ┌─────▼────┐     ┌──────▼──────┐
                          │PostgreSQL│     │    Redis     │
                          │  (điểm)  │     │(bảng xếp hạng)│
                          └──────────┘     └─────────────┘
```

### 1.3 Các Quyết Định Thiết Kế Chính

| Quyết Định | Lựa Chọn | Lý Do |
|------------|---------|-------|
| Phương thức cập nhật trực tiếp | WebSocket (server-push) | Độ trễ thấp, ít overhead hơn polling; phù hợp với bảng xếp hạng thời gian thực |
| Lưu trữ bảng xếp hạng | Redis Sorted Set | Chèn O(log N), lấy top-K O(log N + K); tốc độ in-memory |
| Lưu trữ điểm bền vững | PostgreSQL (giao dịch ACID) | Nguồn dữ liệu chính thống; đảm bảo không mất điểm |
| Nguồn delta điểm | Do server định nghĩa (không do client cung cấp) | Client không thể thao túng giá trị tăng điểm |
| Ngăn chặn replay | Idempotency key (`action_id` UUID) | Ngăn gửi trùng lặp và tấn công replay |
| Cơ chế xác thực | JWT Bearer token | Stateless; tích hợp với auth service hiện có |
| Mở rộng WS ngang | Redis Pub/Sub | Phát sóng qua nhiều instance server mà không cần bộ nhớ dùng chung |

---

## 2. Thiết Kế Cấp Trung

### 2.1 Kiến Trúc Thành Phần

> **Sơ đồ:** [`diagrams/02_component_architecture.puml`](diagrams/02_component_architecture.puml)

```
┌──────────────────────────────────────────────────────────────┐
│                         API Server                           │
│                                                              │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │    Tầng Truyền Tải   │    │    Tầng Truyền Tải        │  │
│  │  REST Router         │    │   WebSocket Handler       │  │
│  │  POST /scores/update │    │   WS /ws/scoreboard       │  │
│  └──────────┬───────────┘    └─────────────┬─────────────┘  │
│             │                              │                 │
│  ┌──────────▼──────────────────────────────▼─────────────┐  │
│  │                  Chuỗi Middleware                      │  │
│  │  Auth MW  →  Rate Limiter  →  Idempotency Guard        │  │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐   │
│  │                  Logic Nghiệp Vụ                      │   │
│  │      Score Service  ←→  Leaderboard Service           │   │
│  └──────┬───────────────────────────────┬───────────────┘   │
│         │                               │                   │
│  ┌──────▼──────┐  ┌──────────────┐  ┌──▼──────────────┐    │
│  │ DB Repo     │  │ Redis Adapter │  │  WebSocket Hub  │    │
│  │(PostgreSQL) │  │(Sorted Set +  │  │(đăng ký kết nối │    │
│  │             │  │ Pub/Sub)      │  │ + phát sóng)    │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Trách Nhiệm Của Từng Module

#### Auth Middleware
- Xác thực JWT Bearer token trên mọi request và WebSocket handshake.
- Trích xuất `user_id` (claim `sub`) và `roles`.
- Từ chối ngay lập tức các token hết hạn, sai định dạng hoặc chữ ký không hợp lệ với `401`.
- **User ID KHÔNG BAO GIỜ được lấy từ request body** — luôn được trích xuất từ token.

#### Rate Limiter
- Kiểm tra sliding-window hoặc token-bucket theo từng user, thực thi trong Redis.
- Ngăn chặn một user xác thực gửi request ồ ạt trong thời gian ngắn.
- Trả về `429` kèm header `Retry-After` khi vượt giới hạn.
- Mặc định: **10 request mỗi cửa sổ 60 giây** theo `user_id` (có thể cấu hình).

#### Idempotency Guard
- Mỗi request mang một `action_id` (UUID v4) do client tạo.
- Kiểm tra bảng `processed_actions` trước khi xử lý.
- Từ chối các gửi trùng lặp với `409 Conflict`.
- Bảo vệ chống lại retry của client và tấn công replay.

#### Score Service
- Điều phối toàn bộ quy trình cập nhật điểm.
- Chạy giao dịch DB nguyên tử: chèn `processed_action` + tăng điểm.
- Ủy thác làm mới bảng xếp hạng và phát sóng WebSocket sau khi commit.

#### Leaderboard Service
- Bao bọc các thao tác Redis Sorted Set.
- `ZADD leaderboard <điểm> <user_id>` sau mỗi lần cập nhật.
- `ZREVRANGE leaderboard 0 9 WITHSCORES` để lấy top 10 hiện tại.
- `ZREVRANK leaderboard <user_id>` để trả về thứ hạng hiện tại của user.

#### WebSocket Hub
- Duy trì danh sách tất cả kết nối WebSocket đang hoạt động.
- Khi có kết nối mới: xác thực JWT, gửi `scoreboard:init` với top 10 hiện tại.
- Khi có cập nhật điểm: phát sóng `scoreboard:update` đến tất cả kết nối đã đăng ký.
- Quản lý heartbeat (ping/pong) và timeout khi idle.
- Subscribe Redis Pub/Sub để fanout trên nhiều instance.

### 2.3 Lựa Chọn Công Nghệ

| Tầng | Công Nghệ | Ghi Chú |
|------|-----------|---------|
| Truyền tải | HTTP/1.1 REST + WebSocket | Giao thức tương thích chuẩn với trình duyệt |
| Xác thực | JWT (HS256 hoặc RS256) | Được cấp bên ngoài; chỉ xác minh tại đây |
| Cơ sở dữ liệu | PostgreSQL | Giao dịch ACID đảm bảo tính toàn vẹn của điểm |
| Cache & Pub/Sub | Redis | Sorted Set cho bảng xếp hạng; Pub/Sub cho mở rộng ngang |
| Giới hạn tốc độ | Redis (sliding window) | Bộ đếm nguyên tử, dùng chung giữa các instance |

---

## 3. Thiết Kế Cấp Thấp

### 3.1 Tài Liệu API

#### `POST /api/v1/scores/update`

Gửi một hành động đã hoàn thành để tăng điểm của người dùng đã xác thực.

**Headers**

| Header | Giá Trị | Bắt Buộc |
|--------|---------|---------|
| `Authorization` | `Bearer <JWT>` | Có |
| `Content-Type` | `application/json` | Có |

**Request Body**

```json
{
  "action_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Trường | Kiểu | Mô Tả |
|--------|------|-------|
| `action_id` | UUID v4 | Định danh duy nhất do client tạo cho lần thực hiện hành động này. Chỉ được gửi đúng một lần. |

> **Lưu ý triển khai:** Giá trị delta điểm (mức tăng) được **định nghĩa phía server**, không do client cung cấp. Server ánh xạ ngữ cảnh của người dùng đã xác thực sang mức tăng phù hợp. Không chấp nhận trường `delta` từ client.

**Response Thành Công — `200 OK`**

```json
{
  "user_id": "user_abc123",
  "new_score": 1450,
  "rank": 3
}
```

**Response Lỗi**

| Status | Mã | Ý Nghĩa |
|--------|-----|---------|
| 400 | `INVALID_ACTION` | `action_id` bị thiếu hoặc không phải UUID hợp lệ |
| 401 | `UNAUTHORIZED` | JWT bị thiếu, hết hạn hoặc chữ ký không hợp lệ |
| 409 | `ALREADY_PROCESSED` | `action_id` đã được gửi trước đó |
| 429 | `RATE_LIMIT_EXCEEDED` | Người dùng gửi quá nhiều request |
| 500 | `INTERNAL_ERROR` | Lỗi server không mong muốn |

---

### 3.2 Giao Thức WebSocket

#### Kết Nối

```
WS  /ws/scoreboard
WSS /ws/scoreboard          ← bắt buộc trên môi trường production

Cách truyền token (chọn một):
  Query param:  ?token=<JWT>       ← cho trình duyệt (native WebSocket API)
  Header:       Authorization: Bearer <JWT>  ← cho client không phải trình duyệt
```

> **Lưu ý bảo mật:** Khi dùng query param để truyền token, JWT sẽ hiển thị trong access log của server. Dùng token ngắn hạn (≤ 5 phút) cho WS handshake, hoặc vé WS một lần sử dụng do auth service cấp.

#### Sự Kiện Server → Client

**`scoreboard:init`** — gửi ngay sau khi kết nối thành công.

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

**`scoreboard:update`** — phát sóng đến tất cả client sau bất kỳ lần cập nhật điểm nào.

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

#### Quy Tắc Vòng Đời Kết Nối

| Quy Tắc | Giá Trị |
|---------|---------|
| Chu kỳ ping từ server | 30 giây |
| Timeout khi idle (không có pong) | 60 giây |
| Chiến lược reconnect của client | Exponential backoff: 1s → 2s → 4s → … → 30s (tối đa) |
| Xử lý khi token hết hạn | Server đóng kết nối với mã `4001`; client phải reconnect với token mới |

---

### 3.3 Sơ Đồ Tuần Tự Cập Nhật Điểm

> **Sơ đồ:** [`diagrams/03_score_update_sequence.puml`](diagrams/03_score_update_sequence.puml)

Bao gồm:
- **Luồng thành công:** Xác thực JWT → kiểm tra rate limit → kiểm tra idempotency → giao dịch DB → cập nhật Redis → phát sóng WebSocket → `200 OK`
- **Lỗi: JWT hết hạn** → `401`
- **Lỗi: vượt rate limit** → `429`
- **Lỗi: action_id trùng lặp** → `409`

**Tóm tắt luồng thành công:**

```
Client               API Server                    DB          Redis        WS Clients
  │                      │                          │             │              │
  ├─POST /scores/update──►│                          │             │              │
  │                      ├─Xác thực JWT─────────────┤             │              │
  │                      ├─Kiểm tra rate (Redis)──────────────────►│              │
  │                      ├─Kiểm tra idempotency (DB)►│             │              │
  │                      ├─BEGIN TX──────────────────►│             │              │
  │                      ├─INSERT processed_action───►│             │              │
  │                      ├─UPDATE score──────────────►│             │              │
  │                      ├─COMMIT────────────────────►│             │              │
  │                      ├─ZADD / ZREVRANGE────────────────────────►│              │
  │                      ├─Phát sóng scoreboard:update──────────────────────────►│
  │◄──200 OK─────────────┤                          │             │              │
```

---

### 3.4 Vòng Đời WebSocket

> **Sơ đồ:** [`diagrams/04_websocket_lifecycle.puml`](diagrams/04_websocket_lifecycle.puml)

Bao gồm:
- Kết nối ban đầu và JWT handshake
- Gửi `scoreboard:init`
- Heartbeat ping/pong định kỳ
- Phát sóng cập nhật điểm từ Redis Pub/Sub
- Ngắt kết nối khi idle timeout
- Ngắt kết nối khi token hết hạn và client reconnect

---

### 3.5 Mô Hình Bảo Mật

#### Xác Thực

Tất cả request (REST và WebSocket handshake) đều yêu cầu JWT hợp lệ được ký bằng secret của server.

| Claim | Mô Tả |
|-------|-------|
| `sub` | User ID (định danh duy nhất) |
| `exp` | Timestamp hết hạn (Unix epoch) |
| `iat` | Timestamp cấp phát |
| `roles` | Mảng các chuỗi vai trò (ví dụ: `["user"]`) |

Token được **cấp phát bởi auth service bên ngoài** và chỉ được xác minh tại đây.

#### Phân Quyền

`user_id` **luôn được trích xuất từ claim `sub` của JWT**, không bao giờ từ request body. Điều này ngăn người dùng gửi cập nhật điểm thay mặt người khác.

#### Idempotency & Ngăn Chặn Replay

- Mỗi `action_id` (UUID v4) được lưu vào `processed_actions` sau lần xử lý đầu tiên.
- Bất kỳ lần gửi lại nào với cùng `action_id` → `409 Conflict`.
- Bảo vệ chống gửi trùng lặp do retry mạng và tấn công replay từ request bị bắt.

#### Giới Hạn Tốc Độ

| Tham Số | Mặc Định |
|---------|---------|
| Số request tối đa mỗi cửa sổ | 10 |
| Thời gian cửa sổ | 60 giây |
| Phạm vi | Theo `user_id` |
| Lưu trữ | Redis (bộ đếm nguyên tử) |

Vượt giới hạn trả về `429` kèm header `Retry-After: <giây>`.

#### Bảo Mật Truyền Tải

- Tất cả traffic phải được phục vụ qua **HTTPS / WSS**.
- Kết nối HTTP và WS thuần phải bị từ chối hoặc chuyển hướng.

---

### 3.6 Thiết Kế Cơ Sở Dữ Liệu

#### 3.6.1 Sơ Đồ Thực Thể - Quan Hệ (ERD)

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
            │ 1:N  (tùy chọn — Cải tiến #6)
            ▼
┌────────────────────────────────────────────────────────┐
│                     score_audit_log                     │
├────────────────────────────────────────────────────────┤
│ PK  id               BIGSERIAL                          │
│     user_id          VARCHAR(64)   -- phi chuẩn hóa    │
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

#### 3.6.2 PostgreSQL — DDL Đầy Đủ

##### Bảng `users`

```sql
CREATE TABLE users (
  id          VARCHAR(64)   PRIMARY KEY,
  username    VARCHAR(100)  NOT NULL,
  score       BIGINT        NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_score_non_negative CHECK (score >= 0)
);

-- Hỗ trợ truy vấn seed bảng xếp hạng khi server khởi động
CREATE INDEX idx_users_score_desc ON users (score DESC);
```

##### Bảng `processed_actions`

```sql
CREATE TABLE processed_actions (
  action_id    UUID          PRIMARY KEY,           -- idempotency key
  user_id      VARCHAR(64)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Hỗ trợ truy vấn lịch sử theo user và cron job dọn dẹp
CREATE INDEX idx_processed_actions_user    ON processed_actions (user_id);
CREATE INDEX idx_processed_actions_cleanup ON processed_actions (processed_at);
```

> **Ràng buộc quan trọng:** `action_id` là PRIMARY KEY nên lookup idempotency là O(1) — không cần index riêng.

> **Dọn dẹp:** Chạy cron hàng đêm để xóa các hàng cũ hơn 30 ngày. Cửa sổ 30 ngày cung cấp khả năng bảo vệ replay đủ trong khi ngăn bảng tăng trưởng vô hạn. Xem [Cải tiến #7](#7-lưu-trữ-processed_actions).

##### Bảng `score_audit_log` *(tùy chọn — Cải tiến #6)*

```sql
CREATE TABLE score_audit_log (
  id               BIGSERIAL     PRIMARY KEY,
  user_id          VARCHAR(64)   NOT NULL,  -- phi chuẩn hóa; không FK để tránh lock contention
  action_id        UUID,
  delta            INT           NOT NULL DEFAULT 0,
  score_before     BIGINT        NOT NULL,
  score_after      BIGINT        NOT NULL,
  ip_address       INET,
  outcome          VARCHAR(20)   NOT NULL,        -- 'success' | 'rejected' | 'error'
  rejection_reason VARCHAR(50),                   -- 'rate_limit' | 'duplicate' | 'invalid_jwt' | NULL
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);               -- partition theo tháng để tối ưu hiệu suất truy vấn

CREATE TABLE score_audit_log_y2026m03
  PARTITION OF score_audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Index hỗ trợ phân tích forensic
CREATE INDEX idx_audit_user_time ON score_audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_rejected  ON score_audit_log (outcome, created_at DESC)
  WHERE outcome != 'success';
```

#### 3.6.3 Giao Dịch Nguyên Tử — Cập Nhật Điểm

Toàn bộ quy trình ghi được bọc trong **một giao dịch ACID duy nhất**:

```sql
BEGIN;

-- Bước 1: Đánh dấu action đã xử lý (chặn replay)
-- Nếu action_id đã tồn tại → vi phạm PK → ROLLBACK → 409
INSERT INTO processed_actions (action_id, user_id)
VALUES ($1, $2);                    -- $1 = action_id, $2 = user_id

-- Bước 2: Tăng điểm nguyên tử
UPDATE users
SET    score      = score + $3,     -- $3 = SCORE_DELTA (do server định nghĩa, không do client cung cấp)
       updated_at = NOW()
WHERE  id = $2
RETURNING score AS new_score;

COMMIT;
```

Cập nhật Redis và phát sóng WebSocket được thực hiện **ngoài giao dịch** sau khi `COMMIT` để tránh giữ row lock trong thời gian I/O.

#### 3.6.4 Redis — Cấu Trúc Dữ Liệu

| Cấu Trúc | Key | Mô Tả | TTL |
|----------|-----|-------|-----|
| Sorted Set | `leaderboard` | member = `user_id`, score = điểm số | Không TTL |
| String | `ratelimit:{user_id}:{window_ts}` | Bộ đếm sliding-window request | = thời gian cửa sổ (60s) |
| Pub/Sub channel | `scoreboard_channel` | Fanout cập nhật bảng xếp hạng giữa các instance | — |

**Các lệnh Redis chính:**

```
# Cập nhật bảng xếp hạng sau khi DB commit
ZADD leaderboard <new_score> <user_id>

# Lấy top 10
ZREVRANGE leaderboard 0 9 WITHSCORES

# Lấy thứ hạng của một user (0-indexed → +1 để hiển thị)
ZREVRANK leaderboard <user_id>

# Giới hạn tốc độ — tăng nguyên tử với tự hết hạn
SET  ratelimit:{user_id}:{window_ts}  0  EX 60  NX   -- khởi tạo nếu chưa có
INCR ratelimit:{user_id}:{window_ts}                  -- đếm request này

# Phát sóng sau khi cập nhật điểm
PUBLISH scoreboard_channel <json_payload>
```

**Khởi tạo bảng xếp hạng khi server khởi động:**

```sql
-- Truy vấn seed sorted set từ PostgreSQL trước khi chấp nhận kết nối
SELECT id, score FROM users ORDER BY score DESC LIMIT 100;
```

```
ZADD leaderboard <score_1> <user_id_1> <score_2> <user_id_2> ...
```

Chỉ sau khi `ZADD` hàng loạt hoàn tất, server mới bắt đầu chấp nhận kết nối WebSocket và REST request (xem [Cải tiến #8](#8-khởi-tạo-cache-bảng-xếp-hạng)).

#### 3.6.5 Vòng Đời Dữ Liệu & Dọn Dẹp

| Bảng / Key | Chính sách lưu giữ | Cơ chế |
|---|---|---|
| `processed_actions` | 30 ngày | Cron hàng đêm: `DELETE WHERE processed_at < NOW() - INTERVAL '30 days'` |
| `score_audit_log` | 90 ngày online, 1 năm cold | Drop partition cũ hàng tháng; export sang S3 / data warehouse |
| Redis `leaderboard` | Vô thời hạn (cache) | Rebuild từ DB khi server khởi động hoặc sau khi flush |
| Redis `ratelimit:*` | Tự hết hạn | TTL = độ dài cửa sổ (60s) |

#### 3.6.6 Nhất Quán PostgreSQL ↔ Redis

Redis Sorted Set là **cache nhất quán cuối cùng** của cột `score` trong PostgreSQL:

| Tình huống | Hành Vi |
|---|---|
| Redis down khi cập nhật điểm | DB commit vẫn thành công; phát sóng WS thất bại nhưng điểm không mất |
| Redis bị flush hoặc restart | Server seed lại sorted set từ DB khi khởi động lần sau |
| Redis và DB mất đồng bộ | Chạy job đối chiếu định kỳ hoặc rebuild toàn bộ vào giờ thấp điểm |

---

### 3.7 Mã Lỗi

| HTTP Status | Mã Lỗi | Mô Tả |
|-------------|--------|-------|
| 400 | `INVALID_ACTION` | Request body thiếu trường bắt buộc hoặc sai định dạng |
| 401 | `UNAUTHORIZED` | JWT bị thiếu, hết hạn hoặc chữ ký không hợp lệ |
| 409 | `ALREADY_PROCESSED` | `action_id` đã được gửi và xử lý trước đó |
| 429 | `RATE_LIMIT_EXCEEDED` | Người dùng vượt giới hạn request cho phép |
| 500 | `INTERNAL_ERROR` | Lỗi server không xử lý được; chi tiết chỉ được ghi log phía server |

---

### 3.8 Cấu Hình

| Biến | Mô Tả | Mặc Định |
|------|-------|---------|
| `JWT_SECRET` | Khóa bí mật để xác minh JWT (HS256) | — (bắt buộc) |
| `JWT_ALGORITHM` | Thuật toán ký JWT | `HS256` |
| `RATE_LIMIT_MAX` | Số cập nhật điểm tối đa mỗi cửa sổ mỗi user | `10` |
| `RATE_LIMIT_WINDOW_SEC` | Thời gian cửa sổ rate limit (giây) | `60` |
| `REDIS_URL` | URL kết nối Redis | `redis://localhost:6379` |
| `DB_URL` | URL kết nối PostgreSQL | — (bắt buộc) |
| `WS_PING_INTERVAL_SEC` | Chu kỳ ping WebSocket (giây) | `30` |
| `WS_IDLE_TIMEOUT_SEC` | Timeout idle WebSocket (giây) | `60` |
| `LEADERBOARD_SIZE` | Số user top cần theo dõi và phát sóng | `10` |
| `SCORE_DELTA` | Điểm thưởng cho mỗi hành động hoàn thành | `10` |

---

## 4. Thiết Kế Khả Năng Mở Rộng

> **Sơ đồ:** [`diagrams/05_horizontal_scaling.puml`](diagrams/05_horizontal_scaling.puml)

Khi triển khai trên nhiều server instance phía sau load balancer, các kết nối WebSocket được phân phối đến các instance khác nhau. Một cập nhật điểm được xử lý bởi **Instance 1** vẫn phải phát sóng đến các client kết nối với **Instance 2** và **Instance 3**.

**Giải pháp: Redis Pub/Sub fanout**

1. Mỗi server instance subscribe vào kênh Redis `scoreboard_channel` khi khởi động.
2. Sau khi cập nhật điểm thành công, Score Service publish lên `scoreboard_channel`.
3. Tất cả instance nhận được message và phát sóng đến các WebSocket client đang kết nối cục bộ.

```
 Client A ──► Instance 1 ──► PostgreSQL
 Client B ──► Instance 2         │
 Client C ──► Instance 3         │
                   │          Redis Sorted Set
                   └──────────► Redis Pub/Sub ──► Instance 1 → Client A
                                              ├──► Instance 2 → Client B
                                              └──► Instance 3 → Client C
```

**Giới hạn tốc độ** đã dùng Redis atomic counters nên vẫn chính xác trên nhiều instance mà không cần thay đổi gì thêm.

---

## 5. Đề Xuất Cải Tiến

Các mục sau không bắt buộc cho triển khai ban đầu nhưng được khuyến nghị cho môi trường production.

### 1. Action Token Do Server Cấp (Ưu Tiên Cao)

**Vấn đề:** Đặc tả hiện tại chấp nhận bất kỳ UUID nào do client tạo ra làm `action_id`. Người dùng độc hại có thể tạo UUID giả để giả lập các hành động đã hoàn thành.

**Đề xuất:** Khi hành động bắt đầu, server cấp một `action_token` ngắn hạn có chữ ký (JWT hoặc HMAC, TTL ≤ 5 phút). Endpoint cập nhật điểm xác minh token này thay vì UUID thuần. Điều này chứng minh hành động được khởi tạo hợp lệ phía server.

```
Bắt Đầu Hành Động                  Cập Nhật Điểm
        │                                  │
        ▼                                  ▼
Server cấp action_token có chữ ký ◄─── Client gửi action_token
(lưu phía server hoặc self-contained)    Server xác minh + đánh dấu đã dùng
```

### 2. Delta Điểm Do Server Định Nghĩa

Mức tăng điểm mỗi hành động phải được **định nghĩa hoàn toàn phía server**. Client không được cung cấp trường `delta`. Điều này đã được phản ánh trong đặc tả API (chỉ có `action_id`), nhưng việc triển khai phải thực thi rõ ràng — không bao giờ đọc giá trị điểm từ request body.

### 3. Phát Sóng WebSocket Có Chọn Lọc

**Vấn đề:** Mỗi lần cập nhật điểm đều phát sóng top 10 đầy đủ đến tất cả client, dù top 10 không thay đổi (ví dụ: user xếp hạng 500).

**Đề xuất:** Trước khi phát sóng, so sánh top 10 mới với snapshot đã phát sóng lần trước. Chỉ phát sóng nếu danh sách thay đổi. Điều này có thể giảm 80–90% traffic WebSocket với lượng user lớn.

### 4. Làm Mới Token WebSocket

Kết nối WebSocket có thể tồn tại lâu dài, nhưng JWT dùng lúc handshake sẽ hết hạn. Các lựa chọn:

- **Lựa chọn A (đơn giản):** Đóng kết nối khi token hết hạn (mã `4001`). Client reconnect với token mới.
- **Lựa chọn B (liền mạch):** Triển khai cơ chế làm mới token do client khởi tạo qua kênh WebSocket trước khi token hết hạn.

Lựa chọn A đủ dùng cho triển khai ban đầu.

### 5. Phát Hiện Bất Thường

Một background service nên theo dõi tốc độ tăng điểm theo từng user qua các cửa sổ thời gian dài hơn (theo giờ, theo ngày). Các mẫu bất thường (ví dụ: tăng gấp 10 lần trung bình lịch sử trong một giờ) nên kích hoạt:
- Gắn cờ để xem xét thủ công, hoặc
- Tạm đình chỉ tự động chờ điều tra.

Điều này khác với giới hạn tốc độ vốn chỉ bảo vệ cửa sổ ngắn hạn.

### 6. Ghi Log Kiểm Toán

Tất cả sự kiện cập nhật điểm (thành công và thất bại) nên được ghi vào audit log bất biến chỉ-thêm với:

| Trường | Mô Tả |
|--------|-------|
| `user_id` | Ai gửi |
| `action_id` | Hành động nào |
| `timestamp` | Khi nào |
| `ip_address` | IP nguồn |
| `outcome` | `success` / `rejected` / `error` |
| `rejection_reason` | ví dụ: `rate_limit`, `duplicate`, `invalid_jwt` |

Hỗ trợ phân tích pháp y và xử lý khiếu nại về chặn nhầm.

### 7. Lưu Trữ `processed_actions`

Bảng `processed_actions` sẽ tăng trưởng vô hạn. Triển khai một scheduled job (ví dụ: cron hàng đêm) để lưu trữ các hàng cũ hơn 30 ngày vào bảng cold-storage hoặc data warehouse. Cửa sổ 30 ngày cung cấp thời gian bảo vệ replay hợp lý.

### 8. Khởi Tạo Cache Bảng Xếp Hạng

Khi server khởi động (hoặc sau khi Redis bị xóa), sorted set bảng xếp hạng phải được khởi tạo từ database. Nếu không, lần phát sóng đầu tiên sẽ hiển thị bảng xếp hạng trống.

**Trình tự khởi động đề xuất:**
1. Truy vấn `SELECT id, score FROM users ORDER BY score DESC LIMIT <LEADERBOARD_SIZE * 10>`.
2. `ZADD leaderboard` hàng loạt cho tất cả user trả về.
3. Chỉ sau đó mới bắt đầu chấp nhận kết nối WebSocket và REST request.
