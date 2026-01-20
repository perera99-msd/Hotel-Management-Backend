import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Order, IOrderItem } from '../models/order.js';
import { MenuItem } from '../models/menuItem.js';
import { sendNotification } from '../services/notificationService.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate());

// GET /api/orders
ordersRouter.get('/', requireRoles('admin', 'receptionist', 'kitchen'), async (_req: Request, res: Response) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /api/orders
ordersRouter.post('/', requireRoles('customer', 'receptionist', 'admin'), async (req: Request, res: Response) => {
  try {
    const { items, roomNumber, tableNumber, specialNotes, guestName, guestId: bodyGuestId } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    // Enrich items with name and price
    const menuItemIds = items.map((i: any) => i.menuItemId);
    const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } }).lean();
    const itemsMap = new Map(menuItems.map((m) => [m._id.toString(), m]));
    
    const orderItems: IOrderItem[] = items.map((i: any) => {
      const mi = itemsMap.get(i.menuItemId);
      if (!mi) throw new Error(`Invalid menu item ID: ${i.menuItemId}`);
      return { 
        menuItemId: mi._id as any, 
        name: mi.name, 
        quantity: i.quantity, 
        price: mi.price 
      };
    });

    const totalAmount = orderItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const user = (req as any).user;

    let guestId = user.mongoId;
    let finalGuestName = guestName || 'Guest';
    const isStaff = user.roles.includes('admin') || user.roles.includes('receptionist');

    if (isStaff) {
      if (bodyGuestId) {
        guestId = bodyGuestId;
      } else if (guestName) {
        guestId = undefined; 
        finalGuestName = guestName;
      }
    }

    if (!user.mongoId) {
        return res.status(400).json({ error: 'User profile not found.' });
    }

    const order = await Order.create({
      guestId,
      guestName: finalGuestName,
      roomNumber,
      tableNumber,
      specialNotes,
      items: orderItems,
      totalAmount,
      placedBy: user.mongoId,
    });
    
    // --- 🔔 NOTIFICATION TRIGGER ---
    try {
        const location = roomNumber ? `Room ${roomNumber}` : `Table ${tableNumber}`;
        const message = `New Order for ${location}.\nItems: ${orderItems.length}\nTotal: $${totalAmount}`;

        // 1. Notify Admin/Kitchen
        await sendNotification({
            type: 'ORDER',
            title: 'New Kitchen Order',
            message: message,
            data: {
                // ✅ Explicit conversion
                orderId: (order._id as Types.ObjectId).toString(),
                location: location
            }
        });

        // 2. If it's a customer placing it, notify them via Email (optional)
        if (!isStaff && user.email) {
            sendNotification({
                type: 'ORDER',
                title: 'Order Received',
                message: `Your order for ${location} has been received.`,
                recipientEmail: user.email,
                recipientPhone: user.phone,
                data: { orderId: (order._id as Types.ObjectId).toString() }
            }).catch(e => console.error("Email Error:", e));
        }
    } catch (notifErr) {
        console.error("Failed to send order notification", notifErr);
    }
    // --- END NOTIFICATION ---

    res.status(201).json(order);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to place order' });
  }
});

// PATCH /api/orders/:id/status
ordersRouter.patch('/:id/status', requireRoles('kitchen', 'receptionist', 'admin'), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update order status' });
  }
});