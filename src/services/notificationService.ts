import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { db } from '../lib/firebaseAdmin.js';
import * as emailTemplates from './emailTemplates.js';
import * as smsTemplates from './smsTemplates.js';

dotenv.config();

// --- Configuration ---
const TEXT_LK_API_KEY = process.env.TEXT_LK_API_KEY;
const TEXT_LK_SENDER_ID = process.env.TEXT_LK_SENDER_ID || 'GrandHotel';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const RECEPTIONIST_EMAIL = process.env.RECEPTIONIST_EMAIL || 'reception@grandhotel.lk';
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
  type: 'BOOKING' | 'ORDER' | 'SYSTEM' | 'TRIP';
  title: string;
  message: string;
  recipientEmail?: string;
  recipientPhone?: string; // Expects 07XXXXXXXX or 947XXXXXXXX
  data?: any;
  targetRoles?: string[]; // Roles that should see this in the dashboard
  targetUserId?: string;   // Specific user (customer) that should see this
  userId?: string;         // ✅ NEW: User ID for Firestore security rules
  persistToDashboard?: boolean; // When false, only email/SMS is sent
  notifyAdmin?: boolean;   // When false, skip the admin email fan-out
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

  const targetRoles = payload.targetRoles?.length
    ? payload.targetRoles
    : ['admin', 'receptionist', 'manager'];

  const shouldPersist = payload.persistToDashboard !== false;

  console.log(`[Notification] Processing: ${payload.title}`);

  // 1. 🔔 Internal Dashboard Notification (Firestore)
  if (shouldPersist) {
    tasks.push(
      db.collection('notifications').add({
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: sanitizeData(payload.data),
        read: false,
        createdAt: new Date(),
        targetRoles,
        targetUserId: payload.targetUserId || null,
        userId: payload.userId || null,  // ✅ NEW: Required for Firestore rules
      }).then(() => console.log('✅ Firestore Notification Saved'))
    );
  }

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
  if (ADMIN_EMAIL && process.env.SMTP_USER && payload.recipientEmail !== ADMIN_EMAIL && payload.notifyAdmin !== false) {
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

// ============================================================
// ✅ SPECIALIZED NOTIFICATION FUNCTIONS
// ============================================================

interface BookingNotificationData {
  bookingId?: string;
  guestId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  roomId: string;
  roomNumber: string;
  roomType?: string;
  checkInDate: Date | string;
  checkOutDate: Date | string;
  nights: number;
  adults?: number;
  children?: number;
  totalPrice?: number;
  appliedDiscount?: number;
}

/** 1️⃣ BOOKING CREATED: Send 3 Emails + 3 SMS + 3 Notifications */
export const notifyBookingCreated = async (data: BookingNotificationData) => {
  const tasks = [];

  console.log(`[Booking Notification] Processing booking for ${data.guestName}`);

  const checkInDate = new Date(data.checkInDate).toLocaleDateString('en-LK', { month: 'short', day: 'numeric', year: 'numeric' });
  const checkOutDate = new Date(data.checkOutDate).toLocaleDateString('en-LK', { month: 'short', day: 'numeric', year: 'numeric' });

  // --- EMAIL 1: Customer ---
  if (data.guestEmail && process.env.SMTP_USER) {
    const emailContent = emailTemplates.bookingConfirmationCustomer({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      roomType: data.roomType,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      nights: data.nights,
      adults: data.adults,
      children: data.children,
      totalPrice: data.totalPrice,
      appliedDiscount: data.appliedDiscount,
      bookingId: data.bookingId,
    });

    tasks.push(
      sendEmailHTML(data.guestEmail, '✅ Booking Confirmation', emailContent)
        .then(() => console.log('✅ Booking Email Sent to Customer'))
        .catch(err => console.error(`❌ Customer Email Failed: ${err.message}`))
    );
  }

  // --- EMAIL 2: Admin ---
  if (ADMIN_EMAIL && process.env.SMTP_USER) {
    const emailContent = emailTemplates.bookingConfirmationStaff({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      roomType: data.roomType,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      nights: data.nights,
      adults: data.adults,
      children: data.children,
      totalPrice: data.totalPrice,
    }, 'admin');

    tasks.push(
      sendEmailHTML(ADMIN_EMAIL, '📌 New Booking Created', emailContent)
        .then(() => console.log('✅ Booking Email Sent to Admin'))
        .catch(err => console.error(`❌ Admin Email Failed: ${err.message}`))
    );
  }

  // --- EMAIL 3: Receptionist ---
  if (RECEPTIONIST_EMAIL && process.env.SMTP_USER) {
    const emailContent = emailTemplates.bookingConfirmationStaff({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      roomType: data.roomType,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      nights: data.nights,
      adults: data.adults,
      children: data.children,
      totalPrice: data.totalPrice,
    }, 'receptionist');

    tasks.push(
      sendEmailHTML(RECEPTIONIST_EMAIL, '🔔 Guest Arrival Alert', emailContent)
        .then(() => console.log('✅ Booking Email Sent to Receptionist'))
        .catch(err => console.error(`❌ Receptionist Email Failed: ${err.message}`))
    );
  }

  // --- SMS 1: Customer ---
  if (data.guestPhone && TEXT_LK_API_KEY) {
    const smsMsg = smsTemplates.bookingSMSCustomer({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      nights: data.nights,
    });

    tasks.push(
      sendSMS(data.guestPhone, smsMsg)
        .then(() => console.log('✅ Booking SMS Sent to Customer'))
        .catch(err => console.error(`❌ Customer SMS Failed: ${err.message}`))
    );
  }

  // --- SMS 2: Admin ---
  if (ADMIN_EMAIL && TEXT_LK_API_KEY) {
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const smsMsg = smsTemplates.bookingSMSAdmin({
        guestName: data.guestName,
        roomNumber: data.roomNumber,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        nights: data.nights,
      });

      tasks.push(
        sendSMS(adminPhone, smsMsg)
          .then(() => console.log('✅ Booking SMS Sent to Admin'))
          .catch(err => console.error(`❌ Admin SMS Failed: ${err.message}`))
      );
    }
  }

  // --- SMS 3: Receptionist ---
  if (TEXT_LK_API_KEY) {
    const receptionPhone = process.env.RECEPTIONIST_PHONE;
    if (receptionPhone) {
      const smsMsg = smsTemplates.bookingSMSReceptionist({
        guestName: data.guestName,
        roomNumber: data.roomNumber,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        nights: data.nights,
      });

      tasks.push(
        sendSMS(receptionPhone, smsMsg)
          .then(() => console.log('✅ Booking SMS Sent to Receptionist'))
          .catch(err => console.error(`❌ Receptionist SMS Failed: ${err.message}`))
      );
    }
  }

  // --- NOTIFICATION 1: Customer ---
  tasks.push(
    db.collection('notifications').add({
      type: 'BOOKING',
      title: '✅ Booking Confirmed',
      message: `Your booking for Room ${data.roomNumber} from ${checkInDate} to ${checkOutDate} is confirmed!`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      userId: data.guestId,
      targetRoles: ['customer'],
      targetUserId: data.guestId,
    })
      .then(() => console.log('✅ Booking Notification Saved for Customer'))
      .catch(err => console.error(`❌ Customer Notification Failed: ${err.message}`))
  );

  // --- NOTIFICATION 2: Admin ---
  tasks.push(
    db.collection('notifications').add({
      type: 'BOOKING',
      title: '📌 New Booking Created',
      message: `New booking for ${data.guestName} in Room ${data.roomNumber}. Check-in: ${checkInDate}`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['admin', 'manager'],
    })
      .then(() => console.log('✅ Booking Notification Saved for Admin'))
      .catch(err => console.error(`❌ Admin Notification Failed: ${err.message}`))
  );

  // --- NOTIFICATION 3: Receptionist ---
  tasks.push(
    db.collection('notifications').add({
      type: 'BOOKING',
      title: '🔔 Incoming Guest',
      message: `${data.guestName} arriving in Room ${data.roomNumber} on ${checkInDate}. Prepare room now.`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['receptionist'],
    })
      .then(() => console.log('✅ Booking Notification Saved for Receptionist'))
      .catch(err => console.error(`❌ Receptionist Notification Failed: ${err.message}`))
  );

  await Promise.allSettled(tasks);
};

interface CheckoutNotificationData {
  guestId: string;
  guestName: string;
  guestEmail: string;
  roomNumber: string;
  checkInDate: Date | string;
  checkOutDate: Date | string;
  nights: number;
  totalPrice: number;
  appliedDiscount?: number;
  taxes?: number;
  finalAmount: number;
  paymentMethod?: string;
}

/** 2️⃣ CHECKOUT: Send 3 Emails + 3 Notifications */
export const notifyCheckout = async (data: CheckoutNotificationData) => {
  const tasks = [];

  console.log(`[Checkout Notification] Processing checkout for ${data.guestName}`);

  // --- EMAIL 1: Customer (with bill details) ---
  if (data.guestEmail && process.env.SMTP_USER) {
    const emailContent = emailTemplates.checkoutBillCustomer({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      nights: data.nights,
      totalPrice: data.totalPrice,
      appliedDiscount: data.appliedDiscount,
      taxes: data.taxes,
      finalAmount: data.finalAmount,
      paymentMethod: data.paymentMethod,
    });

    tasks.push(
      sendEmailHTML(data.guestEmail, '✅ Checkout Complete - Invoice', emailContent)
        .then(() => console.log('✅ Checkout Email Sent to Customer'))
        .catch(err => console.error(`❌ Customer Checkout Email Failed: ${err.message}`))
    );
  }

  // --- EMAIL 2: Admin ---
  if (ADMIN_EMAIL && process.env.SMTP_USER) {
    const emailContent = emailTemplates.checkoutBillStaff({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      nights: data.nights,
      totalPrice: data.totalPrice,
      appliedDiscount: data.appliedDiscount,
      taxes: data.taxes,
      finalAmount: data.finalAmount,
    }, 'admin');

    tasks.push(
      sendEmailHTML(ADMIN_EMAIL, '👤 Guest Checkout', emailContent)
        .then(() => console.log('✅ Checkout Email Sent to Admin'))
        .catch(err => console.error(`❌ Admin Checkout Email Failed: ${err.message}`))
    );
  }

  // --- EMAIL 3: Receptionist ---
  if (RECEPTIONIST_EMAIL && process.env.SMTP_USER) {
    const emailContent = emailTemplates.checkoutBillStaff({
      guestName: data.guestName,
      roomNumber: data.roomNumber,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      nights: data.nights,
      totalPrice: data.totalPrice,
      appliedDiscount: data.appliedDiscount,
      taxes: data.taxes,
      finalAmount: data.finalAmount,
    }, 'receptionist');

    tasks.push(
      sendEmailHTML(RECEPTIONIST_EMAIL, '👤 Guest Checkout', emailContent)
        .then(() => console.log('✅ Checkout Email Sent to Receptionist'))
        .catch(err => console.error(`❌ Receptionist Checkout Email Failed: ${err.message}`))
    );
  }

  const checkOutDate = new Date(data.checkOutDate).toLocaleDateString('en-LK', { month: 'short', day: 'numeric' });

  // --- NOTIFICATION 1: Customer ---
  tasks.push(
    db.collection('notifications').add({
      type: 'BOOKING',
      title: '✅ Checkout Complete',
      message: `Thank you for staying with us! Your invoice has been sent to your email.`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      userId: data.guestId,
      targetRoles: ['customer'],
      targetUserId: data.guestId,
    })
      .then(() => console.log('✅ Checkout Notification Saved for Customer'))
      .catch(err => console.error(`❌ Customer Checkout Notification Failed: ${err.message}`))
  );

  // --- NOTIFICATION 2: Admin ---
  tasks.push(
    db.collection('notifications').add({
      type: 'BOOKING',
      title: '👤 Guest Checked Out',
      message: `${data.guestName} checked out from Room ${data.roomNumber}. Final amount: LKR ${data.finalAmount.toFixed(2)}`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['admin', 'manager'],
    })
      .then(() => console.log('✅ Checkout Notification Saved for Admin'))
      .catch(err => console.error(`❌ Admin Checkout Notification Failed: ${err.message}`))
  );

  // --- NOTIFICATION 3: Receptionist ---
  tasks.push(
    db.collection('notifications').add({
      type: 'BOOKING',
      title: '🧹 Room Ready for Cleaning',
      message: `Room ${data.roomNumber} is now vacant. Prepare for next guest.`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['receptionist'],
    })
      .then(() => console.log('✅ Checkout Notification Saved for Receptionist'))
      .catch(err => console.error(`❌ Receptionist Checkout Notification Failed: ${err.message}`))
  );

  await Promise.allSettled(tasks);
};

interface OrderNotificationData {
  orderId: string;
  guestId?: string;
  guestName: string;
  guestPhone?: string;
  roomNumber?: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  specialNotes?: string;
}

/** 3️⃣ ORDER CREATED: Send 2 SMS (admin, receptionist) + 2 Notifications (no customer SMS) */
export const notifyOrderCreated = async (data: OrderNotificationData) => {
  const tasks = [];

  console.log(`[Order Notification] Processing order #${data.orderId}`);

  const itemCount = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalFormatted = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(data.totalAmount);

  // --- SMS 1: Admin ---
  if (TEXT_LK_API_KEY) {
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const smsMsg = smsTemplates.orderSMSAdmin({
        orderId: data.orderId,
        itemCount,
        totalAmount: totalFormatted,
      });

      tasks.push(
        sendSMS(adminPhone, smsMsg)
          .then(() => console.log('✅ Order SMS Sent to Admin'))
          .catch(err => console.error(`❌ Admin Order SMS Failed: ${err.message}`))
      );
    }
  }

  // --- SMS 2: Receptionist ---
  if (TEXT_LK_API_KEY) {
    const receptionPhone = process.env.RECEPTIONIST_PHONE;
    if (receptionPhone) {
      const smsMsg = smsTemplates.orderSMSReceptionist({
        orderId: data.orderId,
        itemCount,
        totalAmount: totalFormatted,
      });

      tasks.push(
        sendSMS(receptionPhone, smsMsg)
          .then(() => console.log('✅ Order SMS Sent to Receptionist'))
          .catch(err => console.error(`❌ Receptionist Order SMS Failed: ${err.message}`))
      );
    }
  }

  // --- NOTIFICATION 1: Admin ---
  tasks.push(
    db.collection('notifications').add({
      type: 'ORDER',
      title: '🍽️ New Dining Order',
      message: `New order #${data.orderId} from ${data.guestName}. ${itemCount} items, Total: ${totalFormatted}`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['admin', 'manager'],
    })
      .then(() => console.log('✅ Order Notification Saved for Admin'))
      .catch(err => console.error(`❌ Admin Order Notification Failed: ${err.message}`))
  );

  // --- NOTIFICATION 2: Receptionist ---
  tasks.push(
    db.collection('notifications').add({
      type: 'ORDER',
      title: '📋 New Kitchen Order',
      message: `Order #${data.orderId}: ${itemCount} items for Room ${data.roomNumber || 'table'}`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['receptionist'],
    })
      .then(() => console.log('✅ Order Notification Saved for Receptionist'))
      .catch(err => console.error(`❌ Receptionist Order Notification Failed: ${err.message}`))
  );

  await Promise.allSettled(tasks);
};

/** 4️⃣ ORDER READY: Notify Customer Only */
export const notifyOrderReady = async (orderId: string, guestId: string, guestName: string, roomNumber?: string) => {
  console.log(`[Order Ready Notification] Order ${orderId} ready for guest`);

  try {
    await db.collection('notifications').add({
      type: 'ORDER',
      title: '✅ Order Ready',
      message: `Your order is ready! Please pick it up from the dining area.`,
      data: sanitizeData({ orderId, roomNumber }),
      read: false,
      createdAt: new Date(),
      userId: guestId,
      targetRoles: ['customer'],
      targetUserId: guestId,
    });

    console.log('✅ Order Ready Notification Sent to Customer');
  } catch (err) {
    console.error(`❌ Order Ready Notification Failed:`, err);
  }
};

interface TripRequestNotificationData {
  requestId: string;
  guestId: string;
  guestName: string;
  location: string;
  tripDate: Date | string;
  participants: number;
  totalPrice?: number;
  details?: string;
}

/** 5️⃣ TRIP REQUEST CREATED: Notify Admin + Receptionist Only */
export const notifyTripRequestCreated = async (data: TripRequestNotificationData) => {
  console.log(`[Trip Request Notification] New trip request from ${data.guestName}`);

  const tasks = [];

  const tripDate = new Date(data.tripDate).toLocaleDateString('en-LK', { month: 'short', day: 'numeric', year: 'numeric' });

  // --- NOTIFICATION 1: Admin ---
  tasks.push(
    db.collection('notifications').add({
      type: 'TRIP',
      title: '✈️ New Trip Request',
      message: `${data.guestName} requested a trip to ${data.location} on ${tripDate}. ${data.participants} participant(s).`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['admin', 'manager'],
    })
      .then(() => console.log('✅ Trip Request Notification Saved for Admin'))
      .catch(err => console.error(`❌ Admin Trip Request Notification Failed: ${err.message}`))
  );

  // --- NOTIFICATION 2: Receptionist ---
  tasks.push(
    db.collection('notifications').add({
      type: 'TRIP',
      title: '✈️ New Trip Request',
      message: `${data.guestName} requested a trip to ${data.location}. Check dashboard for details.`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      targetRoles: ['receptionist'],
    })
      .then(() => console.log('✅ Trip Request Notification Saved for Receptionist'))
      .catch(err => console.error(`❌ Receptionist Trip Request Notification Failed: ${err.message}`))
  );

  await Promise.allSettled(tasks);
};

/** 6️⃣ TRIP REQUEST CONFIRMED: Notify Customer Only */
export const notifyTripRequestConfirmed = async (data: TripRequestNotificationData) => {
  console.log(`[Trip Confirmed Notification] Trip request ${data.requestId} confirmed`);

  try {
    // --- EMAIL: Customer ---
    if (process.env.SMTP_USER) {
      const emailContent = emailTemplates.tripConfirmationCustomer({
        guestName: data.guestName,
        location: data.location,
        tripDate: data.tripDate,
        participants: data.participants,
        totalPrice: data.totalPrice,
        details: data.details,
      });

      sendEmailHTML('customer@example.com', '✈️ Trip Request Confirmed', emailContent)
        .catch(err => console.error(`❌ Trip Confirmation Email Failed: ${err.message}`));
    }

    // --- NOTIFICATION: Customer ---
    await db.collection('notifications').add({
      type: 'TRIP',
      title: '✈️ Trip Confirmed!',
      message: `Your trip to ${data.location} on ${new Date(data.tripDate).toLocaleDateString()} has been confirmed!`,
      data: sanitizeData(data),
      read: false,
      createdAt: new Date(),
      userId: data.guestId,
      targetRoles: ['customer'],
      targetUserId: data.guestId,
    });

    console.log('✅ Trip Confirmation Notification Sent to Customer');
  } catch (err) {
    console.error(`❌ Trip Confirmation Notification Failed:`, err);
  }
};

/** 7️⃣ BILL PAID: Notify Customer Only */
export const notifyBillPaid = async (guestId: string, guestName: string, invoiceId: string, amount: number) => {
  console.log(`[Bill Paid Notification] Invoice ${invoiceId} marked as paid`);

  try {
    const amountFormatted = new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
    }).format(amount);

    await db.collection('notifications').add({
      type: 'SYSTEM',
      title: '💰 Payment Received',
      message: `Thank you! Your payment of ${amountFormatted} has been received and processed.`,
      data: sanitizeData({ invoiceId, amount }),
      read: false,
      createdAt: new Date(),
      userId: guestId,
      targetRoles: ['customer'],
      targetUserId: guestId,
    });

    console.log('✅ Bill Payment Notification Sent to Customer');
  } catch (err) {
    console.error(`❌ Bill Payment Notification Failed:`, err);
  }
};



// --- Helper: Send HTML Email (Direct) ---
async function sendEmailHTML(to: string, subject: string, htmlContent: string) {
  await transporter.sendMail({
    from: `"Grand Hotel" <${SENDER_EMAIL}>`,
    to,
    subject,
    html: htmlContent,
  });
}
