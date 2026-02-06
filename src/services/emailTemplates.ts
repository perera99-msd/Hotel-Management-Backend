/* Email Template Generator */
import dayjs from 'dayjs';

interface BookingDetails {
    guestName: string;
    roomNumber: string;
    roomType?: string;
    checkInDate: Date | string;
    checkOutDate: Date | string;
    nights: number;
    adults?: number;
    children?: number;
    totalPrice?: number;
    appliedDiscount?: number;
    bookingId?: string;
}

interface CheckoutDetails extends BookingDetails {
    totalPrice: number;
    appliedDiscount?: number;
    taxes?: number;
    finalAmount: number;
    paymentMethod?: string;
}

interface OrderDetails {
    orderId: string;
    guestName: string;
    roomNumber?: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    totalAmount: number;
    specialNotes?: string;
}

interface TripDetails {
    guestName: string;
    location: string;
    tripDate: Date | string;
    participants: number;
    totalPrice?: number;
    details?: string;
}

// --- Helper: Format Currency ---
const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR',
        minimumFractionDigits: 2,
    }).format(amount);
};

// --- Helper: Format Date ---
const formatDate = (date: Date | string): string => {
    return dayjs(date).format('MMMM D, YYYY');
};

// --- Helper: Base Template ---
const baseTemplate = (title: string, content: string, footer: string = ''): string => {
    return `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #003580 0%, #005a9c 100%); padding: 30px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">🏨 Grand Hotel</h1>
        <p style="color: #e0e0e0; margin: 5px 0 0 0; font-size: 14px;">Your Comfort, Our Priority</p>
      </div>
      
      <!-- Title -->
      <div style="background-color: #f8f9fa; padding: 20px; border-bottom: 2px solid #e0e0e0;">
        <h2 style="color: #003580; margin: 0; font-size: 22px;">${title}</h2>
      </div>
      
      <!-- Content -->
      <div style="padding: 30px; background-color: #ffffff; color: #333; line-height: 1.8; font-size: 14px;">
        ${content}
      </div>
      
      <!-- Footer -->
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e0e0e0;">
        ${footer || `<p style="margin: 0;">&copy; ${new Date().getFullYear()} Grand Hotel Management System</p>`}
      </div>
    </div>
  `;
};

// --- BOOKING CONFIRMATION: Customer ---
export const bookingConfirmationCustomer = (details: BookingDetails): string => {
    const content = `
    <p>Dear ${details.guestName},</p>
    
    <p>Thank you for your booking at <strong>Grand Hotel</strong>! We're excited to welcome you.</p>
    
    <div style="background-color: #f0f7ff; padding: 20px; border-left: 4px solid #003580; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #003580; margin-top: 0; margin-bottom: 15px;">📋 Booking Summary</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Booking ID:</strong></td>
          <td style="padding: 8px 0; text-align: right;"><code style="background: #e0e0e0; padding: 4px 8px; border-radius: 3px;">${details.bookingId || 'N/A'}</code></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Room:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.roomNumber}${details.roomType ? ` (${details.roomType})` : ''}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Check-in:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.checkInDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Check-out:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.checkOutDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Duration:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.nights} night${details.nights !== 1 ? 's' : ''}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Guests:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.adults || 0} adults${details.children ? `, ${details.children} children` : ''}</td>
        </tr>
        ${details.totalPrice ? `
        <tr style="border-top: 1px solid #ddd;">
          <td style="padding: 12px 0; color: #003580;"><strong>Total Amount:</strong></td>
          <td style="padding: 12px 0; text-align: right; color: #003580; font-size: 16px; font-weight: 600;">${formatCurrency(details.totalPrice)}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p style="margin-top: 25px;">We look forward to your arrival! If you have any questions, please don't hesitate to contact us.</p>
    
    <p><strong>Contact Information:</strong></p>
    <ul style="margin: 10px 0; padding-left: 20px;">
      <li>📞 Phone: +94 11 2 755 755</li>
      <li>📧 Email: reservations@grandhotel.lk</li>
      <li>🌐 Website: www.grandhotel.lk</li>
    </ul>
    
    <p>Best regards,<br><strong>The Grand Hotel Team</strong></p>
  `;

    return baseTemplate('✅ Booking Confirmed', content);
};

// --- BOOKING CONFIRMATION: Admin/Receptionist ---
export const bookingConfirmationStaff = (details: BookingDetails, userRole: 'admin' | 'receptionist'): string => {
    const roleLabel = userRole === 'admin' ? 'Administrator' : 'Front Desk';
    const content = `
    <p>Dear ${roleLabel},</p>
    
    <p>A new booking has been created in the system. Please review the details below:</p>
    
    <div style="background-color: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #856404; margin-top: 0; margin-bottom: 15px;">🔔 New Booking Alert</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Guest Name:</strong></td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500;">${details.guestName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Room:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.roomNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Check-in:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.checkInDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Check-out:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.checkOutDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Guests:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.adults || 0} adults${details.children ? `, ${details.children} children` : ''}</td>
        </tr>
        ${details.totalPrice ? `
        <tr style="border-top: 1px solid #ddd;">
          <td style="padding: 12px 0; color: #003580;"><strong>Total Amount:</strong></td>
          <td style="padding: 12px 0; text-align: right; color: #003580; font-weight: 600;">${formatCurrency(details.totalPrice)}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <p>Please ensure the room is prepared and the guest is welcomed upon arrival. You can manage this booking in the admin dashboard.</p>
    
    <p>Best regards,<br><strong>Grand Hotel Management System</strong></p>
  `;

    return baseTemplate(`New Booking - ${userRole === 'admin' ? 'Admin Alert' : 'Front Desk Notice'}`, content);
};

// --- CHECKOUT/BILL EMAIL: Customer ---
export const checkoutBillCustomer = (details: CheckoutDetails): string => {
    const content = `
    <p>Dear ${details.guestName},</p>
    
    <p>Thank you for staying with us! Here is your checkout invoice:</p>
    
    <div style="background-color: #e8f5e9; padding: 20px; border-left: 4px solid #4caf50; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #2e7d32; margin-top: 0; margin-bottom: 15px;">📜 Checkout Invoice</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Room:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.roomNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Check-in:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.checkInDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Check-out:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.checkOutDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Duration:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.nights} night${details.nights !== 1 ? 's' : ''}</td>
        </tr>
        <tr style="border-top: 2px solid #ddd; border-bottom: 2px solid #ddd; padding-top: 10px; margin-top: 10px;">
          <td style="padding: 12px 0; color: #666;"><strong>Subtotal:</strong></td>
          <td style="padding: 12px 0; text-align: right; font-weight: 500;">${formatCurrency(details.totalPrice)}</td>
        </tr>
        ${details.appliedDiscount && details.appliedDiscount > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #4caf50;"><strong>Discount:</strong></td>
          <td style="padding: 8px 0; text-align: right; color: #4caf50;">-${formatCurrency(details.appliedDiscount)}</td>
        </tr>
        ` : ''}
        ${details.taxes ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Taxes:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatCurrency(details.taxes)}</td>
        </tr>
        ` : ''}
        <tr style="background-color: #f0f0f0;">
          <td style="padding: 15px 0; color: #2e7d32; font-size: 18px;"><strong>Final Amount:</strong></td>
          <td style="padding: 15px 0; text-align: right; color: #2e7d32; font-size: 18px; font-weight: 700;">${formatCurrency(details.finalAmount)}</td>
        </tr>
      </table>
    </div>
    
    <p style="margin-top: 20px;"><strong>Payment Method:</strong> ${details.paymentMethod || 'Not specified'}</p>
    
    <p>We hope you had a pleasant stay! We would love to hear your feedback. Please visit our website or contact us anytime.</p>
    
    <p>Best regards,<br><strong>The Grand Hotel Team</strong></p>
  `;

    return baseTemplate('✅ Checkout Complete - Invoice', content);
};

// --- CHECKOUT/BILL EMAIL: Admin/Receptionist ---
export const checkoutBillStaff = (details: CheckoutDetails, userRole: 'admin' | 'receptionist'): string => {
    const roleLabel = userRole === 'admin' ? 'Administrator' : 'Front Desk';
    const content = `
    <p>Dear ${roleLabel},</p>
    
    <p>Guest checkout processed. Here are the details:</p>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-left: 4px solid #2196f3; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #1565c0; margin-top: 0; margin-bottom: 15px;">👤 Guest Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Guest:</strong></td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500;">${details.guestName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Room:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.roomNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Stay Duration:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.nights} night${details.nights !== 1 ? 's' : ''}</td>
        </tr>
      </table>
    </div>
    
    <div style="background-color: #f3e5f5; padding: 20px; border-left: 4px solid #9c27b0; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #6a1b9a; margin-top: 0; margin-bottom: 15px;">💰 Financial Summary</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Subtotal:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatCurrency(details.totalPrice)}</td>
        </tr>
        ${details.appliedDiscount && details.appliedDiscount > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Discount:</strong></td>
          <td style="padding: 8px 0; text-align: right; color: #4caf50;">-${formatCurrency(details.appliedDiscount)}</td>
        </tr>
        ` : ''}
        ${details.taxes ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Taxes:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatCurrency(details.taxes)}</td>
        </tr>
        ` : ''}
        <tr style="background-color: #f0f0f0; border-top: 2px solid #ddd;">
          <td style="padding: 12px 0; font-weight: 600;"><strong>Total:</strong></td>
          <td style="padding: 12px 0; text-align: right; font-weight: 700; color: #6a1b9a;">${formatCurrency(details.finalAmount)}</td>
        </tr>
      </table>
    </div>
    
    <p>Room is now available for cleaning and reassignment. Update room status in the system.</p>
    
    <p>Best regards,<br><strong>Grand Hotel Management System</strong></p>
  `;

    return baseTemplate('Room Checkout Processed', content);
};

// --- ORDER ALERT: Admin/Receptionist ---
export const orderAlertStaff = (details: OrderDetails, userRole: 'admin' | 'receptionist'): string => {
    const content = `
    <p>Dear ${userRole === 'admin' ? 'Administrator' : 'Front Desk'},</p>
    
    <p>A new dining order has been placed and requires attention:</p>
    
    <div style="background-color: #fff8e1; padding: 20px; border-left: 4px solid #ff9800; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #e65100; margin-top: 0; margin-bottom: 15px;">🍽️ New Order Alert</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Order ID:</strong></td>
          <td style="padding: 8px 0; text-align: right; font-family: monospace;">${details.orderId}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Guest:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.guestName}</td>
        </tr>
        ${details.roomNumber ? `
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Room:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.roomNumber}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <h4 style="color: #333; margin-top: 20px;">📋 Order Items:</h4>
    <table style="width: 100%; border-collapse: collapse; background: #f5f5f5;">
      <thead>
        <tr style="background-color: #003580; color: white;">
          <th style="padding: 10px; text-align: left; font-weight: 600;">Item</th>
          <th style="padding: 10px; text-align: center; font-weight: 600;">Qty</th>
          <th style="padding: 10px; text-align: right; font-weight: 600;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${details.items.map(item => `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; text-align: left;">${item.name}</td>
          <td style="padding: 10px; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; text-align: right;">${formatCurrency(item.price * item.quantity)}</td>
        </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #e0e0e0; font-weight: 600;">
          <td colspan="2" style="padding: 10px; text-align: right;">Total:</td>
          <td style="padding: 10px; text-align: right; color: #003580;">${formatCurrency(details.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
    
    ${details.specialNotes ? `<p><strong>Special Notes:</strong> ${details.specialNotes}</p>` : ''}
    
    <p style="margin-top: 20px;">Please prepare this order and notify when ready.</p>
    
    <p>Best regards,<br><strong>Grand Hotel Management System</strong></p>
  `;

    return baseTemplate('🔔 New Dining Order', content);
};

// --- TRIP REQUEST CONFIRMATION: Customer ---
export const tripConfirmationCustomer = (details: TripDetails): string => {
    const content = `
    <p>Dear ${details.guestName},</p>
    
    <p>Great news! Your trip request has been confirmed. Here are the details:</p>
    
    <div style="background-color: #c8e6c9; padding: 20px; border-left: 4px solid #2e7d32; margin: 20px 0; border-radius: 4px;">
      <h3 style="color: #1b5e20; margin-top: 0; margin-bottom: 15px;">✈️ Trip Confirmed</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Destination:</strong></td>
          <td style="padding: 8px 0; text-align: right; font-weight: 500;">${details.location}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Trip Date:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${formatDate(details.tripDate)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>Participants:</strong></td>
          <td style="padding: 8px 0; text-align: right;">${details.participants}</td>
        </tr>
        ${details.totalPrice ? `
        <tr style="border-top: 1px solid #ddd;">
          <td style="padding: 12px 0; color: #1b5e20;"><strong>Total Price:</strong></td>
          <td style="padding: 12px 0; text-align: right; color: #2e7d32; font-weight: 600;">${formatCurrency(details.totalPrice)}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    ${details.details ? `<p><strong>Trip Details:</strong></p><p style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${details.details}</p>` : ''}
    
    <p>Our team will contact you shortly with additional information. Have a wonderful trip!</p>
    
    <p>Best regards,<br><strong>The Grand Hotel Team</strong></p>
  `;

    return baseTemplate('✈️ Trip Request Confirmed', content);
};

export default {
    bookingConfirmationCustomer,
    bookingConfirmationStaff,
    checkoutBillCustomer,
    checkoutBillStaff,
    orderAlertStaff,
    tripConfirmationCustomer,
};
