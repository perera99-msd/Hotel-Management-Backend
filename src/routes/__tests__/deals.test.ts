/**
 * Unit tests for deals routes
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
import { dealsRouter } from '../../routes/deals';
import { Deal } from '../../models/deal';
import mongoose from 'mongoose';
import { mockFindQuery } from '../../__tests__/helpers/mongooseMock';

// Mock the Deal model
jest.mock('../../models/deal.js', () => ({
  Deal: {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

// Mock auth middleware
jest.mock('../../middleware/auth.js', () => ({
  authenticate: jest.fn(() => (req: any, res: any, next: any) => {
    req.user = {
      uid: 'test-uid',
      email: 'test@example.com',
      roles: ['admin'],
      mongoId: 'test-mongo-id',
    };
    next();
  }),
  requireRoles: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api/deals', dealsRouter);

describe('Deals Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/deals', () => {
    test('should return all deals sorted by createdAt', async () => {
      const mockDeals = [
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
          referenceNumber: 'DEAL-001',
          dealName: 'Summer Sale',
          roomType: ['Single', 'Double'],
          roomIds: [new mongoose.Types.ObjectId()],
          status: 'Active',
          price: 100,
          discount: 20,
          description: 'Summer discount',
          tags: ['summer'],
          startDate: new Date('2026-06-01'),
          endDate: new Date('2026-08-31'),
          image: 'image.jpg',
        },
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
          referenceNumber: 'DEAL-002',
          dealName: 'Winter Special',
          roomType: ['Suite'],
          roomIds: [],
          status: 'Active',
          price: 200,
          discount: 15,
          description: 'Winter discount',
          tags: ['winter'],
          startDate: new Date('2026-12-01'),
          endDate: new Date('2027-02-28'),
          image: 'winter.jpg',
        },
      ];

      // First find() call returns array (for filtering expired), second find().sort() also returns array
      (Deal.find as jest.Mock)
        .mockReturnValueOnce(mockFindQuery(mockDeals))
        .mockReturnValueOnce(mockFindQuery(mockDeals));
      (Deal.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 0 });

      const response = await request(app).get('/api/deals');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        referenceNumber: 'DEAL-001',
        dealName: 'Summer Sale',
        roomType: 'Single, Double',
      });
      expect(Deal.find).toHaveBeenCalled();
    });

    test('should auto-remove expired deals', async () => {
      const now = new Date();
      const expiredDeal = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
        referenceNumber: 'DEAL-003',
        dealName: 'Expired Deal',
        roomType: ['Single'],
        roomIds: [],
        status: 'Active',
        endDate: new Date(now.getTime() - 86400000), // Yesterday
      };

      const activeDeal = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439014'),
        referenceNumber: 'DEAL-004',
        dealName: 'Active Deal',
        roomType: ['Double'],
        roomIds: [],
        status: 'Active',
        endDate: new Date(now.getTime() + 86400000), // Tomorrow
      };

      // First find() returns all deals (for filtering), second find().sort() returns only active
      (Deal.find as jest.Mock)
        .mockReturnValueOnce(mockFindQuery([expiredDeal, activeDeal]))
        .mockReturnValueOnce(mockFindQuery([activeDeal]));

      (Deal.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 1 });

      const response = await request(app).get('/api/deals');

      expect(response.status).toBe(200);
      expect(Deal.deleteMany).toHaveBeenCalledWith({
        _id: { $in: [expiredDeal._id] },
      });
    });

    test('should handle errors gracefully', async () => {
      (Deal.find as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/deals');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch deals' });
    });
  });

  describe('POST /api/deals', () => {
    test('should create a new deal successfully', async () => {
      const newDealData = {
        referenceNumber: 'DEAL-NEW',
        dealName: 'New Year Special',
        roomType: ['Single', 'Double'],
        roomIds: ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
        discount: 25,
        startDate: '2027-01-01',
        endDate: '2027-01-15',
        description: 'New year discount',
      };

      const createdDeal = {
        _id: new mongoose.Types.ObjectId(),
        ...newDealData,
        roomIds: [
          new mongoose.Types.ObjectId('507f1f77bcf86cd799439015'),
          new mongoose.Types.ObjectId('507f1f77bcf86cd799439016'),
        ],
        status: 'New',
        price: 0,
      };

      (Deal.findOne as jest.Mock).mockResolvedValue(null); // Reference number doesn't exist
      (Deal.create as jest.Mock).mockResolvedValue(createdDeal);

      const response = await request(app).post('/api/deals').send(newDealData);

      expect(response.status).toBe(201);
      expect(Deal.create).toHaveBeenCalled();
      expect(Deal.findOne).toHaveBeenCalledWith({
        referenceNumber: 'DEAL-NEW',
      });
    });

    test('should return 400 when roomIds is missing', async () => {
      const invalidData = {
        referenceNumber: 'DEAL-INVALID',
        dealName: 'Invalid Deal',
        discount: 20,
      };

      const response = await request(app).post('/api/deals').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'At least one room must be selected for the deal',
      });
      expect(Deal.create).not.toHaveBeenCalled();
    });

    test('should return 400 when roomIds is empty array', async () => {
      const invalidData = {
        referenceNumber: 'DEAL-INVALID',
        dealName: 'Invalid Deal',
        roomIds: [],
        discount: 20,
      };

      const response = await request(app).post('/api/deals').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'At least one room must be selected for the deal',
      });
    });

    test('should return 400 when reference number already exists', async () => {
      const existingDeal = {
        _id: new mongoose.Types.ObjectId(),
        referenceNumber: 'DEAL-EXISTING',
      };

      (Deal.findOne as jest.Mock).mockResolvedValue(existingDeal);

      const newDealData = {
        referenceNumber: 'DEAL-EXISTING',
        dealName: 'Duplicate Deal',
        roomIds: ['507f1f77bcf86cd799439015'],
        discount: 20,
      };

      const response = await request(app).post('/api/deals').send(newDealData);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Reference number already exists',
      });
      expect(Deal.create).not.toHaveBeenCalled();
    });

    test('should return 400 when all roomIds are invalid', async () => {
      const invalidData = {
        referenceNumber: 'DEAL-INVALID',
        dealName: 'Invalid Room IDs',
        roomIds: ['invalid-id-1', 'invalid-id-2'],
        discount: 20,
      };

      (Deal.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app).post('/api/deals').send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid room IDs provided',
      });
    });

    test('should handle database errors', async () => {
      const newDealData = {
        referenceNumber: 'DEAL-ERROR',
        dealName: 'Error Deal',
        roomIds: ['507f1f77bcf86cd799439015'],
        discount: 20,
      };

      (Deal.findOne as jest.Mock).mockResolvedValue(null);
      (Deal.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).post('/api/deals').send(newDealData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /api/deals/:id', () => {
    test('should update a deal successfully', async () => {
      const dealId = '507f1f77bcf86cd799439017';
      const updateData = {
        dealName: 'Updated Deal Name',
        discount: 30,
      };

      const updatedDeal = {
        _id: new mongoose.Types.ObjectId(dealId),
        referenceNumber: 'DEAL-001',
        dealName: 'Updated Deal Name',
        roomType: ['Single', 'Double'],
        roomIds: [new mongoose.Types.ObjectId()],
        discount: 30,
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(dealId),
          dealName: 'Updated Deal Name',
          roomType: ['Single', 'Double'],
          roomIds: [new mongoose.Types.ObjectId()],
        }),
      };

      (Deal.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedDeal);

      const response = await request(app)
        .put(`/api/deals/${dealId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(Deal.findByIdAndUpdate).toHaveBeenCalledWith(
        dealId,
        expect.objectContaining({ dealName: 'Updated Deal Name', discount: 30 }),
        { new: true }
      );
    });

    test('should convert comma-separated roomType string to array', async () => {
      const dealId = '507f1f77bcf86cd799439018';
      const updateData = {
        roomType: 'Single, Double, Suite',
      };

      const updatedDeal = {
        _id: new mongoose.Types.ObjectId(dealId),
        roomType: ['Single', 'Double', 'Suite'],
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(dealId),
          roomType: ['Single', 'Double', 'Suite'],
        }),
      };

      (Deal.findByIdAndUpdate as jest.Mock).mockResolvedValue(updatedDeal);

      const response = await request(app)
        .put(`/api/deals/${dealId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(Deal.findByIdAndUpdate).toHaveBeenCalledWith(
        dealId,
        expect.objectContaining({
          roomType: ['Single', 'Double', 'Suite'],
        }),
        { new: true }
      );
    });

    test('should return 404 when deal not found', async () => {
      const dealId = '507f1f77bcf86cd799439019';

      (Deal.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/deals/${dealId}`)
        .send({ dealName: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Deal not found' });
    });

    test('should handle update errors', async () => {
      const dealId = '507f1f77bcf86cd79943901a';

      (Deal.findByIdAndUpdate as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .put(`/api/deals/${dealId}`)
        .send({ dealName: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update deal' });
    });
  });

  describe('DELETE /api/deals/:id', () => {
    test('should delete a deal successfully', async () => {
      const dealId = '507f1f77bcf86cd79943901b';

      (Deal.findByIdAndDelete as jest.Mock).mockResolvedValue({
        _id: new mongoose.Types.ObjectId(dealId),
        dealName: 'Deleted Deal',
      });

      const response = await request(app).delete(`/api/deals/${dealId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Deal deleted successfully' });
      expect(Deal.findByIdAndDelete).toHaveBeenCalledWith(dealId);
    });

    test('should return 404 when deal not found', async () => {
      const dealId = '507f1f77bcf86cd79943901c';

      (Deal.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const response = await request(app).delete(`/api/deals/${dealId}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Deal not found' });
    });

    test('should handle delete errors', async () => {
      const dealId = '507f1f77bcf86cd79943901d';

      (Deal.findByIdAndDelete as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).delete(`/api/deals/${dealId}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete deal' });
    });
  });
});
