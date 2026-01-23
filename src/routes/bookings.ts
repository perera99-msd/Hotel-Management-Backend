import { Router, Request, Response } from 'express';
import mongoose from 'mongoose'; 
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Room } from '../models/room.js';
import { User } from '../models/user.js'; 
import { Invoice } from '../models/invoice.js';
import { sendNotification } from '../services/notificationService.js';

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
        .sort({ createdAt: -1 })
        .lean();
        
      res.json(bookings);
    } catch (err) {
      console.error("Error fetching bookings:", err);
      res.status(500).json({ error: 'Failed to fetch bookings' });
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

    const finalStatus = (requestedStatus === 'checked-in' || requestedStatus === 'CheckedIn') ? 'CheckedIn' : 'Confirmed';

    // 3. Create Booking
    const newBooking = await Booking.create({
      roomId,
      guestId,
      checkIn: start,
      checkOut: end,
      status: finalStatus,
      source: source || 'Local',
      // ✅ Save the new fields
      adults: adults || 1,
      children: children || 0,
      preferences: preferences || {}
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
      }
      
      // Allow checkout date editing but validate it's after check-in
      if (req.body.checkOut) {
        const newCheckOut = new Date(req.body.checkOut);
        const checkIn = req.body.checkIn ? new Date(req.body.checkIn) : booking.checkIn;
        if (newCheckOut <= checkIn) {
          return res.status(400).json({ error: 'Check-out must be after check-in' });
        }
      }
      
      const updated = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
      
      // Auto-adjust invoice if checkout date changed
      if ((req.body.checkOut || req.body.checkIn) && updated) {
        try {
          const invoices = await Invoice.find({ bookingId: updated._id, status: { $ne: 'paid' } });
          
          for (const invoice of invoices) {
            // Rebuild invoice items with new checkout date
            const bookingPopulated = await Booking.findById(updated._id).populate('roomId');
            if (bookingPopulated && (bookingPopulated as any).roomId?.rate) {
              const checkIn = new Date(bookingPopulated.checkIn);
              const checkOut = new Date(bookingPopulated.checkOut);
              const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
              const rate = (bookingPopulated as any).roomId.rate;
              
              // Update room line item only (preserve custom items)
              const roomItemIndex = invoice.lineItems.findIndex((item: any) => item.source === 'booking');
              if (roomItemIndex !== -1) {
                invoice.lineItems[roomItemIndex].description = `Room ${(bookingPopulated as any).roomId.roomNumber || ''} (${nights} night${nights > 1 ? 's' : ''})`;
                invoice.lineItems[roomItemIndex].amount = rate * nights;
              }
              
              // Recalculate totals (discount now included as line item)
              const nonDiscountItems = invoice.lineItems.filter((item: any) => item.source !== 'discount');
              const preDiscountSubtotal = nonDiscountItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
              const newSubtotal = invoice.lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
              
              invoice.subtotal = newSubtotal;
              invoice.tax = preDiscountSubtotal * 0.10;
              invoice.total = newSubtotal + invoice.tax;
              
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
bookingsRouter.delete('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
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
    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      // Require invoice to be paid before checkout
      const invoice = await Invoice.findOne({ bookingId: booking._id, status: 'paid' });
      if (!invoice) {
        return res.status(400).json({ error: 'Booking cannot be checked out until invoice is paid.' });
      }

      booking.status = 'CheckedOut';
      await booking.save();
      await Room.findByIdAndUpdate(booking.roomId, { status: 'Cleaning' });
      
      // ✅ SEND NOTIFICATION FOR CHECK-OUT
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
      
      res.json(booking);
    } catch (err) {
      res.status(500).json({ error: 'Failed to check out' });
    }
});