# `api/` — Tech_Stack §17 layout slot

Reserved for the **optional P2 FastAPI reference endpoint**. It is not
implemented, not tested, and never on the critical path: CorTwin ships as a
fully static bundle (no backend, no database, no auth, no telemetry — law 13).
If P2 is ever reached, code here must not touch model truth, protocol, privacy,
state ownership, registry semantics or release reliability.
