'use strict';
/**
 * PasswordUseCase.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Nhóm các UseCase liên quan đến mật khẩu: Change, Forgot, Reset.
 */
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const db       = require('../../shared/config/db');
const userRepo = require('../../infrastructure/repositories/UserRepository');

/**
 * ── CHANGE PASSWORD ──────────────────────────────────────────────
 */
class ChangePasswordUseCase {
  async execute({ userId, currentPassword, newPassword }) {
    const hash = await userRepo.findPasswordHash(userId);
    if (!hash) {
      const err = new Error('User không tồn tại');
      err.code  = 'NOT_FOUND';
      throw err;
    }

    const isValid = await bcrypt.compare(currentPassword, hash);
    if (!isValid) {
      const err = new Error('Mật khẩu hiện tại không chính xác');
      err.code  = 'VALIDATION_ERROR';
      throw err;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await userRepo.updatePassword(userId, newHash);

    return { success: true, message: 'Đổi mật khẩu thành công' };
  }
}

/**
 * ── FORGOT PASSWORD ──────────────────────────────────────────────
 */
class ForgotPasswordUseCase {
  async execute({ email, frontendBaseUrl }) {
    const user = await userRepo.findByEmail(email);
    // Bảo mật: Luôn trả về thành công để tránh leak email tồn tại
    if (!user) {
      return { success: true, message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed   = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    // Hết hạn sau 1 giờ
    const expires = new Date(Date.now() + 3600000);
    await userRepo.createResetToken(user.id, hashed, expires);

    // Ở đây đúng ra sẽ gửi Email. Trong demo này chúng ta log ra console hoặc trả về (nếu dev).
    const resetUrl = `${frontendBaseUrl}/reset-password?token=${rawToken}`;
    console.log(`[AUTH] Reset URL for ${email}: ${resetUrl}`);

    return { 
      success: true, 
      message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
      _devToken: rawToken // Chỉ dùng khi debug/test
    };
  }
}

/**
 * ── RESET PASSWORD ───────────────────────────────────────────────
 */
class ResetPasswordUseCase {
  async execute({ token, newPassword }) {
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      
      const row = await userRepo.findValidResetTokenForUpdate(conn, hashed);
      if (!row) {
        const err = new Error('Token không hợp lệ hoặc đã hết hạn');
        err.code  = 'VALIDATION_ERROR';
        throw err;
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await userRepo.consumeResetTokenAndUpdatePassword(conn, row.id, row.user_id, newHash);
      
      await conn.commit();
      return { success: true, message: 'Đặt lại mật khẩu thành công' };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  changePasswordUseCase: new ChangePasswordUseCase(),
  forgotPasswordUseCase: new ForgotPasswordUseCase(),
  resetPasswordUseCase:  new ResetPasswordUseCase(),
};
