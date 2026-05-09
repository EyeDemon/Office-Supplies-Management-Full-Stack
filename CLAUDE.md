# QLVPP Inventory Management System — Developer Guide

## System Overview
- **Version**: 4.2.0 (04/05/2026)
- **Architecture**: Clean Architecture / Layered (Express, React, MySQL)
- **Monorepo Structure**:
  - `apps/api`: Express backend
  - `apps/web`: React frontend
  - `packages/contracts`: Shared types/constants

## Technical Standards
- **Error Handling**: Use domain errors (`NotFoundError`, `ValidationError`, `InsufficientStockError`) in Use-Cases. Global error handler maps these to HTTP codes.
- **Database**: Use `StockRepository` and other repositories for all DB interactions. **NO direct `conn.query()` in Use-Cases.**
- **Concurrency**: Use `FOR UPDATE NOWAIT` for inventory locks.
- **Idempotency**: Use `idempotencyCheck` middleware for all state-changing POST/PUT/DELETE routes.
- **Events**: Transactions emit events (e.g., `ADJUST`, `IMPORT`) via `TransactionCompleted` for audit logging and notifications.

## Recent Stabilization (v4.1.0 - v4.2.0)
- **Zero-Delta Fix**: `ApproveAdjustment` now handles `new_qty === currentQty` without crashing.
- **Batch Transfer**: `ProcessTransfer` now uses batch queries to prevent N+1 overhead.
- **Quota Management**: Full CRUD for department monthly limits implemented (Admin UI + API).
- **Audit Consistency**: Unified transaction types to `ADJUST`, `IMPORT`, `EXPORT`, `TRANSFER_IN/OUT`.

## Deployment Requirements
- **Node.js**: v18+
- **Database**: MySQL 8.0+
- **Env**: `ADJUSTMENT_THRESHOLD` (default 100), `JWT_SECRET`, `CSRF_SECRET`.

## Key Commands
- **Backend Dev**: `cd apps/api && npm run dev`
- **Frontend Dev**: `cd apps/web && npm run dev`
- **Tests**: `npm test` or `npx jest src/__tests__/integration/system_v4/`
