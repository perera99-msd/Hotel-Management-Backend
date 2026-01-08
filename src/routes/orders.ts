import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Order, IOrder, IOrderItem } from '../models/order.js';
import { MenuItem } from '../models/menuItem.js';

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
    // Destructure guestId from body (was missing before)
    const { items, roomNumber, tableNumber, specialNotes, guestName, guestId: bodyGuestId } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    // Enrich items with name and price snapshot
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

    // FIX 1: user.sub does not exist on your AuthUser interface. Use user.mongoId.
    let guestId = user.mongoId;
    let finalGuestName = guestName || 'Guest';

    // FIX 2: Check roles array properly (user.role does not exist)
    const isStaff = user.roles.includes('admin') || user.roles.includes('receptionist');

    // If admin/receptionist is placing the order manually
    if (isStaff) {
      if (bodyGuestId) {
        // Admin selected a registered user
        guestId = bodyGuestId;
        // finalGuestName = guestName || 'Guest'; 
      } else if (guestName) {
        // Admin entered a manual name (no registered user)
        guestId = undefined; 
        finalGuestName = guestName;
      }
    }

    // FIX 3: Ensure we have a valid ID for placedBy
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
      placedBy: user.mongoId, // FIX: Use correct property
    });
    
    res.status(201).json(order);
  } catch (err: any) {
    // Return specific error message to frontend
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