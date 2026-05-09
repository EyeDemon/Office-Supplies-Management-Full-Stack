'use strict';
/**
 * EmailService.js — INFRA-05: Gửi email cảnh báo và thông báo
 * Sử dụng nodemailer + SMTP (Spec X.3)
 */
const nodemailer = require('nodemailer');

const isProd = process.env.NODE_ENV === 'production';
const mode   = process.env.EMAIL_MODE || 'dev'; // dev | smtp

const transporter = (mode === 'smtp') ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true cho 465, false cho các port khác
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}) : null;

module.exports = {
  /**
   * Gửi email cảnh báo tồn kho thấp.
   */
  sendStockAlertEmail: async (email, productName, stock, threshold, isOut) => {
    const subject = `[QLVPP] Cảnh báo tồn kho: ${productName}`;
    const statusText = isOut ? 'HẾT HÀNG' : 'SẮP HẾT HÀNG';
    const text = `Sản phẩm: ${productName}\nTrạng thái: ${statusText}\nSố lượng tồn: ${stock}\nNgưỡng tối thiểu: ${threshold}\nVui lòng kiểm tra và nhập hàng.`;
    
    if (mode !== 'smtp' || !transporter) {
      console.log(`[EMAIL-MOCK] To: ${email} | Subject: ${subject}`);
      console.log(`[EMAIL-MOCK] Body: ${text}`);
      return true;
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"QLVPP System" <no-reply@qlvpp.local>',
        to: email,
        subject,
        text,
      });
      return true;
    } catch (err) {
      console.error('[EmailService] Failed to send email:', err.message);
      return false;
    }
  }
};
