/**
 * Mock implementations for Firebase Admin SDK
 */

export const mockFirebaseAdmin = {
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'test-uid-123',
      email: 'test@example.com',
    }),
    createUser: jest.fn().mockResolvedValue({
      uid: 'new-user-uid',
      email: 'newuser@example.com',
    }),
    updateUser: jest.fn().mockResolvedValue({
      uid: 'test-uid-123',
      email: 'updated@example.com',
    }),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    getUser: jest.fn().mockResolvedValue({
      uid: 'test-uid-123',
      email: 'test@example.com',
    }),
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ test: 'data' }),
        }),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      })),
      add: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [],
        forEach: jest.fn(),
      }),
    })),
  })),
};

// Mock the entire firebase-admin module
jest.mock('../../lib/firebaseAdmin.js', () => ({
  default: mockFirebaseAdmin,
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ test: 'data' }),
        }),
      })),
      add: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
    })),
  },
}));
