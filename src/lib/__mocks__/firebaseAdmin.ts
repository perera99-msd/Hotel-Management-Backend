/**
 * Mock for Firebase Admin SDK
 * This completely mocks the firebaseAdmin module to avoid initialization errors
 */

export const mockAuth = {
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
};

export const mockFirestore = {
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
};

const mockAdmin = {
  auth: jest.fn(() => mockAuth),
  firestore: jest.fn(() => mockFirestore),
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
};

// Export the actual instances that the code expects
export const auth = mockAuth;
export const db = mockFirestore;

export default mockAdmin;
