/* */
import { Express, Request, Response } from 'express';
import { roomsRouter } from './rooms.js';
import { bookingsRouter } from './bookings.js';
import { menuRouter } from './menu.js';
import { ordersRouter } from './orders.js';
import { inventoryRouter } from './inventory.js';
import { tripsRouter } from './trips.js';
import { invoicesRouter } from './invoices.js';
import { reportsRouter } from './reports.js';
import { userRouter } from './user.js';
import { settingsRouter } from './settings.js';
import { dealsRouter } from './deals.js';
import { feedbackRouter } from './feedback.js';

export function registerRoutes(app: Express): void {
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // API Routes
  app.use('/api/users', userRouter); 
  app.use('/api/rooms', roomsRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/deals', dealsRouter);
}