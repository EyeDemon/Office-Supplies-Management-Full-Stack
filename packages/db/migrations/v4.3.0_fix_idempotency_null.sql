-- Migration: Fix idempotency_keys UNIQUE constraint NULL bypass (BUG-05)
-- Date: 2026-05-10
-- Spec: VIII.7

-- MySQL's UNIQUE constraint allows multiple rows with the same values if one of the columns is NULL.
-- We use a functional index to treat NULL user_id as 0 for uniqueness checks.

ALTER TABLE idempotency_keys DROP INDEX uk_idem;

ALTER TABLE idempotency_keys
ADD UNIQUE KEY uk_idem (
    idem_key,
    (IFNULL(user_id, 0))
);