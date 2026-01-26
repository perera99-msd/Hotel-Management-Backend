import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Invoice, IInvoiceLineItem } from '../models/invoice.js';
import { Booking } from '../models/booking.js';
import { Order } from '../models/order.js';
import { TripRequest } from '../models/tripRequest.js';
import { Revenue } from '../models/revenue.js';

export const invoicesRouter = Router();
invoicesRouter.use(authenticate());

async function buildAutoLineItems(bookingId: string): Promise<IInvoiceLineItem[]> {
  const booking = await Booking.findById(bookingId).populate('roomId');
  if (!booking) throw new Error('Booking not found');

  const items: IInvoiceLineItem[] = [];

    if ((booking as any).roomId?.rate || (booking as any).appliedRate) {
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
      const rate = (booking as any).appliedRate || (booking as any).roomId.rate;
      const roomTotal = (booking as any).roomTotal || rate * nights;
    items.push({
      description: `Room ${(booking as any).roomId.roomNumber || ''} (${nights} night${nights > 1 ? 's' : ''})`,
      qty: 1,
        amount: roomTotal,
      category: 'room',
      source: 'booking',
      refId: booking._id as any
    });
  }

  const orders = await Order.find({ bookingId, status: { $ne: 'Cancelled' } }).lean();
  orders.forEach((o) => {
    items.push({
      description: `Order ${o._id.toString().slice(-6)}`,
      qty: 1,
      amount: o.totalAmount,
      category: 'meal',
      source: 'order',
      refId: o._id as any,
      orderStatus: o.status // Add order status for frontend validation
    } as any);
  });

  const trips = await TripRequest.find({ bookingId, status: { $nin: ['Cancelled', 'Rejected'] } }).lean();
  trips.forEach((t) => {
    items.push({
      description: `Trip: ${t.packageName || t.location || t._id.toString().slice(-6)}`,
      qty: 1,
      amount: t.totalPrice || 0,
      category: 'service',
      source: 'trip',
      refId: t._id as any,
      tripStatus: t.status // Add trip status for frontend validation
    } as any);
  });

  return items;
}

// GET all invoices
invoicesRouter.get('/', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const invoices = await Invoice.find({})
      .populate('bookingId')
      .populate({
        path: 'bookingId',
        populate: { path: 'guestId', select: 'name email phone' }
      })
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// CREATE Invoice
invoicesRouter.post('/', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { bookingId, customItems = [], status, discountItem } = req.body;

    // Check Booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const autoItems = await buildAutoLineItems(bookingId);
    const normalizedCustom: IInvoiceLineItem[] = (customItems || []).map((ci: any) => ({
      description: ci.description,
      qty: ci.qty || 1,
      amount: ci.amount,
      category: ci.category || 'other',
      source: 'custom'
    }));

    let lineItems = [...autoItems, ...normalizedCustom];
    
    // Add discount as line item if provided
    if (discountItem && discountItem.amount > 0) {
      lineItems.push({
        description: `Discount${discountItem.description ? ': ' + discountItem.description : ''}`,
        qty: 1,
        amount: -discountItem.amount,
        category: 'discount',
        source: 'discount'
      });
    }

    const subtotal = lineItems.reduce((sum: number, item: IInvoiceLineItem) => sum + (item.amount || 0), 0);
    const tax = Math.max(0, (subtotal + (discountItem?.amount || 0)) * 0.10); // Tax on pre-discount amount
    const total = subtotal + tax;

    const newInvoice = await Invoice.create({
      bookingId,
      guestId: booking.guestId, // Link to guest automatically
      lineItems,
      subtotal,
      tax,
      total,
      status: status || 'pending',
      paidAt: status === 'paid' ? new Date() : undefined
    });

    res.status(201).json(newInvoice);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create invoice' });
  }
});

// UPDATE Invoice (status/custom items, optional refresh)
invoicesRouter.put('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { status, customItems, discountItem, rebuildItems } = req.body;
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Only rebuild items if explicitly requested or if customItems/discountItem are provided
    const shouldRebuild = rebuildItems || customItems !== undefined || discountItem !== undefined;
    
    if (shouldRebuild) {
      // Rebuild auto items to get latest room charges, orders, trips
      const autoItems = await buildAutoLineItems(invoice.bookingId.toString());
      
      // Normalize custom items passed from frontend
      const customNormalized = (customItems || []).map((ci: any) => ({
        description: ci.description,
        qty: ci.qty || ci.quantity || 1,
        amount: ci.amount,
        category: ci.category || 'other',
        source: 'custom'
      }));
      
      // Combine auto items with custom items
      let lineItems = [...autoItems, ...customNormalized];
      
      // Add discount as line item if provided
      if (discountItem && discountItem.amount > 0) {
        lineItems.push({
          description: `Discount${discountItem.description ? ': ' + discountItem.description : ''}`,
          qty: 1,
          amount: -discountItem.amount,
          category: 'discount',
          source: 'discount'
        });
      }

      const subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const preDiscountSubtotal = autoItems.concat(customNormalized).reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const tax = preDiscountSubtotal * 0.10;
      const total = subtotal + tax;

      invoice.lineItems = lineItems as any;
      invoice.subtotal = subtotal;
      invoice.tax = tax;
      invoice.total = total;
    }
    
    // Update status if provided
    if (status) invoice.status = status;
    if (status === 'paid' && !invoice.paidAt) {
      invoice.paidAt = new Date();
      
      // Record revenue when invoice is paid
      const paidDate = new Date();
      try {
        await Revenue.create({
          invoiceId: invoice._id,
          bookingId: invoice.bookingId,
          amount: invoice.total,
          date: paidDate,
          year: paidDate.getFullYear(),
          month: paidDate.getMonth() + 1,
          day: paidDate.getDate()
        });
      } catch (revenueErr) {
        console.error('Failed to record revenue:', revenueErr);
      }
    }
    if (status && status !== 'paid') invoice.paidAt = undefined;

    await invoice.save();

    const populated = await invoice.populate({
      path: 'bookingId',
      populate: { path: 'guestId', select: 'name email' }
    });

    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update invoice' });
  }
});

// GET auto items for a booking (for UI prefill)
invoicesRouter.get('/booking/:bookingId/items', requireRoles('admin', 'receptionist', 'manager', 'customer'), async (req: Request, res: Response) => {
  try {
    const items = await buildAutoLineItems(req.params.bookingId);
    res.json(items);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to build invoice items' });
  }
});

// GET revenue summary
invoicesRouter.get('/revenue/:period', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const { period } = req.params;
    const { year, month, day } = req.query;
    
    let filter: any = {};
    
    if (period === 'daily' && year && month && day) {
      filter = { 
        year: parseInt(year as string), 
        month: parseInt(month as string), 
        day: parseInt(day as string) 
      };
    } else if (period === 'monthly' && year && month) {
      filter = { 
        year: parseInt(year as string), 
        month: parseInt(month as string) 
      };
    } else if (period === 'yearly' && year) {
      filter = { 
        year: parseInt(year as string) 
      };
    } else {
      return res.status(400).json({ error: 'Invalid period or missing parameters' });
    }
    
    const revenues = await Revenue.find(filter)
      .populate('invoiceId')
      .populate('bookingId')
      .sort({ date: -1 });
    
    const total = revenues.reduce((sum, rev) => sum + rev.amount, 0);
    
    res.json({
      period,
      filter,
      total,
      count: revenues.length,
      revenues
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch revenue' });
  }
});

// DELETE Invoice (only if status is pending)
invoicesRouter.delete('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Cannot delete a paid invoice' });
    }

    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete invoice' });
  }
});