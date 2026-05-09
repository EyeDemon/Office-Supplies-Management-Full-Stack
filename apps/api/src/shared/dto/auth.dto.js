'use strict';
/**
 * auth.dto.js — Zod validation schemas cho Auth endpoints.
 * GAP-05 fix: dùng Zod thay vì manual if-checks trong route handlers.
 * Controller chỉ cần: const data = LoginSchema.parse(req.body)
 */
const { z } = require('zod');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(0|\+84)[0-9]{8,10}$/;

const RegisterSchema = z.object({
  username: z
    .string({ required_error: 'Username là bắt buộc' })
    .trim()
    .min(3, 'Username phải có ít nhất 3 ký tự')
    .regex(/^\S+$/, 'Username không được chứa khoảng trắng'),
  email: z
    .string({ required_error: 'Email là bắt buộc' })
    .trim()
    .regex(EMAIL_RE, 'Email không đúng định dạng')
    .transform(v => v.toLowerCase()),
  fullName: z
    .string({ required_error: 'Họ tên là bắt buộc' })
    .trim()
    .min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  password: z
    .string({ required_error: 'Mật khẩu là bắt buộc' })
    .min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  confirmPassword: z.string().optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(PHONE_RE, 'Số điện thoại không đúng định dạng (VD: 0912345678)')
    .optional()
    .or(z.literal('')),
}).refine(
  data => !data.confirmPassword || data.password === data.confirmPassword,
  { message: 'Mật khẩu xác nhận không khớp', path: ['confirmPassword'] }
);

const LoginSchema = z.object({
  username: z.string({ required_error: 'Username là bắt buộc' }).trim().min(1),
  password: z.string({ required_error: 'Mật khẩu là bắt buộc' }).min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mật khẩu hiện tại là bắt buộc'),
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
}).refine(
  data => data.currentPassword !== data.newPassword,
  { message: 'Mật khẩu mới không được trùng mật khẩu hiện tại', path: ['newPassword'] }
);

const ForgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email là bắt buộc' })
    .trim()
    .regex(EMAIL_RE, 'Email không đúng định dạng')
    .transform(v => v.toLowerCase()),
});

const ResetPasswordSchema = z.object({
  token:           z.string().min(1, 'Token là bắt buộc'),
  newPassword:     z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  confirmPassword: z.string().optional(),
}).refine(
  data => !data.confirmPassword || data.newPassword === data.confirmPassword,
  { message: 'Mật khẩu xác nhận không khớp', path: ['confirmPassword'] }
);

module.exports = {
  RegisterSchema,
  LoginSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
};