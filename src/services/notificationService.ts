import { db } from '../lib/firebaseAdmin.js';
import nodemailer from 'nodemailer';
import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose'; // ✅ Import mongoose to check for ObjectId

dotenv.config();

// --- Configuration ---
const SMS_API_KEY = process.env.TEXT_LK_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Setup Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or 'smtp.your-provider.com'
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

interface NotificationPayload {
  type: 'BOOKING' | 'ORDER' | 'SYSTEM';
  title: string;
  message: string;
  recipientEmail?: string;
  recipientPhone?: string; // Format: 947XXXXXXXX
  data?: any; // ID, Room Number, etc.
}

// ✅ HELPER: Recursively convert MongoDB ObjectIds to Strings
// This prevents the "Couldn't serialize object of type ObjectId" error
const sanitizeData = (data: any): any => {
  if (!data) return {};
  
  // If it's a MongoDB ObjectId, convert to string
  if (data instanceof mongoose.Types.ObjectId || (data._bsontype === 'ObjectID')) {
      return data.toString();
  }

  // If it's a Date, keep it (Firestore supports Dates)
  if (data instanceof Date) return data;

  // If it's an Array, map over it
  if (Array.isArray(data)) {
      return data.map(item => sanitizeData(item));
  }

  // If it's an Object, recurse through keys
  if (typeof data === 'object') {
      const cleaned: any = {};
      for (const key in data) {
          cleaned[key] = sanitizeData(data[key]);
      }
      return cleaned;
  }

  // Return primitive types (string, number, boolean) as is
  return data;
};

export const sendNotification = async (payload: NotificationPayload) => {
  try {
    console.log(`[Notification] Processing: ${payload.title}`);

    // ✅ SANITIZE DATA BEFORE SENDING TO FIRESTORE
    const safeData = sanitizeData(payload.data || {});

    // 1. Real-time Dashboard Notification (Write to Firestore)
    await db.collection('notifications').add({
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: safeData, // Use the sanitized data
      read: false,
      createdAt: new Date(),
      targetRoles: ['admin', 'receptionist', 'manager'],
    });

    // 2. Send SMS (via Text.lk)
    if (payload.recipientPhone && SMS_API_KEY) {
      sendSMS(payload.recipientPhone, payload.message).catch(err => 
        console.error('[SMS Error]', err.message)
      );
    }

    // 3. Send Email
    if (payload.recipientEmail && EMAIL_USER) {
      sendEmail(payload.recipientEmail, payload.title, payload.message).catch(err => 
        console.error('[Email Error]', err.message)
      );
    }
    
    // 4. Send Admin/Staff Email (Alert)
    if (ADMIN_EMAIL && EMAIL_USER) {
       sendEmail(ADMIN_EMAIL, `[ADMIN] ${payload.title}`, payload.message).catch(err =>
           console.error('[Admin Email Error]', err.message)
       );
    }

    console.log("✅ [Notification] Successfully sent.");

  } catch (error: any) {
    console.error('❌ Notification Service Critical Error:', error.message);
  }
};

// --- Helper: SMS ---
async function sendSMS(to: string, message: string) {
    // Basic formatting for SL numbers
    let formattedNum = to.replace(/\D/g, ''); 
    if (formattedNum.startsWith('0')) formattedNum = '94' + formattedNum.substring(1);
    
    const url = `https://app.text.lk/api/v3/sms/send`; 
    await axios.post(url, {
        recipient: formattedNum,
        sender_id: process.env.TEXT_LK_SENDER_ID || 'GrandHotel',
        message: message,
        type: 'plain'
    }, {
        headers: { 'Authorization': `Bearer ${SMS_API_KEY}` }
    });
}

// --- Helper: Email ---
async function sendEmail(to: string, subject: string, text: string) {
  await transporter.sendMail({
    from: `"Grand Hotel System" <${EMAIL_USER}>`,
    to,
    subject,
    text, // Plain text body
    html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #0044cc;">${subject}</h2>
            <p style="font-size: 16px;">${text.replace(/\n/g, '<br>')}</p>
            <hr style="border:0; border-top:1px solid #eee; margin:20px 0;"/>
            <p style="font-size: 12px; color: #888;">Grand Hotel Management System</p>
           </div>`
  });
}