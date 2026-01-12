/* */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Settings } from '../models/settings.js';

export const settingsRouter = Router();

settingsRouter.use(authenticate());

// GET /api/settings - Get settings (create default if missing)
settingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - Update settings
settingsRouter.put('/', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const settings = await Settings.findOneAndUpdate({}, req.body, { 
      new: true, 
      upsert: true,
      setDefaultsOnInsert: true 
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});