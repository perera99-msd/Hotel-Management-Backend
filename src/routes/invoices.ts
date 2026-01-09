import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Invoice } from '../models/invoice.js';
import { Booking } from '../models/booking.js';

export const invoicesRouter = Router();
invoicesRouter.use(authenticate());

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
    const { bookingId, items, status } = req.body;

    // Check Booking
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Calc totals
    const lineItems = items || [];
    const subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.amount), 0);
    const tax = subtotal * 0.10; 
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

// UPDATE Invoice (Pay)
invoicesRouter.put('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const updateData: any = { status };
    
    if (status === 'paid') updateData.paidAt = new Date();

    const updated = await Invoice.findByIdAndUpdate(req.params.id, updateData, { new: true })
        .populate({
            path: 'bookingId',
            populate: { path: 'guestId', select: 'name email' }
        });

    if (!updated) return res.status(404).json({ error: 'Invoice not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update invoice' });
  }
});