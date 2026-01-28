import { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Deal } from '../models/deal.js';
import { Invoice } from '../models/invoice.js';
import { Room } from '../models/room.js';
import { User } from '../models/user.js';
import { sendNotification } from '../services/notificationService.js';
import { calculateBookingCharges } from '../utils/bookingCalculations.js';

export const bookingsRouter = Router();

bookingsRouter.use(authenticate());

// --- GET: List Bookings ---
bookingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isStaff = user.roles.some((r: string) => ['admin', 'receptionist', 'manager'].includes(r));
    const filter: any = isStaff ? {} : { guestId: user.mongoId };

    const bookings = await Booking.find(filter)
      .populate('roomId')
      .populate('guestId', 'name email phone')
      .populate('appliedDealId', 'dealName discount') // Include deal info
      .sort({ createdAt: -1 })
      .lean();

    res.json(bookings);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// --- POST: Calculate Booking Charges Preview ---
// Frontend booking form can call this to show rate breakdown before creating booking
bookingsRouter.post('/calculate-charges', requireRoles('admin', 'receptionist', 'customer'), async (req: Request, res: Response) => {
  try {
    const { roomId, checkIn, checkOut } = req.body;

    if (!roomId || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Room ID, check-in, and check-out dates are required' });
    }

    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const start = new Date(checkIn);
    const end = new Date(checkOut);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ error: 'Invalid dates' });
    }

    // Find applicable deals
    const allowedDealStatuses = ['Ongoing', 'New', 'Inactive', 'Full'];
    const potentialDeals = await Deal.find({
      status: { $in: allowedDealStatuses },
      $or: [
        { roomIds: { $in: [roomId] } },
        { roomType: new RegExp(`^${(room as any).type}$`, 'i') }
      ]
    }).lean();

    const isDealInWindow = (deal: any) => {
      const startDate = new Date(deal.startDate);
      const endDate = new Date(deal.endDate);
      return !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= end && endDate >= start;
    };

    const applicableDeals = potentialDeals.filter((deal) => {
      const typeMatch = Array.isArray(deal.roomType) && deal.roomType.some((t: string) => t.toLowerCase() === ((room as any).type || '').toLowerCase());
      const roomMatch = Array.isArray((deal as any).roomIds) && (deal as any).roomIds.some((id: any) => id.toString() === roomId.toString());
      const inWindow = isDealInWindow(deal);
      return inWindow && (roomMatch || typeMatch);
    });

    let chosenDeal: any = null;
    if (applicableDeals.length > 0) {
      chosenDeal = applicableDeals.reduce((best, deal) => {
        if (!best || deal.discount > best.discount) return deal;
        return best;
      }, null as any);
    }

    const monthlyRates = (room as any).monthlyRates || [];
    const baseRate = (room as any).rate || 0;

    const rateBreakdown = calculateBookingCharges(
      start,
      end,
      monthlyRates,
      baseRate,
      chosenDeal ? {
        dealId: chosenDeal._id.toString(),
        dealName: chosenDeal.dealName,
        discount: chosenDeal.discount || 0,
        startDate: new Date(chosenDeal.startDate),
        endDate: new Date(chosenDeal.endDate)
      } : undefined
    );

    res.json({
      success: true,
      roomNumber: room.roomNumber,
      rateBreakdown,
      deal: chosenDeal ? {
        id: chosenDeal._id,
        name: chosenDeal.dealName,
        discount: chosenDeal.discount
      } : null
    });
  } catch (error: any) {
    console.error('Error calculating charges:', error);
    res.status(500).json({ error: error.message || 'Failed to calculate charges' });
  }
});

// --- POST: Create Booking ---
bookingsRouter.post('/', requireRoles('admin', 'receptionist', 'customer'), async (req: Request, res: Response) => {
  try {
    // ✅ Extract new fields from body
    const {
      roomId,
      checkIn,
      checkOut,
      guestId,
      source,
      status: requestedStatus,
      adults,
      children,
      preferences
    } = req.body;

    console.log("📝 [Booking Attempt]", { roomId, guestId, checkIn, checkOut });

    // 1. Validate ID Formats
    if (!guestId || !mongoose.Types.ObjectId.isValid(guestId)) {
      return res.status(400).json({ error: "Invalid Guest ID. Must be a valid MongoDB ObjectId." });
    }
    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: "Invalid Room ID." });
    }

    const start = new Date(checkIn);
    const end = new Date(checkOut);

    // Validate Dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid dates provided.' });
    }
    if (start >= end) {
      return res.status(400).json({ error: 'Check-out must be after check-in' });
    }

    // 2. Availability Check
    const overlapping = await Booking.findOne({
      roomId,
      status: { $in: ['Confirmed', 'CheckedIn'] },
      $or: [{ checkIn: { $lt: end }, checkOut: { $gt: start } }],
    });

    if (overlapping) {
      return res.status(409).json({ error: 'Room is already booked for these dates' });
    }

    // 2.5. Validation: Reject bookings starting today if room needs cleaning
    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = new Date(start);
    startOfDay.setHours(0, 0, 0, 0);

    if ((room as any).status === 'Needs Cleaning' && startOfDay.getTime() === today.getTime()) {
      return res.status(400).json({
        error: 'Room needs cleaning. Bookings starting today are not allowed. Please select tomorrow or later.'
      });
    }

    const finalStatus = (requestedStatus === 'checked-in' || requestedStatus === 'CheckedIn') ? 'CheckedIn' : 'Confirmed';

    // --- Enhanced Pricing Logic: Pro-rated Deals + Multi-Month Rates ---
    const nights = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const monthlyRates = (room as any).monthlyRates || [];
    const baseRate = (room as any).rate || 0;

    let appliedRateSource: 'room' | 'deal' = 'room';
    let appliedDealId: any = undefined;
    let appliedDiscount = 0;
    let chosenDeal: any = null;

    // Find applicable deals
    const allowedDealStatuses = ['Ongoing', 'New', 'Inactive', 'Full'];
    const potentialDeals = await Deal.find({
      status: { $in: allowedDealStatuses },
      $or: [
        { roomIds: { $in: [roomId] } },
        { roomType: new RegExp(`^${(room as any).type}$`, 'i') }
      ]
    }).lean();

    console.log(`[BOOKING] Found ${potentialDeals.length} potential deals for room ${roomId}`);

    const isDealInWindow = (deal: any) => {
      const startDate = new Date(deal.startDate);
      const endDate = new Date(deal.endDate);
      return !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= end && endDate >= start;
    };

    const applicableDeals = potentialDeals.filter((deal) => {
      const typeMatch = Array.isArray(deal.roomType) && deal.roomType.some((t: string) => t.toLowerCase() === ((room as any).type || '').toLowerCase());
      const roomMatch = Array.isArray((deal as any).roomIds) && (deal as any).roomIds.some((id: any) => id.toString() === roomId.toString());
      const inWindow = isDealInWindow(deal);
      return inWindow && (roomMatch || typeMatch);
    });

    console.log(`[BOOKING] ${applicableDeals.length} applicable deals found`);

    // Select best deal (highest discount)
    if (applicableDeals.length > 0) {
      chosenDeal = applicableDeals.reduce((best, deal) => {
        if (!best || deal.discount > best.discount) return deal;
        return best;
      }, null as any);

      if (chosenDeal) {
        appliedRateSource = 'deal';
        appliedDealId = chosenDeal._id;
        appliedDiscount = chosenDeal.discount || 0;
        console.log(`[BOOKING] ✅ Selected deal "${chosenDeal.dealName}": ${appliedDiscount}% discount`);
      }
    }

    // Calculate detailed breakdown with pro-rated deals and multi-month rates
    const rateBreakdown = calculateBookingCharges(
      start,
      end,
      monthlyRates,
      baseRate,
      chosenDeal ? {
        dealId: chosenDeal._id.toString(),
        dealName: chosenDeal.dealName,
        discount: chosenDeal.discount || 0,
        startDate: new Date(chosenDeal.startDate),
        endDate: new Date(chosenDeal.endDate)
      } : undefined
    );

    console.log('[BOOKING] Rate breakdown:', {
      totalNights: rateBreakdown.totalNights,
      subtotal: rateBreakdown.subtotal,
      dealApplied: rateBreakdown.dealApplied,
      totalDealDiscount: rateBreakdown.totalDealDiscount,
      total: rateBreakdown.total
    });

    const roomTotal = rateBreakdown.total;
    const appliedRate = roomTotal / nights; // Average rate for display

    const pricingSnapshot = {
      baseRate: appliedRate,
      totalAmount: roomTotal,
      currency: 'USD'
    };

    // 3. Create Booking (store applied pricing + detailed breakdown)
    const newBooking = await Booking.create({
      roomId,
      guestId,
      checkIn: start,
      checkOut: end,
      status: finalStatus,
      source: source || 'Local',
      adults: adults || 1,
      children: children || 0,
      preferences: preferences || {},
      appliedRate,
      appliedRateSource,
      appliedDealId,
      appliedDiscount,
      roomNights: nights,
      roomTotal,
      pricingSnapshot,
      rateBreakdown // ✅ Save detailed breakdown
    }) as any;

    if (finalStatus === 'CheckedIn') {
      await Room.findByIdAndUpdate(roomId, { status: 'Occupied' });
    }

    console.log(`✅ [Booking Created] ID: ${newBooking._id}`);

    // --- 🔔 NOTIFICATION TRIGGER ---
    try {
      const guest = await User.findById(guestId);
      const room = await Room.findById(roomId).lean();
      const roomLabel = room?.roomNumber ? `Room ${room.roomNumber}` : 'your room';

      if (guest) {
        const dateRange = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
        const customerMessage = `Hi ${guest.name || 'guest'}, your booking is ${finalStatus === 'CheckedIn' ? 'checked in' : 'confirmed'}.\nRoom: ${roomLabel}.\nStay: ${dateRange}.`;
        const staffMessage = `New booking ${finalStatus === 'CheckedIn' ? 'checked in' : 'confirmed'} for ${guest.name || 'guest'}.\nRoom: ${roomLabel}.\nStay: ${dateRange}.`;

        console.log("🚀 [Notification] Starting sending process...");

        // Customer notification (email + SMS + dashboard)
        await sendNotification({
          type: 'BOOKING',
          title: finalStatus === 'CheckedIn' ? 'Check-in confirmed' : 'Booking confirmed',
          message: customerMessage,
          recipientEmail: guest.email,
          recipientPhone: guest.phone,
          targetRoles: ['customer'],
          targetUserId: (guest as any)._id.toString(),
          userId: (guest as any)._id.toString(),
          notifyAdmin: false,
          data: {
            bookingId: (newBooking as any)._id.toString(),
            roomId: roomId.toString(),
            guestName: guest.name,
            status: finalStatus
          }
        });

        // Staff notification (dashboard only)
        await sendNotification({
          type: 'BOOKING',
          title: `Booking ${finalStatus === 'CheckedIn' ? 'checked in' : 'confirmed'}`,
          message: staffMessage,
          targetRoles: ['admin', 'receptionist', 'manager'],
          data: {
            bookingId: (newBooking as any)._id.toString(),
            roomId: roomId.toString(),
            guestName: guest.name,
            status: finalStatus
          }
        });

        console.log("✅ [Notification] Process Completed");
      }
    } catch (notifErr: any) {
      console.error("❌ [Notification Failed]", notifErr.message);
    }

    res.status(201).json(newBooking);

  } catch (err: any) {
    console.error("❌ CRITICAL BOOKING ERROR:", err);
    res.status(500).json({ error: `Server Error: ${err.message}` });
  }
});

// --- PUT: Update Booking ---
bookingsRouter.put('/:id', requireRoles('admin', 'receptionist', 'manager'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Idempotent: if already checked out, return success
    if (booking.status === 'CheckedOut') {
      return res.json(booking);
    }

    // Prevent cancellation once checked-in
    if (booking.status === 'CheckedIn' && req.body.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot cancel booking once checked-in' });
    }

    // Cascade cancel trip requests when booking is cancelled
    if (req.body.status === 'Cancelled' && booking.status !== 'Cancelled') {
      const { TripRequest } = await import('../models/tripRequest.js');
      await TripRequest.updateMany(
        { bookingId: req.params.id, status: { $nin: ['Completed', 'Cancelled'] } },
        { status: 'Cancelled', responseNotes: 'Booking was cancelled' }
      );

      // Also cancel related invoices
      const invoices = await Invoice.updateMany(
        { bookingId: req.params.id, status: { $ne: 'paid' } },
        { status: 'cancelled' }
      );
    }

    // Allow checkout date editing but validate it's after check-in
    if (req.body.checkOut) {
      const newCheckOut = new Date(req.body.checkOut);
      const checkIn = req.body.checkIn ? new Date(req.body.checkIn) : booking.checkIn;
      if (newCheckOut <= checkIn) {
        return res.status(400).json({ error: 'Check-out must be after check-in' });
      }
    }

    // ✅ Rate Locking: Recalculate pricing with multi-month rates if dates changed
    if (req.body.checkIn || req.body.checkOut) {
      const newCheckIn = req.body.checkIn ? new Date(req.body.checkIn) : booking.checkIn;
      const newCheckOut = req.body.checkOut ? new Date(req.body.checkOut) : booking.checkOut;

      // Fetch current room and any applicable deals
      const room = await Room.findById(booking.roomId).lean();
      if (room) {
        const nights = Math.max(1, Math.ceil((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24)));
        const monthlyRates = (room as any).monthlyRates || [];
        const baseRate = (room as any).rate || 0;

        // Re-apply the original deal if it existed
        let appliedDeal: any = null;
        if ((booking as any).appliedDealId) {
          const deal = await Deal.findById((booking as any).appliedDealId).lean();
          if (deal) {
            const dealStart = new Date(deal.startDate);
            const dealEnd = new Date(deal.endDate);
            // Only apply deal if it still overlaps with new dates
            if (dealStart <= newCheckOut && dealEnd >= newCheckIn) {
              appliedDeal = {
                dealId: deal._id.toString(),
                dealName: deal.dealName,
                discount: deal.discount || 0,
                startDate: dealStart,
                endDate: dealEnd
              };
            }
          }
        }

        // Calculate detailed breakdown with new dates
        const rateBreakdown = calculateBookingCharges(
          newCheckIn,
          newCheckOut,
          monthlyRates,
          baseRate,
          appliedDeal
        );

        const roomTotal = rateBreakdown.total;
        const appliedRate = roomTotal / nights;

        // Update pricing fields
        req.body.pricingSnapshot = {
          baseRate: appliedRate,
          totalAmount: roomTotal,
          currency: 'USD'
        };
        req.body.appliedRate = appliedRate;
        req.body.roomNights = nights;
        req.body.roomTotal = roomTotal;
        req.body.rateBreakdown = rateBreakdown;
      }
    }

    const updated = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });

    // Auto-adjust invoice if checkout date changed
    if ((req.body.checkOut || req.body.checkIn) && updated) {
      try {
        const invoices = await Invoice.find({ bookingId: updated._id, status: { $ne: 'paid' } });

        for (const invoice of invoices) {
          // Rebuild invoice items with new breakdown
          const bookingPopulated = await Booking.findById(updated._id).populate('roomId');
          if (bookingPopulated) {
            const { buildAutoLineItems } = await import('../routes/invoices.js');
            const newRoomItems = await buildAutoLineItems(updated._id.toString());

            // Keep custom items, replace only room booking items
            const customItems = invoice.lineItems.filter((item: any) => item.source !== 'booking');
            const newLineItems = [...newRoomItems, ...customItems];

            // Recalculate totals
            const newSubtotal = newLineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

            invoice.lineItems = newLineItems as any;
            invoice.subtotal = newSubtotal;
            invoice.total = newSubtotal;

            await invoice.save();
          }
        }
      } catch (invoiceErr) {
        console.error('Failed to auto-adjust invoice:', invoiceErr);
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// --- DELETE: Remove Booking ---
bookingsRouter.delete('/:id', requireRoles('admin', 'receptionist', 'manager'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Prevent deletion if checked-in or checked-out
    if (booking.status === 'CheckedIn' || booking.status === 'CheckedOut') {
      return res.status(400).json({ error: 'Cannot delete booking once checked-in. Please cancel it first if needed.' });
    }

    // Delete all trip requests attached to this booking
    const { TripRequest } = await import('../models/tripRequest.js');
    await TripRequest.deleteMany({ bookingId: req.params.id });

    // Cancel all invoices attached to this booking
    const invoices = await Invoice.updateMany(
      { bookingId: req.params.id },
      { status: 'cancelled' }
    );

    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// --- POST: Check-In ---
bookingsRouter.post('/:id/checkin', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Validate check-in date is today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkInDate = new Date(booking.checkIn);
    checkInDate.setHours(0, 0, 0, 0);

    if (checkInDate.getTime() !== today.getTime()) {
      return res.status(400).json({
        error: 'Cannot check-in unless booking date is today. Please update the booking dates first.'
      });
    }

    booking.status = 'CheckedIn';
    await booking.save();

    await Room.findByIdAndUpdate(booking.roomId, { status: 'Occupied' });

    // ✅ SEND NOTIFICATION FOR CHECK-IN
    try {
      const guest = await User.findById(booking.guestId);
      const room = await Room.findById(booking.roomId).lean();
      const roomLabel = room?.roomNumber ? `Room ${room.roomNumber}` : 'your room';

      if (guest) {
        const customerMessage = `Your check-in to ${roomLabel} is now active. Welcome to Grand Hotel!`;
        const staffMessage = `Guest ${guest.name || 'customer'} checked into ${roomLabel}.`;

        // Customer notification (email + SMS + dashboard)
        await sendNotification({
          type: 'BOOKING',
          title: 'Check-in Successful',
          message: customerMessage,
          recipientEmail: guest.email,
          recipientPhone: guest.phone,
          targetRoles: ['customer'],
          targetUserId: (guest as any)._id.toString(),
          userId: (guest as any)._id.toString(),
          notifyAdmin: false,
          data: {
            bookingId: (booking as any)._id.toString(),
            roomId: booking.roomId.toString(),
            guestName: guest.name,
            status: 'CheckedIn'
          }
        });

        // Staff notification (dashboard only)
        await sendNotification({
          type: 'BOOKING',
          title: 'Guest Checked In',
          message: staffMessage,
          targetRoles: ['admin', 'receptionist', 'manager'],
          data: {
            bookingId: (booking as any)._id.toString(),
            roomId: booking.roomId.toString(),
            guestName: guest.name,
            status: 'CheckedIn'
          }
        });
      }
    } catch (notifErr: any) {
      console.error("❌ [Check-in Notification Failed]", notifErr.message);
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// --- POST: Check-Out ---
bookingsRouter.post('/:id/checkout', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  let hasResponded = false;

  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      hasResponded = true;
      return res.status(404).json({ error: 'Booking not found' });
    }

    // If already checked out, just return success (idempotent)
    if (booking.status === 'CheckedOut') {
      hasResponded = true;
      return res.status(200).json({ success: true, message: 'Booking already checked out', booking });
    }

    // Check if invoice exists AND is paid - REQUIRED for checkout
    const invoice = await Invoice.findOne({ bookingId: booking._id });
    if (!invoice) {
      hasResponded = true;
      return res.status(400).json({ error: 'Invoice is required before checkout.' });
    }
    if (invoice.status !== 'paid') {
      hasResponded = true;
      return res.status(400).json({ error: 'Booking cannot be checked out until invoice is paid.' });
    }

    booking.status = 'CheckedOut';
    await booking.save();
    try {
      await Room.findByIdAndUpdate(booking.roomId, { status: 'Cleaning' });
    } catch (roomErr: any) {
      console.error('⚠️ [Checkout] Room update failed:', roomErr.message);
    }

    // ✅ Close all orders related to this booking
    try {
      await Order.updateMany(
        { bookingId: booking._id, status: { $nin: ['Cancelled', 'Served'] } },
        { status: 'Served' }
      );
    } catch (orderErr: any) {
      console.error('⚠️ [Checkout] Order update failed:', orderErr.message);
    }

    // ✅ SEND NOTIFICATION FOR CHECK-OUT (async - don't await, don't let it block response)
    (async () => {
      try {
        const guest = await User.findById(booking.guestId);
        const room = await Room.findById(booking.roomId).lean();
        const roomLabel = room?.roomNumber ? `Room ${room.roomNumber}` : 'your room';

        if (guest) {
          const customerMessage = `Thank you for staying with us! ${roomLabel} has been checked out. We hope you enjoyed your stay at Grand Hotel.`;
          const staffMessage = `Guest ${guest.name || 'customer'} checked out from ${roomLabel}.`;

          // Customer notification (email + SMS + dashboard)
          await sendNotification({
            type: 'BOOKING',
            title: 'Check-out Complete',
            message: customerMessage,
            recipientEmail: guest.email,
            recipientPhone: guest.phone,
            targetRoles: ['customer'],
            targetUserId: (guest as any)._id.toString(),
            userId: (guest as any)._id.toString(),
            notifyAdmin: false,
            data: {
              bookingId: (booking as any)._id.toString(),
              roomId: booking.roomId.toString(),
              guestName: guest.name,
              status: 'CheckedOut'
            }
          });

          // Staff notification (dashboard only)
          await sendNotification({
            type: 'BOOKING',
            title: 'Guest Checked Out',
            message: staffMessage,
            targetRoles: ['admin', 'receptionist', 'manager'],
            data: {
              bookingId: (booking as any)._id.toString(),
              roomId: booking.roomId.toString(),
              guestName: guest.name,
              status: 'CheckedOut'
            }
          });
        }
      } catch (notifErr: any) {
        console.error("❌ [Check-out Notification Failed]", notifErr.message);
      }
    })();

    // Send success response immediately - checkout is complete
    if (!hasResponded) {
      hasResponded = true;
      res.status(200).json({ success: true, message: 'Guest checked out successfully', booking });
    }
  } catch (err: any) {
    console.error('❌ [Checkout Error]', err.message || err);
    console.error('❌ [Checkout Error Stack]', err.stack);
    if (!hasResponded) {
      hasResponded = true;
      res.status(500).json({ error: 'Failed to check out' });
    }
  }
});