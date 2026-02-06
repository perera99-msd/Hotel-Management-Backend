/* SMS Template Generator - Keep it SHORT and SIMPLE */

interface BookingSMSDetails {
    guestName: string;
    roomNumber: string;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
}

interface OrderSMSDetails {
    orderId: string;
    itemCount: number;
    totalAmount: string;
}

// --- BOOKING CREATED: Customer SMS ---
export const bookingSMSCustomer = (details: BookingSMSDetails): string => {
    return `Hi ${details.guestName}! Your booking at Grand Hotel is confirmed. Room ${details.roomNumber}, ${details.nights} nights (${details.checkInDate} to ${details.checkOutDate}). We look forward to welcoming you!`;
};

// --- BOOKING CREATED: Admin SMS ---
export const bookingSMSAdmin = (details: BookingSMSDetails): string => {
    return `📌 New Booking: ${details.guestName} in Room ${details.roomNumber} from ${details.checkInDate} to ${details.checkOutDate} (${details.nights} nights). Check admin dashboard for details.`;
};

// --- BOOKING CREATED: Receptionist SMS ---
export const bookingSMSReceptionist = (details: BookingSMSDetails): string => {
    return `🔔 Incoming Booking: ${details.guestName}, Room ${details.roomNumber}, Check-in: ${details.checkInDate}. Please prepare room.`;
};

// --- ORDER CREATED: Admin SMS ---
export const orderSMSAdmin = (details: OrderSMSDetails): string => {
    return `🍽️ New Order #${details.orderId}: ${details.itemCount} item(s), Total: ${details.totalAmount}. Check dashboard for details.`;
};

// --- ORDER CREATED: Receptionist SMS ---
export const orderSMSReceptionist = (details: OrderSMSDetails): string => {
    return `📋 New Dining Order #${details.orderId}: ${details.itemCount} items ready for kitchen. Amount: ${details.totalAmount}.`;
};

export default {
    bookingSMSCustomer,
    bookingSMSAdmin,
    bookingSMSReceptionist,
    orderSMSAdmin,
    orderSMSReceptionist,
};
