Phase 1 — Foundation (API + DB + Queue)

Goal: HTTP server that can accept a scan job and persist it.

- Set up Drizzle ORM + PostgreSQL schema (users, services, scans, findings)
- Auth endpoints: POST /auth/register, POST /auth/login → JWT
- Services CRUD: GET/POST /services, DELETE /services/:id
- Scans CRUD: POST /scans (creates a scan record, enqueues a BullMQ job), GET /scans/:id
- BullMQ wired up with Redis — job enqueues and a worker picks it up and logs "scan started"

Done when: you can POST /scans and see the job processed in the worker log.

---
Phase 2 — GitHub Ingest

Goal: Given a GitHub repo URL + optional OAuth token, clone it and build a Docker image.

- GitHub OAuth flow (or PAT-based) — store encrypted token per user
- IngestService: clone repo to a temp directory using simple-git
- Detect project type from repo contents (package.json → Node, requirements.txt → Python, existing Dockerfile, docker-compose.yml)
- If no Dockerfile exists, auto-generate one based on detected stack
- Build Docker image using dockerode — stream build logs to BullMQ job progress
- Emit progress events to Redis pub/sub (scan:{id} channel)

Done when: you can pass a GitHub URL and get a built Docker image with a tag.

---
Phase 3 — Sandbox Orchestration

Goal: Start the cloned service in an isolated network and confirm it's reachable.

- SandboxManager: create isolated bridge network per scan (sandbox-{scanId})
- Parse docker-compose.yml for dependency services (Postgres, Redis, etc.) — start them on the isolated network
- Start the target container on the same network with env vars from scan config
- Health-check loop: poll GET /health (or configurable path) until 200 or 2-min timeout
- SandboxContext object: internal base URL, network ID, container IDs
- Teardown: stop + remove all containers and network on scan complete or TTL

Done when: you can start a known test app (e.g. a deliberately vulnerable Express API), confirm it's up inside the sandbox, and tear it down cleanly.

---
Phase 4 — Static Analysis

Goal: Extract the attack surface from source code before any HTTP request is fired.

- Walk the repo and extract route definitions (regex patterns per framework — Express app.get(...), FastAPI @router.get(...), etc.)
- Flag risky patterns: raw SQL strings, eval, missing auth middleware, req.query directly in DB calls
- Build a StaticAnalysisResult: list of { method, path, risk_hints[] }
- If an OpenAPI spec exists, parse it instead — richer signal

Done when: given a repo, you get a JSON list of endpoints with risk annotations.

---
Phase 5 — AI Agent

Goal: Claude attacks the live sandbox and records findings.

- Wire up Anthropic SDK with tool use
- Define agent tools:
  - http_request(method, path, headers, body) → fires against sandbox base URL
  - record_finding(severity, vuln_class, endpoint, proof_request, proof_response, fix_suggestion)
  - get_endpoints() → returns the static analysis result
  - set_auth(token) → sets a bearer token for subsequent requests
- System prompt: feed in StaticAnalysisResult, attack profile, OWASP categories to cover
- ReAct loop: run until findings plateau, token budget exhausted, or wall-clock timeout (10 min)
- Stream AgentEvents (tool call, finding, thinking) to pub/sub in real-time

Done when: Claude can autonomously find a SQL injection or auth bypass in a test vulnerable API.

---
Phase 6 — Real-Time Streaming to Frontend

Goal: Frontend sees live scan events without polling.

- WebSocket endpoint WS /scans/:id/stream
- Subscribe to Redis pub/sub scan:{id} and forward events over the socket
- Frontend replaces mock live log with real events from the socket

Done when: starting a scan shows live log lines in the dashboard as they happen.

---
Phase 7 — Report & Findings Persistence

Goal: Completed scan produces a structured report you can query.

- Persist each record_finding call to the findings table during the agent run
- Deduplication: same vuln_class + endpoint = upsert not insert
- GET /scans/:id/findings returns the full list
- Mark scan completed with summary counts
- PDF/JSON export endpoint

---
Suggested Build Order

Phase 1 → Phase 2 → Phase 3 → Phase 5 (minimal) → Phase 4 → Phase 5 (full) → Phase 6 → Phase 7

The reason Phase 5 comes before Phase 4 in the second pass: you can get the AI agent working against a known endpoint list first (hardcoded), then feed it real static     
analysis output once Phase 4 is done. This lets you test the attack loop early without being blocked on the analyzer.

---
Biggest risk areas to de-risk early:
1. Docker-in-Docker — if you're running the backend in a container, dockerode needs access to the host socket (/var/run/docker.sock). Decide early whether you're running  
the worker on bare metal or in a privileged container.
2. Auto-generating Dockerfiles — repos without one are the majority. Getting a reliable "detect stack → write Dockerfile" step right is surprisingly tricky for edge cases.  3. Agent tool reliability — Claude needs well-typed tool schemas or it'll hallucinate tool arguments. Invest in Zod validation on every tool input early.
