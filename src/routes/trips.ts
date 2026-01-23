import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { TripPackage } from '../models/tripPackage.js';
import { TripRequest } from '../models/tripRequest.js';
import { User } from '../models/user.js'; 
import { Booking } from '../models/booking.js';
import { Invoice } from '../models/invoice.js';
import { sendNotification } from '../services/notificationService.js';
import dayjs from 'dayjs';

export const tripsRouter = Router();
tripsRouter.use(authenticate());

// --- PACKAGES ---

// GET /trips - Fetch all packages
tripsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const trips = await TripPackage.find({}).sort({ createdAt: -1 }).lean();
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// POST /trips - Create new package
tripsRouter.post('/', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const created = await TripPackage.create(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create trip package' });
  }
});

// PUT /trips/:id
tripsRouter.put('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const updated = await TripPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) { res.status(400).json({ error: 'Update failed' }); }
});

// DELETE /trips/:id
tripsRouter.delete('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    await TripPackage.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// PATCH /trips/:id/status
tripsRouter.patch('/:id/status', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const updated = await TripPackage.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (err) { res.status(400).json({ error: 'Status update failed' }); }
});


// --- BOOKINGS / REQUESTS ---

// GET /requests - Admin: List all bookings
tripsRouter.get('/requests', requireRoles('admin', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const requests = await TripRequest.find({})
      .populate('requestedBy', 'name email phone')
      .populate('packageId', 'name location')
      .populate('bookingId', 'checkIn checkOut status roomId')
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET /requests/mine - Customer: List own trip requests
tripsRouter.get('/requests/mine', requireRoles('customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const requests = await TripRequest.find({ requestedBy: user.mongoId })
      .populate('packageId', 'name location price')
      .populate('bookingId', 'checkIn checkOut status')
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your trip requests' });
  }
});

// POST /requests/admin - Admin: Manually Add Booking
tripsRouter.post('/requests/admin', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { guestId, packageId, tripDate, participants, price, status, notes, bookingId } = req.body;

    if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const allowedStatus = ['Confirmed', 'Pending', 'Completed', 'Cancelled'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if ((status === 'Confirmed') && booking.status !== 'CheckedIn') {
      return res.status(400).json({ error: 'Trip can be confirmed only after booking is checked-in.' });
    }

    // 1. Get Package Details (snapshot)
    const pkg = await TripPackage.findById(packageId);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // 2. Create Request
    const newBooking = await TripRequest.create({
      requestedBy: guestId,
      bookingId,
      packageId: pkg._id,
      packageName: pkg.name,
      location: pkg.location,
      tripDate: tripDate,
      participants: participants,
      totalPrice: price || (pkg.price * participants),
      status: status || 'Confirmed',
      details: notes || 'Manual Booking by Admin'
    });

    // Notify guest about the admin-created trip booking
    try {
      const guest = await User.findById(guestId);
      if (guest) {
        const message = `Hi ${guest.name || 'guest'}, your trip to ${newBooking.location || newBooking.packageName || 'our destination'} on ${newBooking.tripDate ? dayjs(newBooking.tripDate).format('MMM D, YYYY') : 'the selected date'} has been ${newBooking.status?.toLowerCase() || 'created'}.`;
        await sendNotification({
          type: 'TRIP',
          title: 'Trip booking created',
          message,
          recipientEmail: guest.email,
          recipientPhone: guest.phone,
          targetRoles: ['customer'],
          targetUserId: (guest as any)._id.toString(),
          notifyAdmin: false,
          data: { tripRequestId: (newBooking as any)._id.toString(), bookingId: bookingId }
        });
      }
    } catch (notifyErr) {
      console.error('Trip admin creation notification failed', notifyErr);
    }

    res.status(201).json(newBooking);
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
});

// POST /requests - Customer: Request Trip (Standard or Custom)
tripsRouter.post('/requests', requireRoles('customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { packageId, tripDate, participants, details, location, guestInfo, bookingId } = req.body;

    if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Customer can only request against their own booking
    if (booking.guestId?.toString() !== user.mongoId) {
      return res.status(403).json({ error: 'You can only request trips for your own booking' });
    }

    const bookingStatus = booking.status;
    const isEligible = bookingStatus === 'Confirmed' || bookingStatus === 'CheckedIn';
    if (!isEligible) {
      return res.status(400).json({ error: 'Trip requests require a confirmed booking.' });
    }
    
    let bookingData: any = {
      requestedBy: user.mongoId,
      bookingId,
      participants: participants || 1,
      status: 'Requested',
      details: details || '' // Can contain serialized JSON of custom details or guest info
    };

    if (packageId) {
        // --- Standard Package Booking ---
        const pkg = await TripPackage.findById(packageId);
        if (!pkg) return res.status(404).json({ error: 'Package not found' });

        bookingData.packageId = pkg._id;
        bookingData.packageName = pkg.name;
        bookingData.location = pkg.location;
        bookingData.totalPrice = pkg.price * (participants || 1); // Estimated total
        bookingData.tripDate = tripDate;
        
        // Append guest contact info to details if provided
        if (guestInfo) {
             const contactStr = `\n\nContact Info:\nName: ${guestInfo.fullName}\nPhone: ${guestInfo.phoneNumber}\nEmail: ${guestInfo.email}`;
             bookingData.details += contactStr;
        }

    } else {
        // --- Custom Trip Request ---
        bookingData.packageName = "Custom Trip Request";
        bookingData.location = location || "Custom Destination";
        bookingData.tripDate = tripDate; 
        // totalPrice is left undefined/0 until admin reviews
    }

    const created = await TripRequest.create(bookingData);

    try {
      const userCtx = (req as any).user;
      const guest = userCtx?.mongoId ? await User.findById(userCtx.mongoId) : null;
      const requesterName = guest?.name || userCtx?.email || 'Guest';
      const tripDateLabel = bookingData.tripDate ? dayjs(bookingData.tripDate).format('MMM D, YYYY') : 'Flexible date';

      await sendNotification({
        type: 'TRIP',
        title: 'New trip request',
        message: `${requesterName} requested a trip for ${tripDateLabel}. Package: ${bookingData.packageName || bookingData.location || 'Custom trip'}.`,
        targetRoles: ['admin', 'receptionist', 'manager'],
        data: { tripRequestId: (created as any)._id.toString(), bookingId },
      });

      await sendNotification({
        type: 'TRIP',
        title: 'Trip request submitted',
        message: `Hi ${requesterName}, your trip request for ${tripDateLabel} has been submitted. We will review and confirm soon.`,
        recipientEmail: guest?.email,
        recipientPhone: guest?.phone,
        targetRoles: ['customer'],
        targetUserId: guest?._id?.toString() || userCtx?.mongoId,
        notifyAdmin: false,
        data: { tripRequestId: (created as any)._id.toString(), status: created.status }
      });
    } catch (notifyErr) {
      console.error('Trip request notification failed', notifyErr);
    }

    res.status(201).json(created);
  } catch (err: any) {
    console.error("Trip Request Error:", err);
    res.status(400).json({ error: err.message || 'Failed to create trip request' });
  }
});

// PATCH /requests/:id/status - Admin/Receptionist: update status with booking checks
tripsRouter.patch('/requests/:id/status', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { status, responseNotes } = req.body;
    const allowedStatuses = ['Requested', 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'Reviewed', 'Approved', 'Rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const request = await TripRequest.findById(req.params.id).populate('bookingId');
    if (!request) return res.status(404).json({ error: 'Trip request not found' });

    // Accept/approve only if booking is checked-in
    const bookingStatus = (request.bookingId as any)?.status;
    const isCheckedIn = bookingStatus === 'CheckedIn';
    if ((status === 'Confirmed' || status === 'Approved') && !isCheckedIn) {
      return res.status(400).json({ error: 'Trip can be approved only after booking is checked-in.' });
    }

    request.status = status;
    if (responseNotes) request.responseNotes = responseNotes;
    await request.save();

    // Auto-add to existing invoice when trip is confirmed/approved and invoice exists
    if ((status === 'Confirmed' || status === 'Approved') && request.totalPrice) {
      try {
        const invoice = await Invoice.findOne({ 
          bookingId: (request.bookingId as any)._id || request.bookingId, 
          status: { $ne: 'paid' } 
        });
        if (invoice) {
          // Check if this trip is already in the invoice
          const existingTripItem = invoice.lineItems.find((item: any) => 
            item.source === 'trip' && item.refId?.toString() === (request._id as any).toString()
          );
          
          if (!existingTripItem) {
            invoice.lineItems.push({
              description: `Trip: ${request.packageName || request.location || (request._id as any).toString().slice(-6)}`,
              qty: 1,
              amount: request.totalPrice,
              category: 'service',
              source: 'trip',
              refId: request._id as any
            });
            
            // Recalculate totals
            const subtotal = invoice.lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
            invoice.subtotal = subtotal;
            invoice.tax = subtotal * 0.10;
            invoice.total = subtotal + invoice.tax;
            
            await invoice.save();
          }
        }
      } catch (invoiceErr) {
        console.error('Failed to update invoice with trip:', invoiceErr);
      }
    }

    // Notify customer about the status change. For Approved we only send in-app.
    try {
      const guest = await User.findById(request.requestedBy);
      const tripDateLabel = request.tripDate ? dayjs(request.tripDate).format('MMM D, YYYY') : 'your requested date';
      const baseMessage = `Your trip request for ${request.packageName || request.location || 'Trip'} is now ${status}.`;
      const message = status === 'Approved'
        ? `Good news! Your trip for ${tripDateLabel} is approved. We are finalizing arrangements.`
        : responseNotes
          ? `${baseMessage} Notes: ${responseNotes}`
          : baseMessage;

      const shouldSendEmailSms = status !== 'Approved';

      await sendNotification({
        type: 'TRIP',
        title: `Trip ${status}`,
        message,
        targetRoles: ['customer'],
        targetUserId: request.requestedBy.toString(),
        recipientEmail: shouldSendEmailSms ? guest?.email : undefined,
        recipientPhone: shouldSendEmailSms ? guest?.phone : undefined,
        notifyAdmin: false,
        data: { tripRequestId: (request as any)._id.toString(), status }
      });
    } catch (notifyErr) {
      console.error('Trip status notification failed', notifyErr);
    }

    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Failed to update trip request' });
  }
});

// POST /requests/:id/cancel - Admin: Cancel a trip request
tripsRouter.post('/requests/:id/cancel', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const request = await TripRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Trip request not found' });
    
    request.status = 'Cancelled';
    if (req.body.responseNotes) request.responseNotes = req.body.responseNotes;
    await request.save();
    
    // Notify customer about cancellation
    try {
      const guest = await User.findById(request.requestedBy);
      await sendNotification({
        type: 'TRIP',
        title: 'Trip cancelled',
        message: `Your trip request for ${request.packageName || request.location || 'Trip'} has been cancelled.${req.body.responseNotes ? ` Reason: ${req.body.responseNotes}` : ''}`,
        targetRoles: ['customer'],
        targetUserId: request.requestedBy.toString(),
        recipientEmail: guest?.email,
        recipientPhone: guest?.phone,
        notifyAdmin: false,
        data: { tripRequestId: (request as any)._id.toString(), status: 'Cancelled' }
      });
    } catch (notifyErr) {
      console.error('Trip cancellation notification failed', notifyErr);
    }
    
    res.json({ message: 'Trip request cancelled', request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel trip request' });
  }
});