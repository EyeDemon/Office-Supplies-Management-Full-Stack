'use strict';
/**
 * LoginUseCase.js
 * Application Layer (Clean Architecture — Layer 2)
 *
 * Spec VI.2: Auth Security & JWT/Session
 */
const bcrypt   = require('bcryptjs');
const userRepo = require('../../infrastructure/repositories/UserRepository');
const { ValidationError } = require('../../domain/errors');

class LoginUseCase {
  /**
   * @param {object} input
   * @param {string} input.username
   * @param {string} input.password
   * @param {string} input.ip
   * @param {string} input.ua
   * @returns {Promise<{user: object}>}
   */
  async execute({ username, password, ip, ua }) {
    if (!username || !password) {
      throw new ValidationError('Username và Password là bắt buộc');
    }

    const userRow = await userRepo.findByUsername(username);
    
    // Auth security: Không tiết lộ username tồn tại hay không
    const isValid = userRow ? await bcrypt.compare(password, userRow.password) : false;

    if (!isValid) {
      userRepo.logLoginAttempt(username, ip, false, ua);
      throw new ValidationError('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    userRepo.logLoginAttempt(username, ip, true, ua);

    return {
      user: userRepo.mapUser(userRow)
    };
  }
}

module.exports = new LoginUseCase();
