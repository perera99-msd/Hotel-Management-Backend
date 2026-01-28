import { Request, Response, Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Feedback } from '../models/feedback.js';
import { Booking } from '../models/booking.js';

export const feedbackRouter = Router();

feedbackRouter.use(authenticate());

// --- GET: List all feedback (Admin/Receptionist for live bookings) ---
feedbackRouter.get('/', requireRoles('admin', 'receptionist', 'manager'), async (req: Request, res: Response) => {
  try {
    const feedback = await Feedback.find()
      .populate('bookingId', 'checkIn checkOut status roomId guestId')
      .populate('guestId', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    // Filter to only show feedback for completed bookings (CheckedOut status)
    const filteredFeedback = await Promise.all(
      feedback.map(async (f: any) => {
        const booking = await Booking.findById(f.bookingId).lean();
        if (booking && booking.status === 'CheckedOut') {
          return f;
        }
        return null;
      })
    );

    res.json(filteredFeedback.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// --- GET: Feedback for a specific booking ---
feedbackRouter.get('/booking/:bookingId', async (req: Request, res: Response) => {
  try {
    const feedback = await Feedback.findOne({ bookingId: req.params.bookingId })
      .populate('guestId', 'name email phone')
      .lean();

    if (!feedback) {
      return res.status(404).json({ error: 'No feedback found for this booking' });
    }

    res.json(feedback);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// --- POST: Create feedback (Customer - only for CheckedOut bookings) ---
feedbackRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { bookingId, rating, title, comment } = req.body;

    if (!bookingId || !rating || !title || !comment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Verify booking exists and is checked out
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'CheckedOut') {
      return res.status(400).json({ error: 'Can only give feedback for completed bookings' });
    }

    // Verify customer owns this booking
    if (booking.guestId.toString() !== user.mongoId.toString()) {
      return res.status(403).json({ error: 'You can only give feedback for your own bookings' });
    }

    // Check if feedback already exists
    const existingFeedback = await Feedback.findOne({ bookingId });
    if (existingFeedback) {
      return res.status(400).json({ error: 'Feedback already exists for this booking' });
    }

    // Create feedback
    const feedback = new Feedback({
      bookingId,
      guestId: user.mongoId,
      rating,
      title,
      comment,
      isEdited: false
    });

    await feedback.save();
    res.status(201).json(feedback);
  } catch (err) {
    console.error('Error creating feedback:', err);
    res.status(500).json({ error: 'Failed to create feedback' });
  }
});

// --- PUT: Update feedback (Customer - only 1 edit allowed) ---
feedbackRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { rating, title, comment } = req.body;

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    // Verify customer owns this feedback
    if (feedback.guestId.toString() !== user.mongoId.toString()) {
      return res.status(403).json({ error: 'You can only edit your own feedback' });
    }

    // Check if already edited
    if (feedback.isEdited) {
      return res.status(400).json({ error: 'Feedback can only be edited once' });
    }

    // Update feedback
    if (rating) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }
      feedback.rating = rating;
    }
    if (title) feedback.title = title;
    if (comment) feedback.comment = comment;

    feedback.isEdited = true;
    feedback.editedAt = new Date();

    await feedback.save();
    res.json(feedback);
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// --- DELETE: Remove feedback (Customer or Admin/Receptionist) ---
feedbackRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    // Only customer who wrote it or staff can delete
    const isOwner = feedback.guestId.toString() === user.mongoId.toString();
    const isStaff = user.roles.some((r: string) => ['admin', 'receptionist', 'manager'].includes(r));

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'You cannot delete this feedback' });
    }

    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: 'Feedback deleted' });
  } catch (err) {
    console.error('Error deleting feedback:', err);
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});
