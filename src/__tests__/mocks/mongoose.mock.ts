/**
 * Mock implementations for Mongoose models
 */

export const createMockModel = (modelName: string) => {
  const mockModel: any = jest.fn();

  // Static methods
  mockModel.find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  });

  mockModel.findOne = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });

  mockModel.findById = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  });

  mockModel.create = jest.fn().mockResolvedValue({
    _id: 'mock-id-123',
    toObject: jest.fn().mockReturnValue({}),
  });

  mockModel.updateOne = jest.fn().mockResolvedValue({
    acknowledged: true,
    modifiedCount: 1,
  });

  mockModel.updateMany = jest.fn().mockResolvedValue({
    acknowledged: true,
    modifiedCount: 1,
  });

  mockModel.deleteOne = jest.fn().mockResolvedValue({
    acknowledged: true,
    deletedCount: 1,
  });

  mockModel.deleteMany = jest.fn().mockResolvedValue({
    acknowledged: true,
    deletedCount: 1,
  });

  mockModel.countDocuments = jest.fn().mockResolvedValue(0);

  mockModel.aggregate = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([]),
  });

  return mockModel;
};

/**
 * Helper to create a mock document instance
 */
export const createMockDocument = (data: any = {}) => ({
  _id: 'mock-id-123',
  ...data,
  save: jest.fn().mockResolvedValue(this),
  remove: jest.fn().mockResolvedValue(this),
  toObject: jest.fn().mockReturnValue({ _id: 'mock-id-123', ...data }),
  toJSON: jest.fn().mockReturnValue({ _id: 'mock-id-123', ...data }),
});
