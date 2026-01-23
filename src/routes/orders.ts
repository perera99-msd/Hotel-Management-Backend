import { Router, Request, Response } from 'express';
import { Types, isValidObjectId } from 'mongoose';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Order, IOrderItem } from '../models/order.js';
import { MenuItem } from '../models/menuItem.js';
import { Booking } from '../models/booking.js';
import { Room } from '../models/room.js';
import { Invoice } from '../models/invoice.js';
import { sendNotification } from '../services/notificationService.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate());

// GET /api/orders
ordersRouter.get('/', requireRoles('admin', 'receptionist', 'kitchen', 'customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isCustomerOnly = user.roles.length === 1 && user.roles.includes('customer');

    const query: any = {};
    if (isCustomerOnly) {
      // Limit to orders for this user's bookings
      query.guestId = user.mongoId;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /api/orders
ordersRouter.post('/', requireRoles('customer', 'receptionist', 'admin'), async (req: Request, res: Response) => {
  try {
    const { items, roomNumber, tableNumber, specialNotes, guestName, guestId: bodyGuestId, bookingId } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    // Booking validation
    if (!bookingId || !isValidObjectId(bookingId)) {
      return res.status(400).json({ error: 'bookingId is required and must be a valid id' });
    }

    const booking = await Booking.findById(bookingId).populate('guestId');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const bookingStatus = booking.status;
    const isCheckedIn = bookingStatus === 'CheckedIn';
    const isStaff = (req as any).user.roles.includes('admin') || (req as any).user.roles.includes('receptionist');

    // Enforce orders only when booking is checked-in for all roles
    if (!isCheckedIn) {
      return res.status(400).json({ error: 'Orders can be placed only after the booking is checked-in.' });
    }

    // Customers can order only for their own booking
    const user = (req as any).user;
    if (!isStaff && booking.guestId) {
      const guestId = (booking.guestId as any)?._id || booking.guestId;
      if (guestId.toString() !== user.mongoId) {
        return res.status(403).json({ error: 'You can only order for your own checked-in booking.' });
      }
    }

    // Separate standard DB items from custom/manual items
    const standardItemIds = items
      .filter((i: any) => isValidObjectId(i.menuItemId))
      .map((i: any) => i.menuItemId);

    // Fetch standard items
    const dbMenuItems = await MenuItem.find({ _id: { $in: standardItemIds } }).lean();
    const dbItemsMap = new Map(dbMenuItems.map((m) => [m._id.toString(), m]));
    
    const orderItems: IOrderItem[] = [];
    
    // Process all items
    for (const i of items) {
        if (isValidObjectId(i.menuItemId)) {
            // Standard Item: Verify existence and price
            const mi = dbItemsMap.get(i.menuItemId);
            if (!mi) {
                // If ID was valid format but not found in DB, skip or throw? 
                // We'll throw to ensure data integrity.
                throw new Error(`Invalid menu item ID: ${i.menuItemId}`);
            }
            orderItems.push({ 
                menuItemId: mi._id as any, 
                name: mi.name, 
                quantity: Number(i.quantity) || 1, 
                price: mi.price 
            });
        } else {
            // Custom/Manual Item: Use provided details (Trusting frontend for Custom Orders)
            // Ideally, we might want a "Custom Item" placeholder in DB, but for now we generate a new ID if needed 
            // or just store it. However, Schema expects 'menuItemId' to be ObjectId.
            // WORKAROUND: For pure custom items without a DB entry, we usually need a generic "Custom Food" item in DB.
            // If that doesn't exist, we can't strictly satisfy the 'ref: MenuItem' constraint unless we make it optional.
            // Assuming strict schema: We will just fail if strictly enforced. 
            // BUT, let's assume we can create a temporary ID or the schema is loose enough. 
            // Actually, best practice: Create the order with these items. 
            // If Schema requires valid ObjectId ref, we might hit a snag.
            // Let's create a dynamic ObjectId for the session or if it's a "Custom Order" string.
            
            // Allow bypassing strict ref check if schema allows, or use a specific system ObjectId.
            // For this specific codebase, we will generate a new ObjectId for the record, 
            // but note that 'populate' will fail for these items.
            orderItems.push({
                menuItemId: new Types.ObjectId(), // Generate a dummy ID for the record
                name: i.name || "Custom Item",
                quantity: Number(i.quantity) || 1,
                price: Number(i.price) || 0
            });
        }
    }

    const totalAmount = orderItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    let guestId = booking.guestId as any;
    let finalGuestName = (booking.guestId as any)?.name || guestName || user.name || 'Guest';

    if (isStaff && bodyGuestId) {
      guestId = bodyGuestId;
    }

    if (!user.mongoId) {
        return res.status(400).json({ error: 'User profile not found.' });
    }

    // Try to pick room number from booking if not provided
    let resolvedRoomNumber = roomNumber;
    if (!resolvedRoomNumber && booking.roomId) {
      const roomDoc = await Room.findById(booking.roomId).lean();
      resolvedRoomNumber = roomDoc?.roomNumber;
    }

    const order = await Order.create({
      bookingId,
      guestId,
      guestName: finalGuestName,
      roomNumber: resolvedRoomNumber,
      tableNumber,
      specialNotes,
      items: orderItems,
      totalAmount,
      placedBy: user.mongoId,
    });
    
    // --- 🔔 NOTIFICATION TRIGGER ---
    try {
      const location = roomNumber ? `Room ${roomNumber}` : tableNumber ? `Table ${tableNumber}` : `Guest ${finalGuestName}`;
      const guestEmail = (booking.guestId as any)?.email || user.email;
      const guestPhone = (booking.guestId as any)?.phone || (user as any).phone;
      const itemSummary = orderItems.map((i) => `${i.quantity} x ${i.name}`).join(', ');

      const staffMessage = `New order placed for ${location}.\nItems: ${itemSummary || 'See order'}\nTotal: $${totalAmount.toFixed(2)}`;

      // 1. Notify Admin/Kitchen/Reception via dashboard
      await sendNotification({
        type: 'ORDER',
        title: 'New Kitchen Order',
        message: staffMessage,
        targetRoles: ['admin', 'receptionist', 'manager', 'kitchen'],
        data: {
          orderId: (order._id as Types.ObjectId).toString(),
          location: location
        }
      });

      // 2. Notify customer via email/SMS and dashboard (no staff duplication)
      if (!isStaff && guestEmail) {
        await sendNotification({
          type: 'ORDER',
          title: 'We received your order',
          message: `Hi ${finalGuestName}, we received your dining order for ${location}.\nItems: ${itemSummary || 'See order details'}.\nTotal: $${totalAmount.toFixed(2)}. We will let you know once it is ready.`,
        recipientEmail: guestEmail,
        recipientPhone: guestPhone,
          targetRoles: ['customer'],
          targetUserId: user.mongoId,
          notifyAdmin: false,
          data: { orderId: (order._id as Types.ObjectId).toString(), status: 'Preparing' }
        });
      }
    } catch (notifErr) {
        console.error("Failed to send order notification", notifErr);
    }

    // Auto-add to existing invoice if it exists and is not paid
    try {
      const invoice = await Invoice.findOne({ bookingId, status: { $ne: 'paid' } });
      if (invoice) {
        invoice.lineItems.push({
          description: `Order ${(order._id as any).toString().slice(-6)}`,
          qty: 1,
          amount: totalAmount,
          category: 'meal',
          source: 'order',
          refId: order._id as any
        });
        
        // Recalculate totals
        const subtotal = invoice.lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
        invoice.subtotal = subtotal;
        invoice.tax = subtotal * 0.10;
        invoice.total = subtotal + invoice.tax;
        
        await invoice.save();
      }
    } catch (invoiceErr) {
      console.error('Failed to update invoice with new order:', invoiceErr);
    }

    res.status(201).json(order);
  } catch (err: any) {
    console.error("Order Creation Error:", err);
    res.status(400).json({ error: err.message || 'Failed to place order' });
  }
});

// PATCH /api/orders/:id/status
ordersRouter.patch('/:id/status', requireRoles('kitchen', 'receptionist', 'admin'), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Notify customer when order is ready (in-app only)
    if (status === 'Ready' && order.guestId) {
      try {
        const location = order.roomNumber ? `Room ${order.roomNumber}` : order.tableNumber ? `Table ${order.tableNumber}` : 'your room';
        await sendNotification({
          type: 'ORDER',
          title: 'Order ready',
          message: `Hi ${order.guestName || 'guest'}, your order for ${location} is ready and will be served shortly.`,
          targetRoles: ['customer'],
          targetUserId: (order.guestId as Types.ObjectId).toString(),
          notifyAdmin: false,
          data: { orderId: (order as any)._id.toString(), status: order.status },
        });
      } catch (notifyErr) {
        console.error('Failed to send order ready notification', notifyErr);
      }
    }
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update order status' });
  }
});