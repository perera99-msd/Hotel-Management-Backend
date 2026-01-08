// src/routes/menu.ts
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { MenuItem, IMenuItem } from '../models/menuItem.js';

export const menuRouter = Router();
menuRouter.use(authenticate());

// GET /api/menu
menuRouter.get('/', async (_req: Request, res: Response) => {
  try {
    // Admin can see all, but for now we just return all
    const items = await MenuItem.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST /api/menu
menuRouter.post('/', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const payload = req.body as Partial<IMenuItem>;
    const created = await MenuItem.create(payload);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create menu item' });
  }
});

// PUT /api/menu/:id
menuRouter.put('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await MenuItem.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Menu item not found' });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update menu item' });
  }
});

// DELETE /api/menu/:id
menuRouter.delete('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await MenuItem.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete menu item' });
  }
});