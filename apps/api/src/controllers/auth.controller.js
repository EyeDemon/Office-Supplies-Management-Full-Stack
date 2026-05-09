'use strict';
/**
 * auth.controller.js — HTTP Adapter cho Auth endpoints.
 * Trách nhiệm DUY NHẤT: parse req → gọi UseCase → format res.
 * KHÔNG chứa business logic. KHÔNG gọi DB trực tiếp.
 *
 * Clean Architecture: Controller không biết bcrypt, mysql2, UUID.
 * SOLID-S: Single Responsibility — chỉ HTTP I/O.
 */
const router = require('express').Router();
const { generateCsrfToken } = require('../shared/middleware/authorize');
const { requireLogin } = require('../shared/middleware/authenticate');
const rl = require('../shared/middleware/rate-limiter');
const { idempotencyCheck } = require('../shared/middleware/idempotency');
const userRepo = require('../infrastructure/repositories/UserRepository');
const loginUseCase = require('../use-cases/auth/LoginUseCase');
const registerUseCase = require('../use-cases/auth/RegisterUseCase');
const { forgotPasswordUseCase, resetPasswordUseCase, changePasswordUseCase }
  = require('../use-cases/auth/PasswordUseCase');
const {
  LoginSchema, RegisterSchema, ChangePasswordSchema,
  ForgotPasswordSchema, ResetPasswordSchema,
} = require('../shared/dto/auth.dto');
const { getClientIp } = require('../shared/middleware/authenticate');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../domain/errors');

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Lấy thông tin người dùng hiện tại
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: OK
 *       401:
 *         description: Unauthorized
 */
// ── GET /api/auth/me ──────────────────────────────────────────────
router.get('/me', requireLogin, async (req, res, next) => {
  try {
    const user = await userRepo.findById(req.session.userId);
    if (!user) {
      req.session.destroy(() => { });
      throw new UnauthorizedError('Phiên đăng nhập không hợp lệ');
    }
    res.json({ success: true, message: 'OK', user });
  } catch (e) { next(e); }
});

// ── GET /api/auth/verify-reset-token ─────────────────────────────
router.get('/verify-reset-token', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) throw new ValidationError('Token là bắt buộc');
    const crypto = require('crypto');
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const row = await userRepo.findValidResetToken(hashed);
    if (row) res.json({ success: true, message: 'Token hợp lệ' });
    else throw new ValidationError('Token không hợp lệ hoặc đã hết hạn');
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, fullName, email]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               fullName: { type: string }
 *               email: { type: string }
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 */
// ── POST /api/auth/register ───────────────────────────────────────
router.post('/register', rl.registerRateLimit, async (req, res, next) => {
  try {
    const data = RegisterSchema.parse(req.body);           // ZodError → globalErrorHandler
    const { user } = await registerUseCase.execute(data);  // ConflictError → globalErrorHandler
    res.status(201).json({ success: true, message: 'Đăng ký thành công! Vui lòng đăng nhập.', data: user });
  } catch (e) { next(e); }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 */
// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', rl.loginRateLimit, async (req, res, next) => {
  try {
    const data = LoginSchema.parse(req.body);
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    // Rate-limit failure tracking (existing middleware)
    const { recordFailure, recordLockFailure, resetOnSuccess, resetLockout } = rl;

    let result;
    try {
      result = await loginUseCase.execute({ username: data.username, password: data.password, ip, ua });
    } catch (err) {
      // Track brute-force (ValidationError = wrong credentials)
      if (typeof recordFailure === 'function') {
        recordFailure(ip, data.username);
        recordLockFailure(data.username);
      }
      return next(err);
    }

    if (typeof resetOnSuccess === 'function') {
      resetOnSuccess(ip, data.username);
      resetLockout(data.username);
    }

    await new Promise((resolve, reject) =>
      req.session.regenerate(err => err ? reject(err) : resolve())
    );
    req.session.userId = result.user.id;
    req.session.username = result.user.username;
    req.session.role = result.user.role;

    const csrfToken = generateCsrfToken(req);
    res.json({ success: true, message: 'Đăng nhập thành công', user: result.user, csrfToken });
  } catch (e) { next(e); }
});

// ── POST /api/auth/logout ─────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session?.destroy(() => { });
  res.json({ success: true, message: 'Đăng xuất thành công' });
});

// ── POST /api/auth/change-password ───────────────────────────────
router.post('/change-password', requireLogin, idempotencyCheck, async (req, res, next) => {
  try {
    const data = ChangePasswordSchema.parse(req.body);
    const result = await changePasswordUseCase.execute({
      userId: req.session.userId,
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

// ── POST /api/auth/forgot-password ───────────────────────────────
router.post('/forgot-password', rl.forgotPasswordRateLimit, async (req, res, next) => {
  try {
    const data = ForgotPasswordSchema.parse(req.body);
    // Resolve frontend URL
    const frontendBaseUrl = (() => {
      const env = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
      if (env) return env;
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      return `${proto}://${host}`;
    })();
    const result = await forgotPasswordUseCase.execute({ email: data.email, frontendBaseUrl });
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

// ── POST /api/auth/reset-password ────────────────────────────────
router.post('/reset-password', rl.resetPasswordRateLimit, async (req, res, next) => {
  try {
    const data = ResetPasswordSchema.parse(req.body);
    const result = await resetPasswordUseCase.execute({ token: data.token, newPassword: data.newPassword });
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

module.exports = router;