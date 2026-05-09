'use strict';
/**
 * RegisterUseCase.js
 * Application Layer (Clean Architecture — Layer 2)
 */
const bcrypt   = require('bcryptjs');
const userRepo = require('../../infrastructure/repositories/UserRepository');

class RegisterUseCase {
  async execute({ username, email, password, fullName, phoneNumber }) {
    // 1. Kiểm tra tồn tại
    const [userExists, emailExists] = await Promise.all([
      userRepo.existsByUsername(username),
      userRepo.existsByEmail(email)
    ]);

    if (userExists) {
      const err = new Error('Tên đăng nhập đã tồn tại');
      err.code  = 'CONFLICT';
      throw err;
    }

    if (emailExists) {
      const err = new Error('Email đã được sử dụng');
      err.code  = 'CONFLICT';
      throw err;
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. Lưu user
    const user = await userRepo.create({
      username,
      email,
      hashedPassword,
      fullName,
      phoneNumber
    });

    return { user };
  }
}

module.exports = new RegisterUseCase();
