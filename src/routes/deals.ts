/* */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Deal } from '../models/deal.js';

export const dealsRouter = Router();

dealsRouter.use(authenticate());

const normalizeIds = (value: any) => {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr
    .filter(Boolean)
    .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
    .map((id: string) => new mongoose.Types.ObjectId(id));
};

// GET /api/deals
dealsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const deals = await Deal.find().sort({ createdAt: -1 });
    const formattedDeals = deals.map(d => ({
        id: d._id,
        referenceNumber: d.referenceNumber,
        dealName: d.dealName,

        endDate: d.endDate,
      roomType: d.roomType.join(', '),
      roomTypeRaw: d.roomType,
      roomIds: (d as any).roomIds?.map((r: any) => r.toString()) || [],
        status: d.status,
        price: d.price,
        description: d.description,
        tags: d.tags,
        startDate: d.startDate,
        discount: d.discount
    }));
    res.json(formattedDeals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// POST /api/deals
dealsRouter.post('/', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const { referenceNumber, roomIds } = req.body;
    
    // Validate required fields
    if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
      return res.status(400).json({ error: 'At least one room must be selected for the deal' });
    }
    
    const existing = await Deal.findOne({ referenceNumber });
    if (existing) return res.status(400).json({ error: 'Reference number already exists' });

    const normalizedRoomIds = normalizeIds(roomIds);
    if (normalizedRoomIds.length === 0) {
      return res.status(400).json({ error: 'Invalid room IDs provided' });
    }

    const roomType = Array.isArray(req.body.roomTypes) ? req.body.roomTypes : req.body.roomType;

    const newDeal = await Deal.create({
      ...req.body,
      roomType,
      roomIds: normalizedRoomIds,
      status: req.body.status || 'New',
      price: req.body.price || 0 // Price is optional, discount is primary
    });
    res.status(201).json(newDeal);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create deal' });
  }
});

// PUT /api/deals/:id
dealsRouter.put('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const updateData: any = { ...req.body };
    if (typeof updateData.roomType === 'string') {
        updateData.roomType = updateData.roomType.split(',').map((s: string) => s.trim());
    }
    if (updateData.roomIds) {
      updateData.roomIds = normalizeIds(updateData.roomIds);
    }
    const updatedDeal = await Deal.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedDeal) return res.status(404).json({ error: 'Deal not found' });
    res.json({ ...updatedDeal.toObject(), id: updatedDeal._id, roomType: updatedDeal.roomType.join(', '), roomIds: (updatedDeal as any).roomIds?.map((r: any) => r.toString()) || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/:id
dealsRouter.delete('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const deleted = await Deal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Deal not found' });
    res.json({ message: 'Deal deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});