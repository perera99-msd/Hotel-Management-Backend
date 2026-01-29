/**
 * Unit tests for menu routes
 */

// Mock Firebase Admin - Jest will use the manual mock
jest.mock('../../lib/firebaseAdmin.js');

// Mock authenticate middleware
jest.mock('../../middleware/auth.js', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { _id: 'test-user-id', role: 'admin' };
    next();
  },
  requireRoles: () => (req: any, res: any, next: any) => next(),
}));

import request from 'supertest';
import express from 'express';
import { menuRouter } from '../../routes/menu';
import { MenuItem } from '../../models/menuItem';

jest.mock('../../models/menuItem.js');

jest.mock('../../middleware/auth.js', () => ({
  authenticate: jest.fn(() => (req: any, res: any, next: any) => {
    req.user = { uid: 'test-uid', roles: ['admin'] };
    next();
  }),
  requireRoles: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

const app = express();
app.use(express.json());
app.use('/api/menu', menuRouter);

describe('Menu Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/menu', () => {
    test('should return all menu items', async () => {
      const mockItems = [
        { _id: 'item1', name: 'Burger', price: 10, category: 'Main' },
        { _id: 'item2', name: 'Fries', price: 5, category: 'Side' },
      ];

      (MenuItem.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockItems),
      });

      const response = await request(app).get('/api/menu');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockItems);
      expect(MenuItem.find).toHaveBeenCalled();
    });

    test('should handle fetch errors', async () => {
      (MenuItem.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const response = await request(app).get('/api/menu');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch menu' });
    });
  });

  describe('POST /api/menu', () => {
    test('should create a new menu item', async () => {
      const newItem = {
        _id: 'new-item',
        name: 'Pizza',
        price: 15,
        category: 'Main',
      };

      (MenuItem.create as jest.Mock).mockResolvedValue(newItem);

      const response = await request(app)
        .post('/api/menu')
        .send({
          name: 'Pizza',
          price: 15,
          category: 'Main',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(newItem);
    });

    test('should return 400 on validation error', async () => {
      (MenuItem.create as jest.Mock).mockRejectedValue(new Error('Validation failed'));

      const response = await request(app)
        .post('/api/menu')
        .send({ name: 'Invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /api/menu/:id', () => {
    test('should update a menu item', async () => {
      const updatedItem = {
        _id: 'item-id',
        name: 'Updated Pizza',
        price: 18,
      };

      (MenuItem.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedItem);

      const response = await request(app)
        .put('/api/menu/item-id')
        .send({ price: 18 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(updatedItem);
    });

    test('should return 404 when menu item not found', async () => {
      (MenuItem.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/menu/nonexistent')
        .send({ price: 20 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Menu item not found' });
    });
  });

  describe('DELETE /api/menu/:id', () => {
    test('should delete a menu item', async () => {
      (MenuItem.findByIdAndDelete as jest.Mock).mockResolvedValue({ _id: 'item-id' });

      const response = await request(app).delete('/api/menu/item-id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Menu item deleted successfully' });
    });

    test('should return 404 when menu item not found', async () => {
      (MenuItem.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const response = await request(app).delete('/api/menu/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Menu item not found' });
    });
  });
});
