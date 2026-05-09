/**
 * features/auth/hooks/useAuth.js
 * Re-export hook from AuthContext for feature-local consumption.
 * Follows MONOREPO_STRUCTURE spec: each feature exposes its own hooks barrel.
 *
 * Usage (inside any features/auth/* file):
 *   import { useAuth } from '../hooks/useAuth';
 *
 * Usage (from outside auth feature):
 *   import { useAuth } from '@/contexts/AuthContext.jsx';
 */
export { useAuth } from '@/contexts/AuthContext.jsx';
