# VulnScout AI — Backend System Design

## Table of Contents

1. [Problem & Goals](#1-problem--goals)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Core Components](#3-core-components)
4. [Data Model](#4-data-model)
5. [API Design](#5-api-design)
6. [AI Agent Design](#6-ai-agent-design)
7. [Sandbox Architecture](#7-sandbox-architecture)
8. [Static Analysis Pipeline](#8-static-analysis-pipeline)
9. [Real-Time Streaming](#9-real-time-streaming)
10. [Security Model](#10-security-model)
11. [Tech Stack](#11-tech-stack)
12. [Phased Roadmap](#12-phased-roadmap)

---

## 1. Problem & Goals

### Problem

Development teams ship APIs with security vulnerabilities they can't see. Traditional pentests are slow (weeks), expensive, and produce reports that are already stale by the time they're delivered. Static analysis tools catch patterns but miss runtime logic flaws. Manual testers don't scale.

### What VulnScout AI Does

1. **Ingests** a user's backend service (GitHub repo, Docker image, or OpenAPI spec).
2. **Spins up** an isolated, ephemeral replica of that service in a sandboxed environment.
3. **Analyzes** the code statically to map the attack surface and identify risky patterns.
4. **Deploys** an AI agent that actively attacks the running service — probing for real, runtime vulnerabilities.
5. **Returns** a prioritized report of findings with severity scores, exact reproduction steps (curl commands, request/response pairs), and fix recommendations.

### Goals

- **Real vulnerabilities only.** The agent attacks a live service, not just reads code. Every finding has a proof: an actual HTTP request that demonstrates the flaw.
- **Zero production risk.** The sandbox is fully isolated — no attack traffic ever reaches the user's real infrastructure.
- **Fast.** First finding in under 5 minutes. Full scan in under 15 minutes for typical APIs.
- **Actionable.** Every finding ships with reproduction steps and a suggested fix, not just a vulnerability name.
- **Web-first.** Everything is configured and triggered through the web app. No CLI, no agents to install.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Web App (React)                              │
│          Dashboard · Scan Config · Live Progress · Reports           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  REST + WebSocket
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        API Server (Express/TS)                       │
│   Auth · Scans · Services · Findings · WebSocket gateway             │
└──────┬────────────────────┬────────────────────────────┬─────────────┘
       │                    │                            │
       ▼                    ▼                            ▼
┌─────────────┐    ┌─────────────────┐         ┌───────────────────┐
│  PostgreSQL  │    │  Redis + BullMQ  │         │  Scan Worker Pool  │
│  (primary   │    │  (job queues +   │◄────────│  (N worker procs)  │
│   data)     │    │   pub/sub)       │         └────────┬──────────┘
└─────────────┘    └─────────────────┘                  │
                                                         │ orchestrates
                                          ┌──────────────▼──────────────┐
                                          │       Scan Orchestrator      │
                                          │                              │
                                          │  ┌────────────────────────┐ │
                                          │  │  1. Ingest & Build      │ │
                                          │  │  2. Static Analyzer     │ │
                                          │  │  3. Sandbox Manager     │ │
                                          │  │  4. AI Agent Runner     │ │
                                          │  │  5. Report Generator    │ │
                                          │  └────────────────────────┘ │
                                          └──────────────┬──────────────┘
                                                         │
                                          ┌──────────────▼──────────────┐
                                          │    Docker Sandbox Network    │
                                          │                              │
                                          │  ┌──────────┐ ┌──────────┐  │
                                          │  │  Target  │ │  Deps    │  │
                                          │  │ Service  │ │ (DB etc) │  │
                                          │  └──────────┘ └──────────┘  │
                                          │                              │
                                          │  ┌──────────────────────┐   │
                                          │  │   Attack Executor     │   │
                                          │  │ (fires HTTP payloads) │   │
                                          │  └──────────────────────┘   │
                                          │                              │
                                          │  ← isolated network →        │
                                          │  ← no internet access →      │
                                          │  ← 30-min TTL →              │
                                          └──────────────────────────────┘
```

---

## 3. Core Components

### 3.1 API Server

The public-facing HTTP + WebSocket server. Responsibilities:

- Authenticate requests (JWT-based sessions).
- CRUD for users, organizations, services, scans, and findings.
- Enqueue scan jobs onto BullMQ.
- Forward real-time scan events to connected WebSocket clients via Redis pub/sub.
- No heavy computation — delegates all scan work to workers.

### 3.2 Scan Worker Pool

Long-running worker processes that pull jobs from BullMQ and execute scans end-to-end. Each worker runs a `ScanOrchestrator` that coordinates the five phases of a scan (see §3.3). Workers are stateless and horizontally scalable.

```
ScanWorker
  └─ picks up job from BullMQ queue "scans"
  └─ instantiates ScanOrchestrator(scanId)
  └─ orchestrator runs phases 1–5
  └─ publishes progress events to Redis pub/sub channel "scan:{scanId}"
  └─ writes findings to PostgreSQL
  └─ marks job complete / failed
```

### 3.3 Scan Orchestrator

Coordinates the full lifecycle of one scan. Runs five sequential phases:

#### Phase 1 — Ingest & Build
- Clone the git repo or pull the Docker image.
- Parse `docker-compose.yml`, `package.json`, `requirements.txt`, etc. to identify:
  - The main service image / build steps.
  - Any dependency services (databases, caches, queues).
  - Required environment variables.
- Build the Docker image if needed.
- Resolve any user-supplied env vars from the scan config.
- Emit progress: `{ phase: "ingest", status: "done" }`

#### Phase 2 — Static Analyzer
- Run static analysis on the source code before starting anything.
- Outputs a `StaticAnalysisResult` that is fed into the AI agent as context.
- See §8 for detail.

#### Phase 3 — Sandbox Manager
- Create an isolated Docker network (`sandbox-{scanId}`).
- Start dependency containers (Postgres, Redis, etc.) on that network.
- Start the user's service container on that network.
- Health-check the service until it responds (or timeout after 2 min).
- Return a `SandboxContext` with the internal URL of the service.

#### Phase 4 — AI Agent Runner
- Receive `SandboxContext` + `StaticAnalysisResult`.
- Run the AI agent (Claude claude-opus-4-6) in a ReAct loop against the live service.
- Agent has a set of tools (see §6) to make HTTP requests and record findings.
- Stream findings back in real-time as they're discovered.
- Enforce a maximum token budget and wall-clock timeout (default 10 min).

#### Phase 5 — Report Generator
- Aggregate all findings from the database.
- Deduplicate (same vuln class + same endpoint = one finding).
- CVSS-score each finding.
- Generate a structured report (JSON) and a human-readable summary.
- Tear down the sandbox environment.
- Mark scan as `completed`.

### 3.4 Sandbox Manager

Wraps the Docker Engine API (via `dockerode`). Responsibilities:

- Create per-scan isolated bridge networks.
- Start / stop / inspect containers.
- Enforce resource limits (CPU, memory, no network egress).
- Destroy all resources for a scan on completion or TTL expiry.
- A background sweeper job runs every 5 min to reap orphaned sandboxes.

### 3.5 AI Agent Runner

A thin runner that instantiates the Anthropic client, builds the system prompt, registers tools, and drives the agent loop. Returns a stream of `AgentEvent` objects (thinking, tool call, finding, etc.) that are forwarded to the pub/sub channel.

### 3.6 Static Analyzer

Source-code analysis that runs before any dynamic testing. Outputs structured context used to prime the AI agent. See §8.

### 3.7 Report Generator

Assembles the final report from raw findings. Handles deduplication, CVSS scoring, and export formatting (JSON, PDF-ready HTML).

---

## 4. Data Model

### `users`
```
id            uuid        PK
email         text        UNIQUE NOT NULL
password_hash text
name          text
org_id        uuid        FK → organizations
role          enum        (member | admin | owner)
created_at    timestamptz
```

### `organizations`
```
id            uuid        PK
name          text
plan          enum        (starter | pro | enterprise)
scan_quota    int         (monthly limit; null = unlimited)
created_at    timestamptz
```

### `services`
A "connected service" that can be scanned repeatedly.
```
id            uuid        PK
org_id        uuid        FK → organizations
name          text
source_type   enum        (github | docker_image | openapi_spec | zip_upload)
source_config jsonb       -- repo URL + branch, image name, spec URL, etc.
env_vars      jsonb       -- encrypted at rest; keys only stored, values in secrets store
created_at    timestamptz
updated_at    timestamptz
```

### `scans`
One execution of the pentest agent against a service.
```
id            uuid        PK
service_id    uuid        FK → services
org_id        uuid        FK → organizations
created_by    uuid        FK → users
status        enum        (queued | ingest | static_analysis | sandbox_starting |
                           attacking | reporting | completed | failed | cancelled)
attack_profile jsonb      -- selected attack types, depth, auth config
static_result  jsonb      -- output of static analysis phase
sandbox_id    text        -- Docker network name for this scan
started_at    timestamptz
completed_at  timestamptz
error         text        -- populated on failure
created_at    timestamptz
```

### `findings`
Each vulnerability discovered during a scan.
```
id                uuid        PK
scan_id           uuid        FK → scans
service_id        uuid        FK → services
severity          enum        (critical | high | medium | low | info)
cvss_score        decimal(4,1)
vuln_class        text        -- e.g. "sql_injection", "idor", "auth_bypass"
title             text
description       text
endpoint          text        -- e.g. "POST /api/auth/login"
http_method       text
proof_request     jsonb       -- exact HTTP request that triggered the vuln
                              -- { method, url, headers, body }
proof_response    jsonb       -- the response that confirmed it
                              -- { status, headers, body_excerpt }
curl_command      text        -- ready-to-run curl reproduction step
fix_suggestion    text
cwe_id            text        -- e.g. "CWE-89"
owasp_category    text        -- e.g. "API1:2023 Broken Object Level Authorization"
false_positive    boolean     DEFAULT false
created_at        timestamptz
```

### `scan_events`
Append-only log of all events during a scan. Used to replay scan progress.
```
id          uuid        PK
scan_id     uuid        FK → scans
event_type  text        -- "phase_change" | "agent_thought" | "attack_fired" |
                        --  "finding_discovered" | "error"
payload     jsonb
created_at  timestamptz
```

### `api_keys`
```
id          uuid        PK
org_id      uuid        FK → organizations
name        text
key_hash    text        UNIQUE
last_used   timestamptz
expires_at  timestamptz
created_at  timestamptz
```

---

## 5. API Design

Base path: `/api/v1`

All endpoints require `Authorization: Bearer <token>` unless marked public.

### Auth
```
POST   /auth/register              Create account
POST   /auth/login                 Returns JWT
POST   /auth/logout
POST   /auth/refresh
```

### Services
```
GET    /services                   List org's services
POST   /services                   Connect a new service
GET    /services/:id
PATCH  /services/:id               Update source config or env vars
DELETE /services/:id
POST   /services/:id/validate      Test that the service can be cloned/pulled
```

### Scans
```
GET    /scans                      List scans (filterable by service, status, date)
POST   /scans                      Create & enqueue a scan
GET    /scans/:id                  Scan detail + current status
DELETE /scans/:id                  Cancel a running scan
GET    /scans/:id/findings         All findings for a scan
GET    /scans/:id/events           Paginated event log for replay
GET    /scans/:id/report           Full report (JSON)
GET    /scans/:id/report.html      HTML report for PDF rendering
```

### Findings
```
GET    /findings/:id               Single finding detail
PATCH  /findings/:id               Mark as false positive, add notes
```

### WebSocket
```
WS     /ws/scans/:id               Real-time event stream for a scan
```

WebSocket message types sent from server:

```typescript
type ScanEvent =
  | { type: "phase_change";       phase: ScanStatus; message: string }
  | { type: "agent_thought";      content: string }
  | { type: "attack_fired";       method: string; path: string; attack: string }
  | { type: "finding_discovered"; finding: FindingSummary }
  | { type: "scan_completed";     summary: ScanSummary }
  | { type: "scan_failed";        error: string }
```

---

## 6. AI Agent Design

The AI agent is the core intelligence of VulnScout AI. It is a **tool-calling agent** powered by Claude claude-opus-4-6, running in a ReAct loop.

### Agent Architecture

```
ScanOrchestrator
  └─ AgentRunner
       ├─ System prompt (security expert persona + context)
       ├─ Tool registry
       └─ Execution loop
            ├─ Call Claude with current message history
            ├─ If tool_use → execute tool → append result → loop
            ├─ If text → stream as "agent_thought" event
            └─ If stop_reason == "end_turn" → done
```

### System Prompt Structure

The system prompt is dynamically assembled per scan and includes:

1. **Persona** — "You are an expert penetration tester..."
2. **Target context** — The service name, tech stack, base URL in the sandbox.
3. **Static analysis findings** — Risky patterns found in the code (e.g. "raw SQL concatenation found in `src/db/users.ts` line 42").
4. **Attack profile** — Which vulnerability classes to test.
5. **Rules of engagement** — Only attack the sandbox URL. Record every confirmed finding with proof. Do not stop until all attack classes have been tested.

### Tools

```typescript
// Fire an HTTP request at the sandboxed service
http_request({
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,           // e.g. "/api/users/1"
  headers?: Record<string, string>,
  body?: unknown,
  follow_redirects?: boolean,
}): HttpResponse

// Record a confirmed vulnerability
record_finding({
  vuln_class: string,     // e.g. "sql_injection"
  title: string,
  description: string,
  severity: "critical" | "high" | "medium" | "low",
  endpoint: string,
  proof_request: HttpRequest,
  proof_response: HttpResponseSummary,
  fix_suggestion: string,
  cwe_id?: string,
  owasp_category?: string,
}): { finding_id: string }

// Get the list of endpoints discovered from static analysis + spec
get_endpoints(): Array<{
  method: string,
  path: string,
  auth_required: boolean | "unknown",
  params: string[],
}>

// Set auth credentials for subsequent http_request calls
set_auth({
  type: "bearer" | "basic" | "api_key" | "cookie",
  value: string,
  header?: string,   // for api_key type
})

// Get the current list of findings recorded so far
list_findings(): FindingSummary[]
```

### Attack Phases (Agent Strategy)

The system prompt instructs the agent to work through these phases in order:

**Phase A — Reconnaissance**
- Call `get_endpoints()` to get the known surface.
- Make unauthenticated requests to each endpoint to understand the app's behavior.
- Identify auth endpoints (login, register, token refresh).

**Phase B — Authentication Attacks**
- Test login endpoints for SQL injection in credentials.
- Test for JWT algorithm confusion (`alg: none`, RS256→HS256).
- Test for weak/default credentials.
- Test token expiry and revocation.
- If valid creds are found, call `set_auth()` for use in later phases.

**Phase C — Authorization Attacks**
- With a valid auth token, test IDOR by enumerating object IDs (`/users/1`, `/users/2`, ...).
- Test horizontal privilege escalation (user A accessing user B's resources).
- Test vertical privilege escalation (regular user accessing admin endpoints).
- Test broken function-level authorization (undocumented/hidden admin routes).

**Phase D — Injection Attacks**
- For every endpoint with user-controlled input, test SQL injection (error-based, boolean-blind, time-based).
- Test command injection in any path or body parameters that look like system operations.
- Test SSRF in any URL-accepting parameters.
- Test path traversal in any file/resource-accepting parameters.

**Phase E — Business Logic & Other**
- Mass assignment (send extra fields on PUT/PATCH and check if they're accepted).
- Test rate limiting (rapid-fire requests to auth endpoints).
- Test insecure direct references in file downloads.
- Check response headers for security misconfigurations.

### Confirmation Logic

The agent is instructed: **never record a finding unless you can confirm it.** Confirmation criteria by type:

| Vuln Class        | Confirmation                                                     |
|-------------------|------------------------------------------------------------------|
| SQL Injection      | DB error in response, OR boolean difference between `'` and `''`, OR measurable time delay |
| Auth Bypass        | 200 response with data when unauthenticated (vs 401 baseline)   |
| IDOR               | 200 response with another user's data (compare with baseline)   |
| Broken Access Ctrl | Lower-privilege token receives 200 on admin-only endpoint        |
| SSRF               | Out-of-band callback received (DNS lookup or HTTP to controlled server) |
| Mass Assignment    | Extra field appears in subsequent GET response                    |

---

## 7. Sandbox Architecture

### Isolation Strategy — Three Tiers

Docker containers share the host kernel via Linux namespaces. A kernel exploit in a guest container can compromise the host and all other tenants — a real risk given that VulnScout AI's users are sophisticated enough to deliberately craft a malicious service. We address this with a phased isolation model that upgrades the security boundary as the product matures, without requiring a rewrite.

```
Phase 1 — Docker + deep hardening    (MVP)
  Isolation boundary: Linux namespaces + seccomp + AppArmor + capabilities
  Risk mitigated:     network egress, resource exhaustion, most privilege escalation
  Residual risk:      kernel exploit via unfiltered syscall (low likelihood, high impact)

Phase 2 — gVisor (runsc runtime)     (pre-GA / first paying customers)
  Isolation boundary: user-space kernel (Sentry) intercepts all syscalls
  Risk mitigated:     kernel exploits via syscall; guest sees a synthetic kernel
  Residual risk:      gVisor Sentry bugs (much smaller attack surface than Linux kernel)
  Cost:               ~10–20% perf overhead; drop-in runtime change (--runtime=runsc)

Phase 3 — Kata Containers            (enterprise / compliance tier)
  Isolation boundary: hardware virtualization (KVM); each sandbox is a microVM
  Risk mitigated:     full kernel isolation; Spectre/Meltdown-class side channels
  Residual risk:      negligible for this threat model
  Cost:               KVM-capable hosts required; +2–5s sandbox boot time
```

### Design Principles

- **Complete network isolation.** Each scan gets its own Docker bridge network created with `--internal`. Containers on one scan network cannot reach containers on any other network, and cannot initiate outbound connections to the internet.
- **Attack traffic is mediated.** The attack executor runs inside the sandbox network and is the only thing that communicates with the target service. The AI agent talks to the executor over an internal API — it never gets a raw socket into the sandbox.
- **Ephemeral.** Sandboxes are torn down immediately after scan completion. A sweeper job forcibly destroys any sandbox older than 30 minutes.
- **Read-only root filesystem.** User service containers mount a read-only root fs. Only explicit tmpfs paths are writable — preventing persistence of any payloads dropped during the scan.
- **No capabilities.** All Linux capabilities are dropped. Nothing is added back unless a specific service requires port binding below 1024 (`CAP_NET_BIND_SERVICE` only, and only if needed).

### Sandbox Lifecycle

```
1. CREATE NETWORK
   docker network create \
     --driver bridge \
     --internal \                          # no internet egress
     --opt com.docker.network.bridge.enable_icc=false \   # no cross-sandbox talk
     sandbox-{scanId}

2. START DEPENDENCIES
   For each dep in static_result.dependencies:
     docker run \
       --network sandbox-{scanId} \
       --name dep-{scanId}-{depName} \
       --memory 512m --memory-swap 512m \  # no swap
       --cpus 0.5 \
       --pids-limit 128 \
       --cap-drop ALL \
       --no-new-privileges \
       --security-opt seccomp=/etc/vulnscout/seccomp-strict.json \
       --security-opt apparmor=vulnscout-sandbox \
       --ipc none \
       --user 1000:1000 \
       {depImage}

3. START TARGET SERVICE
   docker run \
     --network sandbox-{scanId} \
     --name target-{scanId} \
     --memory 1g --memory-swap 1g \
     --cpus 1 \
     --pids-limit 256 \
     --ulimit nofile=1024:1024 \
     --cap-drop ALL \
     --no-new-privileges \
     --security-opt seccomp=/etc/vulnscout/seccomp-strict.json \
     --security-opt apparmor=vulnscout-sandbox \
     --ipc none \
     --read-only \
     --tmpfs /tmp:rw,noexec,nosuid,size=128m \
     --tmpfs /var/run:rw,noexec,nosuid,size=16m \
     --user 1000:1000 \
     --env-file /run/secrets/scan-{scanId}.env \   # tmpfs-backed, deleted post-start
     {userImage}

4. HEALTH CHECK
   Poll GET {internalUrl}/health (or /) until 200 or 2-min timeout.
   Fail the scan if the service does not become healthy.

5. START ATTACK EXECUTOR
   docker run \
     --network sandbox-{scanId} \
     --name executor-{scanId} \
     --memory 256m --memory-swap 256m \
     --cpus 0.5 \
     --pids-limit 64 \
     --cap-drop ALL \
     --no-new-privileges \
     --security-opt seccomp=/etc/vulnscout/seccomp-strict.json \
     --read-only \
     --tmpfs /tmp:rw,noexec,nosuid,size=32m \
     --user 1000:1000 \
     vulnscout/attack-executor:latest \
     --target-url http://target-{scanId}:{port}
   # Exposes internal API: POST /execute { method, path, headers, body } → HttpResponse

6. AGENT RUNS (calls executor internal API via http_request tool)

7. TEARDOWN
   docker stop  target-{scanId} executor-{scanId} dep-{scanId}-*
   docker rm    target-{scanId} executor-{scanId} dep-{scanId}-*
   docker network rm sandbox-{scanId}
   shred -u /run/secrets/scan-{scanId}.env   # secure delete
```

### Phase 2 Upgrade: gVisor

When upgrading to gVisor, the only change to the lifecycle above is adding `--runtime=runsc` to every `docker run` call for sandbox containers. The rest of the lifecycle — networking, flags, teardown — is identical.

```
# Phase 2: add this flag to all sandbox container starts
docker run --runtime=runsc ...

# Host setup (one-time, per worker node):
#   Install gVisor: https://gvisor.dev/docs/user_guide/install/
#   sudo runsc install
#   sudo systemctl reload docker
```

What changes under the hood: instead of making syscalls directly to the Linux kernel, every syscall from the container is intercepted by gVisor's **Sentry** — a user-space kernel written in Go. The Linux host kernel is no longer in the attack path for most operations. A kernel exploit payload injected through the target service hits Sentry, not Linux.

gVisor compatibility note: most web frameworks and their dependencies work without modification. Known gaps are in low-level socket operations and `ptrace` (neither needed by typical API services). Verify compatibility in CI before enabling in production.

### Phase 3 Upgrade: Kata Containers

Kata Containers replaces gVisor on K8s (Phase 3 infrastructure migration). Each sandbox pod runs in a dedicated Firecracker microVM — a full hardware-virtualized kernel per scan. A kernel exploit in the guest kills the guest's kernel only.

```yaml
# Kubernetes RuntimeClass for Kata/Firecracker
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: kata-fc
handler: kata-fc    # maps to Kata shim configured with Firecracker VMM

# Per-pod annotation in the scan Job spec:
spec:
  runtimeClassName: kata-fc
```

Requires: KVM-capable hosts (AWS `metal` instances or instances with nested virt enabled, e.g. `m5.metal`, `c5.metal`). Adds ~2–5s to sandbox startup vs gVisor. Trade-off is justified for enterprise customers with compliance requirements (FedRAMP, etc.).

### Seccomp Profile

`/etc/vulnscout/seccomp-strict.json` is a custom seccomp profile derived from Docker's default, with additional syscalls blocked that have no business being called by an API server but are commonly used in container escape and privilege escalation exploits.

**Blocked on top of Docker default:**

| Syscall | Reason blocked |
|---|---|
| `ptrace` | Process tracing; used in many container escape exploits |
| `mount` / `umount2` | Filesystem mounting; not needed by web services |
| `pivot_root` / `chroot` | Root filesystem manipulation |
| `unshare` | Create new namespaces from inside container |
| `clone` with `CLONE_NEWUSER` | User namespace creation; common escape vector |
| `keyctl` / `add_key` / `request_key` | Kernel keyring; not used by API servers |
| `bpf` | eBPF programs; can be used for kernel-level exploitation |
| `perf_event_open` | Performance counters; Spectre/Meltdown assist |
| `userfaultfd` | User-space page fault handling; exploit primitive |
| `syslog` | Kernel log access |
| `acct` / `modify_ldt` | Process accounting / LDT manipulation |
| `swapon` / `swapoff` | Swap management |
| `sysfs` | Filesystem access beyond what's needed |

All other syscalls follow Docker's default seccomp policy (most standard POSIX I/O and networking syscalls are allowed).

### AppArmor Profile

`vulnscout-sandbox` AppArmor profile (loaded on each worker node) enforces:
- **Deny** write access to host filesystem paths outside explicitly allowed tmpfs mounts.
- **Deny** `ptrace` and `signal` to processes outside the container.
- **Deny** `mount` operations.
- **Allow** standard network operations (TCP/UDP) within the sandbox network.
- **Allow** read access to `/proc/self` only (not `/proc/*`).

### Env Var Handling

User-supplied environment variables are never written to disk on the worker host. The flow:

```
1. Worker decrypts env var values from DB (AES-256-GCM) into memory
2. Values written to a tmpfs-backed file at /run/secrets/scan-{scanId}.env
   (tmpfs = RAM-backed, never hits disk)
3. File path passed to docker run via --env-file
4. File deleted with shred -u immediately after container starts
5. Container holds values in its own memory space only
```

### Attack Executor

A minimal Express app (`vulnscout/attack-executor`) that:
- Runs inside the sandbox network.
- Exposes `POST /execute` which accepts an `HttpRequest` and fires it at the target service.
- Enforces per-request timeouts (10s).
- Returns the full response (status, headers, body truncated to 50KB).
- Logs every request/response for the scan event log.
- Has no outbound network access — it can only reach containers on the same sandbox network.

This indirection means the AI agent never gets a raw socket. All attack traffic is mediated and logged.

### Dependency Inference

When ingesting a repo, the static analyzer looks for:
- `docker-compose.yml` — read `services` directly.
- `package.json` dependencies → infer (e.g. `pg` → needs Postgres, `ioredis` → needs Redis).
- `requirements.txt` / `pyproject.toml` → same for Python.
- Connection string env vars (`DATABASE_URL`, `REDIS_URL`) → infer from the variable names.

Inferred dependencies are presented to the user for confirmation in the web app before scan starts.

---

## 8. Static Analysis Pipeline

Static analysis runs in Phase 2 before the sandbox starts. It does not execute any code — it reads source files only.

### Outputs

```typescript
interface StaticAnalysisResult {
  endpoints: EndpointInfo[]       // all routes discovered
  auth_patterns: AuthPattern[]    // how auth is implemented
  risky_patterns: RiskyPattern[]  // specific lines of concern
  dependencies: ServiceDependency[] // inferred infra deps
  env_vars_required: string[]     // env vars referenced in code
  tech_stack: TechStackInfo       // language, framework, ORM
}
```

### What It Looks For

**Route extraction**
Parse the AST for common framework patterns:
- Express: `app.get(...)`, `router.post(...)`, `app.use(...)`
- FastAPI: `@app.get(...)`, `@router.post(...)`
- Rails: `routes.rb` draw blocks
- Spring: `@GetMapping`, `@PostMapping`

This gives the agent a complete endpoint map before any requests are made.

**Risky code patterns** (feeds into agent's attack prioritization)

| Pattern | Indicator |
|---|---|
| Raw SQL string concatenation | `"SELECT * FROM users WHERE id = " + req.params.id` |
| `eval()` / `exec()` with user input | command injection risk |
| Missing auth middleware on routes | endpoints without auth checks |
| Hardcoded secrets | API keys, passwords in source |
| Insecure `jwt.verify` | missing algorithm check (`algorithms` option absent) |
| Object spread from request body | mass assignment risk |
| `fs.readFile` with user input | path traversal risk |
| `axios.get(req.body.url)` pattern | SSRF risk |
| `req.query` passed to `findById` | IDOR risk |

These are surfaced in the system prompt so the agent knows exactly where to look.

**Tech stack detection**
Identifies language (Node.js, Python, Go, Java, etc.), framework, ORM, and auth library. This influences which payload templates the agent chooses.

---

## 9. Real-Time Streaming

The web app shows live scan progress. The pipeline:

```
ScanWorker
  └─ publishes ScanEvent to Redis channel "scan:{scanId}"

API Server (WebSocket handler)
  └─ subscribes to "scan:{scanId}" on connect
  └─ forwards events to the connected WebSocket client
  └─ unsubscribes on disconnect
```

Events are also written to `scan_events` in Postgres so clients can replay the full event log after reconnecting or on the report page.

WebSocket auth: the client sends a scan-scoped short-lived token (issued by `GET /scans/:id` — valid for 1 hour, scoped to that scan only).

---

## 10. Security Model

### Threat Model

The primary threat is a **malicious user** who tries to use VulnScout AI's sandbox infrastructure to attack targets they don't own, or to escape the sandbox and attack VulnScout AI's own infrastructure.

### Controls

**Sandbox isolation**

See §7 for the full tiered isolation model (Docker hardening → gVisor → Kata/Firecracker). Summary of controls active from Phase 1:

- `--internal` Docker network: no container can initiate outbound TCP connections.
- `--cap-drop ALL`: all Linux capabilities dropped; nothing added back for typical services.
- `--no-new-privileges`: blocks setuid/setgid privilege escalation from inside the container.
- `--read-only` root filesystem: prevents payload persistence; only explicit tmpfs paths are writable.
- `--ipc none`: no shared IPC namespace between containers.
- `--pids-limit 256`: prevents fork bombs.
- `--memory-swap` == `--memory`: no swap, preventing memory-based side-channel data leakage to disk.
- `--ulimit nofile=1024:1024`: limits file descriptor exhaustion attacks.
- Custom seccomp profile blocking ptrace, mount, bpf, userfaultfd, clone(CLONE_NEWUSER), and other syscalls commonly used in container escape exploits (see §7 for full list).
- Custom AppArmor profile denying filesystem writes outside tmpfs mounts and blocking ptrace/signal to external processes.
- No `--privileged`, no host network, no host PID namespace, no host volume mounts.
- All sandbox containers run as UID 1000 (non-root).

**Attack executor indirection**
- The AI agent never has a raw network socket into the sandbox.
- All HTTP traffic is mediated by the attack executor, which logs every request.
- The executor enforces a timeout and body size limit on every call.

**Env var handling**
- User-supplied env vars are written to a temp file (`/tmp/scan-{scanId}.env`) by the worker, mounted at container start, then immediately deleted from disk.
- Env var values are stored encrypted (AES-256-GCM) in the database. They are decrypted only in worker memory at scan time — never returned via the API.

**Scan authorization**
- Scans can only be created for services owned by the user's organization.
- WebSocket connections to `WS /ws/scans/:id` require a scan-scoped token tied to the org.
- Workers only process jobs for scans that exist and are in `queued` status.

**Rate limiting and quotas**
- Plan-level scan quotas enforced in the API before job enqueue.
- API rate limiting: 100 req/min per API key.
- Per-scan: max 10 concurrent HTTP requests from the executor.
- Global: max N concurrent sandboxes per org (plan-dependent).

**Audit logging**
- All API calls that mutate state are written to an audit log.
- All scan events (including every HTTP request fired by the agent) are stored in `scan_events`.

---

## 11. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (Node.js) | Already in use; strong typing; good async I/O for the worker pattern |
| API framework | Express.js | Already in use; simple and well-understood |
| Job queue | BullMQ (Redis) | Robust queue with retries, rate limiting, concurrency control |
| Database | PostgreSQL | JSONB for flexible scan config / findings; strong ACID guarantees |
| ORM | Drizzle ORM | Type-safe, lightweight, schema-as-code |
| Container runtime (Phase 1) | Docker + custom seccomp/AppArmor (dockerode) | Direct Docker control; hardened with capability dropping, read-only fs, pid limits |
| Container runtime (Phase 2) | gVisor (`--runtime=runsc`) | Drop-in runtime upgrade; user-space kernel intercepts all syscalls, eliminates kernel exploit class |
| Container runtime (Phase 3) | Kata Containers (Firecracker VMM) | Hardware VM isolation per sandbox; required for KVM-capable hosts; enterprise/compliance tier |
| AI agent | Anthropic SDK (claude-opus-4-6) | Best reasoning for multi-step attack chains; native tool use |
| WebSocket | ws | Lightweight; integrates cleanly with Express |
| Auth | JWT (jsonwebtoken) + bcrypt | Standard, well-understood |
| Secrets management | env vars → app-level AES-256-GCM encryption | Simple; upgrades to AWS KMS / HashiCorp Vault for enterprise |
| Static analysis | AST parsing (ts-morph, @babel/parser, tree-sitter) | Language-aware parsing without executing code |
| Logging | pino | Structured JSON logs; low overhead |
| Config | zod | Runtime validation of env vars at startup |

---

## 12. Phased Roadmap

### Phase 1 — Foundation (MVP)

**Goal:** End-to-end scan working for a Node.js/Express service provided as a GitHub repo.

- [ ] Database schema + migrations (Drizzle)
- [ ] Auth (register, login, JWT refresh)
- [ ] Services CRUD
- [ ] Scans CRUD + BullMQ job enqueue
- [ ] Ingest phase: clone GitHub repo, build Docker image
- [ ] Sandbox manager: create network, start target container, health check, teardown
- [ ] Attack executor container
- [ ] AI agent runner (basic tool set: `http_request`, `record_finding`, `get_endpoints`)
- [ ] Static analyzer: route extraction for Express
- [ ] WebSocket streaming of scan events
- [ ] Report generator: JSON output
- [ ] REST endpoints for all of the above

**Not in Phase 1:** Multi-language support, OAuth source integrations, PDF export, scheduling.

### Phase 2 — Depth & Polish

- [ ] Full static analyzer: all risky patterns, multi-framework support (FastAPI, Rails)
- [ ] Full agent attack coverage: all 5 phases from §6
- [ ] CVSS scoring on findings
- [ ] HTML report with PDF export
- [ ] GitHub / GitLab OAuth integration
- [ ] Jira / Linear finding export
- [ ] Scheduled recurring scans
- [ ] Scan comparison (diff between two scans of the same service)
- [ ] Org management, member invites, RBAC
- [ ] **gVisor runtime upgrade** — install `runsc` on all worker nodes, add `--runtime=runsc` to all sandbox container starts; verify framework compatibility matrix in CI

### Phase 3 — Scale & Enterprise

- [ ] Kubernetes-based sandbox orchestration (replace Docker Engine API)
- [ ] **Kata Containers + Firecracker** — configure `kata-fc` RuntimeClass; migrate sandbox Jobs to use it; requires metal/nested-virt hosts
- [ ] Private cloud / VPC deployment option
- [ ] SSO / SAML
- [ ] SOC 2 compliance controls
- [ ] Audit log export
- [ ] Custom integrations via webhook / API
- [ ] Dedicated scan workers per org (enterprise isolation)
- [ ] Multi-region sandbox pools

---

## Appendix A — Scan Status Flow

```
queued
  └─► ingest
        └─► static_analysis
              └─► sandbox_starting
                    └─► attacking
                          └─► reporting
                                └─► completed
                                      (or)
                          any phase ──► failed
                          any phase ──► cancelled  (user-initiated)
```

## Appendix B — Finding Severity Guidelines

| Severity | CVSS Range | Examples |
|---|---|---|
| Critical | 9.0 – 10.0 | SQL injection with data exfil, auth bypass with full account takeover, RCE |
| High | 7.0 – 8.9 | IDOR exposing sensitive data, broken access control, JWT bypass |
| Medium | 4.0 – 6.9 | Reflected XSS, CSRF on state-changing actions, rate limiting absent on auth |
| Low | 0.1 – 3.9 | Security headers missing, verbose error messages, minor info disclosure |
| Info | 0.0 | Informational observations that don't constitute a direct exploit |

## Appendix C — Isolation Tier Comparison

Full breakdown of the three sandbox isolation tiers and what each one actually protects against.

### Threat matrix

| Threat | Docker + hardened | + gVisor | + Kata/Firecracker |
|---|---|---|---|
| Container calls user's production DB | Blocked (`--internal` network) | Blocked | Blocked |
| Container calls another tenant's sandbox | Blocked (separate networks) | Blocked | Blocked |
| Container exhausts host CPU/RAM | Blocked (`--cpus`, `--memory`) | Blocked | Blocked |
| Fork bomb | Blocked (`--pids-limit`) | Blocked | Blocked |
| Privilege escalation via setuid binary | Blocked (`--no-new-privileges`) | Blocked | Blocked |
| Write malware to host filesystem | Blocked (`--read-only` + AppArmor) | Blocked | Blocked |
| Exploit container runtime (runc CVE) | **Mitigated** (seccomp reduces surface) | **Blocked** (no direct syscalls) | Blocked |
| Kernel exploit via unfiltered syscall | **Mitigated** (seccomp blocks known vectors) | **Blocked** (Sentry user-space kernel) | Blocked |
| Cross-tenant memory read (Spectre-class) | **Vulnerable** | Partially mitigated | **Blocked** (VM boundary) |
| Escape via kernel namespace bug | Mitigated (user ns blocked in seccomp) | Blocked | Blocked |

### Why Docker hardening alone is not sufficient long-term

Docker's seccomp + AppArmor + capability dropping reduce the attack surface significantly but they are **deny-list based** — you enumerate syscalls to block. Novel kernel exploits often use syscalls that look legitimate in isolation. The [runc CVE-2019-5736](https://nvd.nist.gov/vuln/detail/CVE-2019-5736) and [CVE-2022-0185](https://nvd.nist.gov/vuln/detail/CVE-2022-0185) are examples of escapes that bypassed standard hardening.

For VulnScout AI specifically, the users submitting services are security researchers and developers who are aware of container escapes. This is a higher-risk tenant profile than a typical SaaS.

### Why gVisor is the right Phase 2 step (not Firecracker)

Firecracker gives stronger isolation but requires KVM-capable hosts, a management layer (Kata Containers or similar), and adds infrastructure complexity that isn't justified at Phase 2 scale.

gVisor's key property: **all syscalls are intercepted by Sentry before they reach the Linux kernel**. An exploit payload running inside the container hits gVisor's Go-based kernel implementation, not Linux. The attack surface is Sentry's ~30k lines of Go, not the Linux kernel's ~30M lines of C.

The upgrade is a **one-line change** per `docker run` call (`--runtime=runsc`) and a one-time host install. No architecture changes.

### gVisor known limitations

| Area | Status |
|---|---|
| Standard TCP/HTTP | Full support |
| Unix domain sockets | Full support |
| `epoll` / `kqueue` | Full support |
| `/proc` filesystem | Partial (self-only by default) |
| `ptrace` | Not supported (acceptable — we block it anyway) |
| Raw sockets | Not supported (acceptable — API servers don't need them) |
| Some `ioctl` variants | Limited support |

Most Node.js, Python (FastAPI), Go, and Java API services run under gVisor without modification.

### When to move to Kata Containers

Kata Containers (Firecracker backend) is warranted when:
- Enterprise customers require **hardware-level VM isolation** for compliance (FedRAMP, HIPAA, PCI).
- You need to demonstrate **kernel isolation** in a SOC 2 audit.
- Spectre/Meltdown-class cross-tenant side-channel attacks are in scope (e.g., high-value financial data).
- Customers explicitly request it as a contractual requirement.

## Appendix E — Directory Structure (Target)

```
backend/
├── src/
│   ├── index.ts                 # entrypoint — starts API server
│   ├── worker.ts                # entrypoint — starts scan worker
│   ├── config.ts                # zod-validated env config
│   │
│   ├── api/                     # Express routes
│   │   ├── auth.ts
│   │   ├── services.ts
│   │   ├── scans.ts
│   │   ├── findings.ts
│   │   └── ws.ts                # WebSocket upgrade handler
│   │
│   ├── db/                      # Drizzle schema + queries
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── queries/
│   │       ├── scans.ts
│   │       ├── findings.ts
│   │       └── services.ts
│   │
│   ├── scanner/                 # Core scan pipeline
│   │   ├── orchestrator.ts      # ScanOrchestrator
│   │   ├── ingest.ts            # Phase 1: clone/pull/build
│   │   ├── static-analyzer.ts  # Phase 2: AST analysis
│   │   ├── sandbox.ts           # Phase 3: Docker lifecycle
│   │   ├── agent/
│   │   │   ├── runner.ts        # Phase 4: agent loop
│   │   │   ├── prompt.ts        # system prompt builder
│   │   │   └── tools.ts         # tool implementations
│   │   └── report.ts            # Phase 5: report generation
│   │
│   ├── queue/
│   │   ├── producer.ts          # enqueue scan jobs
│   │   └── consumer.ts          # BullMQ worker setup
│   │
│   ├── pubsub/
│   │   └── redis.ts             # publish/subscribe helpers
│   │
│   └── lib/
│       ├── docker.ts            # dockerode wrapper
│       ├── crypto.ts            # env var encryption
│       └── logger.ts            # pino instance
│
├── docs/
│   └── SYSTEM_DESIGN.md         ← you are here
│
└── package.json
```
