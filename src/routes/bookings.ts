import { Router, Request, Response } from 'express';
import mongoose from 'mongoose'; 
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Room } from '../models/room.js';
import { User } from '../models/user.js'; 
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
        
        if (guest) {
            const message = `Booking Confirmed.\nRoom ID: ${roomId}\nDate: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
            
            console.log("🚀 [Notification] Starting sending process...");

            await sendNotification({
                type: 'BOOKING',
                title: 'New Booking Received',
                message: message,
                recipientEmail: guest.email,
                recipientPhone: guest.phone, 
                data: {
                    bookingId: newBooking._id.toString(),
                    roomId: roomId.toString(),
                    guestName: guest.name
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
      const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      res.json(booking);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update booking' });
    }
});
  
// --- DELETE: Remove Booking ---
bookingsRouter.delete('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
    try {
      const booking = await Booking.findByIdAndDelete(req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      res.json({ message: 'Booking deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete booking' });
    }
});
  
// --- POST: Check-In ---
bookingsRouter.post('/:id/checkin', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
    try {
      const booking = await Booking.findByIdAndUpdate(req.params.id, { status: 'CheckedIn' }, { new: true });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      
      await Room.findByIdAndUpdate(booking.roomId, { status: 'Occupied' });
      res.json(booking);
    } catch (err) {
      res.status(500).json({ error: 'Failed to check in' });
    }
});
  
// --- POST: Check-Out ---
bookingsRouter.post('/:id/checkout', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
    try {
      const booking = await Booking.findByIdAndUpdate(req.params.id, { status: 'CheckedOut' }, { new: true });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      
      await Room.findByIdAndUpdate(booking.roomId, { status: 'Cleaning' });
      res.json(booking);
    } catch (err) {
      res.status(500).json({ error: 'Failed to check out' });
    }
});