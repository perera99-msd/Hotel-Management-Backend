import { Router, Request, Response } from 'express';
import { Types, isValidObjectId } from 'mongoose';
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
    const user = (req as any).user;

    let guestId = user.mongoId;
    let finalGuestName = guestName || user.name || 'Guest';
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
        const location = roomNumber ? `Room ${roomNumber}` : tableNumber ? `Table ${tableNumber}` : `Guest ${finalGuestName}`;
        const message = `New Order for ${location}.\nItems: ${orderItems.length}\nTotal: $${totalAmount}`;

        // 1. Notify Admin/Kitchen
        await sendNotification({
            type: 'ORDER',
            title: 'New Kitchen Order',
            message: message,
            data: {
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
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update order status' });
  }
});