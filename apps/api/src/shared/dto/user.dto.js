'use strict';
const { z } = require('zod');

const PHONE_RE = /^(0|\+84)[0-9]{8,10}$/;

const CreateUserSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'Username phải có ít nhất 3 ký tự').max(50, 'Username quá dài'),
    email: z.string().email('Email không đúng định dạng'),
    fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự').max(100),
    password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
    confirmPassword: z.string().optional(),
    phoneNumber: z.string().regex(PHONE_RE, 'Số điện thoại không đúng định dạng').optional().nullable(),
    role: z.enum(['ADMIN', 'MANAGER', 'USER']).optional().default('USER'),
    departmentId: z.number().int().optional().nullable(),
  }).refine((data) => !data.confirmPassword || data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  }),
});

const UpdateUserSchema = z.object({
  body: z.object({
    email: z.string().email('Email không đúng định dạng').optional(),
    fullName: z.string().min(2).max(100).optional(),
    phoneNumber: z.string().regex(PHONE_RE, 'Số điện thoại không đúng định dạng').optional().nullable(),
    role: z.enum(['ADMIN', 'MANAGER', 'USER']).optional(),
    departmentId: z.number().int().optional().nullable(),
    password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự').optional(),
    confirmPassword: z.string().optional(),
  }).refine((data) => !data.password || !data.confirmPassword || data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  }),
});

const ChangePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().optional(), // required for non-admin, handled in controller
    newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
    confirmPassword: z.string().optional(),
  }).refine((data) => !data.confirmPassword || data.newPassword === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  }),
});

module.exports = { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema };
