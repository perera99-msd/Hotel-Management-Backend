import { Request, Response, Router } from 'express';
import { Types, isValidObjectId } from 'mongoose';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Invoice } from '../models/invoice.js';
import { MenuItem } from '../models/menuItem.js';
import { IOrderItem, Order } from '../models/order.js';
import { Room } from '../models/room.js';
import { notifyOrderCreated, notifyOrderReady } from '../services/notificationService.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate());

// GET /api/orders
ordersRouter.get('/', requireRoles('admin', 'receptionist', 'kitchen', 'customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isCustomerOnly = user.roles.length === 1 && user.roles.includes('customer');
    const isStaff = user.roles.some((r: string) => ['admin', 'receptionist', 'kitchen', 'manager'].includes(r));

    const query: any = {};
    if (isCustomerOnly) {
      // Limit to orders for this user's bookings
      query.guestId = user.mongoId;
    }

    // For staff, exclude 'Served' orders from the active view (admin dining section)
    if (isStaff) {
      query.status = { $nin: ['Served', 'Cancelled'] };
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

    // --- 🔔 NOTIFICATION TRIGGER (Order Created) ---
    try {
      const guestPhone = (booking.guestId as any)?.phone || (user as any).phone;

      // Use specialized order notification
      await notifyOrderCreated({
        orderId: (order._id as Types.ObjectId).toString(),
        guestId: guestId?.toString() || user.mongoId,
        guestName: finalGuestName,
        guestPhone,
        roomNumber: resolvedRoomNumber,
        items: orderItems,
        totalAmount,
        specialNotes,
      });
    } catch (notifErr) {
      console.error("❌ [Order Notification Failed]", notifErr);
      // Don't let notification errors block the response
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

    // Notify customer when order is ready (in-app notification only, no email/SMS)
    if (status === 'Ready' && order.guestId) {
      try {
        await notifyOrderReady(
          (order._id as Types.ObjectId).toString(),
          (order.guestId as Types.ObjectId).toString(),
          order.guestName || 'Guest',
          order.roomNumber || 'N/A'
        );
      } catch (notifyErr) {
        console.error('❌ [Order Ready Notification Failed]', notifyErr);
        // Don't let notification errors block the response
      }
    }
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update order status' });
  }
});