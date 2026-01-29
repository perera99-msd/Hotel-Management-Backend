/**
 * Mongoose Mock Helpers
 * 
 * Provides realistic Mongoose query chain and document mocks for testing.
 * Supports common patterns like find().sort().lean(), findOne().populate(), and doc.toObject()
 */

/**
 * Mock a Mongoose query chain (find, findOne, findById, etc.)
 * 
 * @param result - The final result to return (document, array, or null)
 * @returns Chainable query mock supporting .sort(), .limit(), .lean(), .populate(), .select(), .exec()
 * 
 * @example
 * ```ts
 * (User.find as jest.Mock).mockReturnValue(
 *   mockQuery([{ _id: '1', name: 'John' }])
 * );
 * ```
 */
export function mockQuery(result: any) {
  const query: any = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
    exec: jest.fn().mockResolvedValue(result),
    then: jest.fn((resolve) => Promise.resolve(result).then(resolve)),
  };

  // Make the query thenable so it works with await directly
  query.then = jest.fn((resolve) => Promise.resolve(result).then(resolve));

  return query;
}

/**
 * Mock a Mongoose document with typical document methods
 * 
 * @param data - The document data
 * @returns Document mock with .save(), .toObject(), .toJSON()
 * 
 * @example
 * ```ts
 * (Room.findById as jest.Mock).mockResolvedValue(
 *   mockDoc({ _id: '1', roomNumber: '101', floor: 1 })
 * );
 * ```
 */
export function mockDoc(data: any) {
  return {
    ...data,
    save: jest.fn().mockResolvedValue(data),
    toObject: jest.fn().mockReturnValue(data),
    toJSON: jest.fn().mockReturnValue(data),
  };
}

/**
 * Mock an array of Mongoose documents
 * 
 * @param dataArray - Array of document data
 * @returns Array of document mocks
 * 
 * @example
 * ```ts
 * (Deal.find as jest.Mock).mockResolvedValue(
 *   mockDocArray([
 *     { _id: '1', dealName: 'Summer Sale' },
 *     { _id: '2', dealName: 'Winter Special' }
 *   ])
 * );
 * ```
 */
export function mockDocArray(dataArray: any[]) {
  return dataArray.map(mockDoc);
}

/**
 * Mock Model.create() which returns a document or array of documents
 * 
 * @param data - Single document or array of documents
 * @returns Document mock or array of document mocks
 */
export function mockCreate(data: any) {
  return Array.isArray(data) ? mockDocArray(data) : mockDoc(data);
}

/**
 * Mock aggregation pipeline
 * 
 * @param result - The aggregation result
 * @returns Aggregation mock with .exec()
 */
export function mockAggregate(result: any[]) {
  return {
    exec: jest.fn().mockResolvedValue(result),
  };
}

/**
 * Mock a query that can be chained AND awaited directly
 * This handles both patterns:
 *   await Model.find().sort() // awaited directly
 *   await Model.find().sort().exec() // explicit exec()
 */
export function mockFindQuery(result: any) {
  const query: any = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
    exec: jest.fn().mockResolvedValue(result),
  };

  // Make it thenable for direct await
  query.then = jest.fn((resolve) => Promise.resolve(result).then(resolve));
  query.catch = jest.fn((reject) => Promise.resolve(result).catch(reject));

  return query;
}
