/* */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Deal } from '../models/deal.js';

export const dealsRouter = Router();

dealsRouter.use(authenticate());

// GET /api/deals
dealsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const deals = await Deal.find().sort({ createdAt: -1 });
    const formattedDeals = deals.map(d => ({
        id: d._id,
        referenceNumber: d.referenceNumber,
        dealName: d.dealName,
        reservationsLeft: d.reservationsLeft,
        endDate: d.endDate,
        roomType: d.roomType.join(', '),
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
    const { referenceNumber } = req.body;
    const existing = await Deal.findOne({ referenceNumber });
    if (existing) return res.status(400).json({ error: 'Reference number already exists' });

    const newDeal = await Deal.create({
      ...req.body,
      roomType: req.body.roomTypes, // Map UI 'roomTypes' to DB 'roomType'
      status: req.body.status || 'New',
      reservationsLeft: req.body.reservationsLeft || 50
    });
    res.status(201).json(newDeal);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create deal' });
  }
});

// PUT /api/deals/:id
dealsRouter.put('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const updateData = req.body;
    if (typeof updateData.roomType === 'string') {
        updateData.roomType = updateData.roomType.split(',').map((s: string) => s.trim());
    }
    const updatedDeal = await Deal.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedDeal) return res.status(404).json({ error: 'Deal not found' });
    res.json({ ...updatedDeal.toObject(), id: updatedDeal._id, roomType: updatedDeal.roomType.join(', ') });
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