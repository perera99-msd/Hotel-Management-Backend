/* */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Room } from '../models/room.js';
import { User } from '../models/user.js';
import { auth } from '../lib/firebaseAdmin.js'; 

export const bookingsRouter = Router();

bookingsRouter.use(authenticate());

// GET /api/bookings - List all bookings
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

// POST /api/bookings - Create Booking
bookingsRouter.post('/', requireRoles('admin', 'receptionist', 'customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let { roomId, checkIn, checkOut, guestId, guest, booking } = req.body;

    // --- Handle Front Desk "Complex" Payload ---
    if (booking && guest) {
        // 1. Resolve Dates
        checkIn = booking.checkIn;
        checkOut = booking.checkOut;

        // 2. Resolve Guest (Find or Create)
        let existingUser = await User.findOne({ email: guest.email });
        if (!existingUser) {
            try {
                const fbUser = await auth.createUser({
                    email: guest.email,
                    password: 'password123', 
                    displayName: `${guest.firstName} ${guest.lastName}`,
                    phoneNumber: guest.phone 
                }).catch(e => {
                    return auth.createUser({
                        email: guest.email,
                        password: 'password123',
                        displayName: `${guest.firstName} ${guest.lastName}`
                    });
                });

                existingUser = await User.create({
                    uid: fbUser.uid,
                    name: `${guest.firstName} ${guest.lastName}`,
                    email: guest.email,
                    phone: guest.phone,
                    roles: ['customer']
                });
            } catch (err) {
                console.error("Guest Creation Error:", err);
                return res.status(400).json({ error: 'Failed to create guest profile. Email might be taken.' });
            }
        }
        guestId = existingUser._id;

        // 3. Resolve Room (Find Available by Type)
        if (!roomId && booking.roomType) {
            const roomsOfType = await Room.find({ type: { $regex: new RegExp(booking.roomType, 'i') } });
            
            const start = new Date(checkIn);
            const end = new Date(checkOut);
            
            let availableRoom = null;
            
            for (const r of roomsOfType) {
                const conflict = await Booking.findOne({
                    roomId: r._id,
                    status: { $in: ['Confirmed', 'CheckedIn'] },
                    $or: [
                        { checkIn: { $lt: end }, checkOut: { $gt: start } }
                    ]
                });
                if (!conflict) {
                    availableRoom = r;
                    break;
                }
            }

            if (!availableRoom) {
                return res.status(409).json({ error: `No available ${booking.roomType} rooms for these dates` });
            }
            roomId = availableRoom._id;
        }
    }
    // -------------------------------------------

    const finalGuestId = guestId || user.mongoId;
    
    if (!finalGuestId) return res.status(400).json({ error: "Guest identity missing." });
    if (!roomId) return res.status(400).json({ error: "Room not selected or available." });

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid dates' });
    if (start >= end) return res.status(400).json({ error: 'Check-out must be after check-in' });

    const overlapping = await Booking.findOne({
      roomId,
      status: { $in: ['Confirmed', 'CheckedIn'] },
      $or: [
        { checkIn: { $lt: end }, checkOut: { $gt: start } },
      ],
    });

    if (overlapping) return res.status(409).json({ error: 'Room is already booked for these dates' });

    const newBooking = await Booking.create({
      roomId,
      guestId: finalGuestId,
      checkIn: start,
      checkOut: end,
      status: (booking && booking.status === 'checked-in') ? 'CheckedIn' : 'Confirmed',
      source: 'FrontDesk',
    });
    
    if (newBooking.status === 'CheckedIn') {
        await Room.findByIdAndUpdate(roomId, { status: 'Occupied' });
    }

    res.status(201).json(newBooking);
  } catch (err: any) {
    console.error("Create Booking Error:", err);
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
});

// PUT /api/bookings/:id
bookingsRouter.put('/:id', requireRoles('admin', 'receptionist', 'manager'), async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const booking = await Booking.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// DELETE /api/bookings/:id
bookingsRouter.delete('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// ✅ ADDED: POST /api/bookings/:id/checkin
bookingsRouter.post('/:id/checkin', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: 'CheckedIn' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    
    // Automatically update Room Status to 'Occupied'
    await Room.findByIdAndUpdate(booking.roomId, { status: 'Occupied' });
    
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// ✅ ADDED: POST /api/bookings/:id/checkout
bookingsRouter.post('/:id/checkout', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: 'CheckedOut' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Automatically update Room Status to 'Cleaning'
    await Room.findByIdAndUpdate(booking.roomId, { status: 'Cleaning' });

    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check out' });
  }
});