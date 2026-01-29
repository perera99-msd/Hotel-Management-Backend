/**
 * Unit tests for auth middleware
 */

// Create mock functions that can be configured in tests
const mockVerifyIdToken = jest.fn();

// Mock Firebase Admin
jest.mock('../../lib/firebaseAdmin.js', () => ({
  default: {
    auth: jest.fn(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
  },
}));

import { authenticate, requireRoles } from '../../middleware/auth';
import { createMockRequest, createMockResponse, createMockNext, createMockAuthUser, createMockAdminUser } from '../../__tests__/helpers/mockRequest';
import admin from '../../lib/firebaseAdmin';
import { User } from '../../models/user';

// Mock User model
jest.mock('../../models/user.js', () => ({
  User: {
    findOne: jest.fn(),
  },
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    test('should authenticate valid token and attach user to request', async () => {
      const mockToken = 'valid-firebase-token';
      const mockDecodedToken = {
        uid: 'test-uid-123',
        email: 'test@example.com',
      };
      const mockDbUser = {
        _id: 'mongo-id-123',
        uid: 'test-uid-123',
        roles: ['customer'],
      };

      // Setup mocks
      mockVerifyIdToken.mockResolvedValue(mockDecodedToken);
      (User.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDbUser),
      });

      const req = createMockRequest({
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authenticate();
      await middleware(req, res as any, next);

      expect(admin.auth().verifyIdToken).toHaveBeenCalledWith(mockToken);
      expect(User.findOne).toHaveBeenCalledWith({ uid: mockDecodedToken.uid });
      expect(req.user).toEqual({
        uid: mockDecodedToken.uid,
        email: mockDecodedToken.email,
        roles: ['customer'],
        mongoId: mockDbUser._id.toString(),
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 401 when authorization header is missing', async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authenticate();
      await middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing bearer token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when authorization header does not start with Bearer', async () => {
      const req = createMockRequest({
        headers: {
          authorization: 'InvalidFormat token-value',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authenticate();
      await middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing bearer token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when token verification fails', async () => {
      const mockToken = 'invalid-token';

      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const req = createMockRequest({
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authenticate();
      await middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle new user registration (no DB user found)', async () => {
      const mockToken = 'valid-firebase-token';
      const mockDecodedToken = {
        uid: 'new-user-uid',
        email: 'newuser@example.com',
      };

      mockVerifyIdToken.mockResolvedValue(mockDecodedToken);
      (User.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null), // User not in DB yet
      });

      const req = createMockRequest({
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authenticate();
      await middleware(req, res as any, next);

      expect(req.user).toEqual({
        uid: mockDecodedToken.uid,
        email: mockDecodedToken.email,
        roles: ['customer'], // Default role for new users
        mongoId: undefined,
      });
      expect(next).toHaveBeenCalled();
    });

    test('should preserve admin roles from database', async () => {
      const mockToken = 'admin-token';
      const mockDecodedToken = {
        uid: 'admin-uid',
        email: 'admin@example.com',
      };
      const mockDbUser = {
        _id: 'admin-mongo-id',
        uid: 'admin-uid',
        roles: ['admin', 'manager'],
      };

      mockVerifyIdToken.mockResolvedValue(mockDecodedToken);
      (User.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDbUser),
      });

      const req = createMockRequest({
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authenticate();
      await middleware(req, res as any, next);

      expect(req.user?.roles).toEqual(['admin', 'manager']);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRoles', () => {
    test('should allow access when user has required role', () => {
      const req = createMockRequest({
        user: createMockAuthUser({ roles: ['customer'] }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles('customer');
      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should allow access when user has one of multiple allowed roles', () => {
      const req = createMockRequest({
        user: createMockAuthUser({ roles: ['manager'] }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles('admin', 'manager');
      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user does not have required role', () => {
      const req = createMockRequest({
        user: createMockAuthUser({ roles: ['customer'] }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles('admin');
      middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when user is not authenticated', () => {
      const req = createMockRequest({
        user: undefined,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles('customer');
      middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthenticated' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should allow access when no roles specified (open to all authenticated)', () => {
      const req = createMockRequest({
        user: createMockAuthUser(),
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles(); // No roles required
      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 for customer trying to access admin route', () => {
      const req = createMockRequest({
        user: createMockAuthUser({ roles: ['customer'] }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles('admin', 'manager');
      middleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle user with multiple roles correctly', () => {
      const req = createMockRequest({
        user: createMockAuthUser({ roles: ['customer', 'receptionist'] }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = requireRoles('receptionist');
      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
