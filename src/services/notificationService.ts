import { db } from '../lib/firebaseAdmin.js';
import nodemailer from 'nodemailer';
import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// --- Configuration ---
const TEXT_LK_API_KEY = process.env.TEXT_LK_API_KEY;
const TEXT_LK_SENDER_ID = process.env.TEXT_LK_SENDER_ID || 'GrandHotel';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'msdperera99@gmail.com';

// --- Setup Brevo (SMTP) Transporter ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface NotificationPayload {
  type: 'BOOKING' | 'ORDER' | 'SYSTEM';
  title: string;
  message: string;
  recipientEmail?: string;
  recipientPhone?: string; // Expects 07XXXXXXXX or 947XXXXXXXX
  data?: any; 
}

// ✅ HELPER: Sanitize MongoDB Data (Prevents "Circular Structure" or ObjectId errors)
const sanitizeData = (data: any): any => {
  if (!data) return {};
  
  if (data instanceof mongoose.Types.ObjectId || (data._bsontype === 'ObjectID')) {
      return data.toString();
  }
  if (data instanceof Date) return data;
  if (Array.isArray(data)) return data.map(item => sanitizeData(item));
  if (typeof data === 'object') {
      const cleaned: any = {};
      for (const key in data) {
          cleaned[key] = sanitizeData(data[key]);
      }
      return cleaned;
  }
  return data;
};

export const sendNotification = async (payload: NotificationPayload) => {
  // Use Promise.allSettled so one failure doesn't stop the others
  const tasks = [];

  console.log(`[Notification] Processing: ${payload.title}`);

  // 1. 🔔 Internal Dashboard Notification (Firestore)
  tasks.push(
    db.collection('notifications').add({
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: sanitizeData(payload.data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['admin', 'receptionist', 'manager'],
    }).then(() => console.log('✅ Firestore Notification Saved'))
  );

  // 2. 📱 SMS via Text.lk
  if (payload.recipientPhone && TEXT_LK_API_KEY) {
    tasks.push(
      sendSMS(payload.recipientPhone, payload.message)
        .then(() => console.log('✅ Customer SMS Sent'))
        .catch(err => console.error(`❌ SMS Failed: ${err.message}`))
    );
  }

  // 3. 📧 Email via Brevo
  if (payload.recipientEmail && process.env.SMTP_USER) {
    tasks.push(
      sendEmail(payload.recipientEmail, payload.title, payload.message)
        .then(() => console.log('✅ Customer Email Sent'))
        .catch(err => console.error(`❌ Email Failed: ${err.message}`))
    );
  }

  // 4. 🚨 Admin Alert (Email only, to save SMS costs)
  // We check if the recipient is NOT the admin to avoid double emailing
  if (ADMIN_EMAIL && process.env.SMTP_USER && payload.recipientEmail !== ADMIN_EMAIL) {
    tasks.push(
      sendEmail(ADMIN_EMAIL, `[ADMIN] ${payload.title}`, payload.message)
        .then(() => console.log('✅ Admin Email Sent'))
        .catch(err => console.error(`❌ Admin Email Failed: ${err.message}`))
    );
  }

  await Promise.allSettled(tasks);
};

// --- Helper: SMS (Text.lk) ---
async function sendSMS(to: string, message: string) {
    // 1. Clean number: Remove non-digits
    let formattedNum = to.replace(/\D/g, ''); 

    // 2. Format for Sri Lanka (94...)
    // If user entered 0771234567 -> convert to 94771234567
    if (formattedNum.startsWith('0')) {
        formattedNum = '94' + formattedNum.substring(1);
    }
    // If user entered 771234567 -> convert to 94771234567
    else if (formattedNum.length === 9) {
        formattedNum = '94' + formattedNum;
    }

    const url = `https://app.text.lk/api/v3/sms/send`; 
    
    // Text.lk Payload
    const response = await axios.post(url, {
        recipient: formattedNum,
        sender_id: TEXT_LK_SENDER_ID, 
        message: message,
        type: 'plain' 
    }, {
        headers: { 
            'Authorization': `Bearer ${TEXT_LK_API_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.data?.status === 'error') {
        throw new Error(response.data.message || 'Gateway Error');
    }
    
    return response.data;
}

// --- Helper: Email (Brevo HTML) ---
async function sendEmail(to: string, subject: string, text: string) {
  // Simple, clean HTML template
  const htmlContent = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
      <div style="background-color: #003580; padding: 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0;">Grand Hotel</h2>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <h3 style="color: #333;">${subject}</h3>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">
          ${text.replace(/\n/g, '<br>')}
        </p>
      </div>
      <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #888;">
        &copy; ${new Date().getFullYear()} Grand Hotel Management System
      </div>
    </div>
  `;

  await transporter.sendMail({
   from: `"Grand Hotel Reservations" <${process.env.SENDER_EMAIL}>`,
    to,
    subject,
    text, 
    html: htmlContent
  });
}