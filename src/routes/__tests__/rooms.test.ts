/**
 * Unit tests for rooms routes
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
import { roomsRouter } from '../../routes/rooms';
import { Room } from '../../models/room';
import { Booking } from '../../models/booking';
import { mockQuery, mockDoc } from '../../__tests__/helpers/mongooseMock';

jest.mock('../../models/room.js');
jest.mock('../../models/booking.js');

jest.mock('../../middleware/auth.js', () => ({
  authenticate: jest.fn(() => (req: any, res: any, next: any) => {
    req.user = { uid: 'test-uid', roles: ['admin'] };
    next();
  }),
  requireRoles: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

const app = express();
app.use(express.json());
app.use('/api/rooms', roomsRouter);

describe('Rooms Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/rooms', () => {
    test('should return all rooms', async () => {
      const mockRooms = [
        { _id: 'room1', roomNumber: '101', type: 'Single', status: 'Available', rate: 100 },
        { _id: 'room2', roomNumber: '102', type: 'Double', status: 'Occupied', rate: 150 },
      ];

      (Room.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockRooms),
      });
      (Booking.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const response = await request(app).get('/api/rooms');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should filter rooms by status', async () => {
      (Room.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Booking.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await request(app).get('/api/rooms?status=Available');

      expect(Room.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Available' })
      );
    });

    test('should filter rooms by type', async () => {
      (Room.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Booking.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await request(app).get('/api/rooms?type=Single');

      expect(Room.find).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Single' })
      );
    });

    test('should filter rooms by rate range', async () => {
      (Room.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      (Booking.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await request(app).get('/api/rooms?minRate=100&maxRate=200');

      expect(Room.find).toHaveBeenCalledWith(
        expect.objectContaining({
          rate: { $gte: 100, $lte: 200 },
        })
      );
    });
  });

  describe('POST /api/rooms', () => {
    test('should create a new room', async () => {
      const newRoomData = {
        _id: 'new-room',
        roomNumber: '201',
        type: 'Deluxe',
        status: 'Available',
        rate: 200,
      };

      (Room.findOne as jest.Mock).mockResolvedValue(null);
      (Room.create as jest.Mock).mockResolvedValue(mockDoc(newRoomData));

      const response = await request(app)
        .post('/api/rooms')
        .send({
          roomNumber: '201',
          type: 'Deluxe',
          rate: 200,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(newRoomData);
    });

    test('should return 400 when room number already exists', async () => {
      const duplicateError = new Error('E11000 duplicate key error');
      (duplicateError as any).code = 11000;
      (Room.create as jest.Mock).mockRejectedValue(duplicateError);

      const response = await request(app)
        .post('/api/rooms')
        .send({
          roomNumber: '201',
          type: 'Deluxe',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/rooms/:id', () => {
    test('should update a room', async () => {
      const updatedRoomData = {
        _id: 'room-id',
        roomNumber: '101',
        rate: 120,
      };

      (Room.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockDoc(updatedRoomData));

      const response = await request(app)
        .put('/api/rooms/room-id')
        .send({ rate: 120 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(updatedRoomData);
    });

    test('should return 404 when room not found', async () => {
      (Room.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/rooms/nonexistent')
        .send({ rate: 120 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/rooms/:id', () => {
    test('should delete a room', async () => {
      (Room.findByIdAndDelete as jest.Mock).mockResolvedValue({ _id: 'room-id' });

      const response = await request(app).delete('/api/rooms/room-id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Room deleted successfully' });
    });

    test('should return 404 when room not found', async () => {
      (Room.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const response = await request(app).delete('/api/rooms/nonexistent');

      expect(response.status).toBe(404);
    });
  });
});
