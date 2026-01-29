/**
 * Test utilities for mocking Express request/response objects
 */
import { Request, Response, NextFunction } from 'express';

export interface MockRequest extends Partial<Request> {
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  user?: any;
}

export interface MockResponse extends Partial<Response> {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  sendStatus: jest.Mock;
}

export function createMockRequest(options: MockRequest = {}): Request {
  return {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    user: options.user,
    get: jest.fn((header: string) => options.headers?.[header]),
    ...options,
  } as Request;
}

export function createMockResponse(): MockResponse {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.sendStatus = jest.fn().mockReturnValue(res);
  res.links = jest.fn().mockReturnValue(res);
  res.location = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  return res as MockResponse;
}

export function createMockNext(): NextFunction {
  return jest.fn() as NextFunction;
}

/**
 * Helper to create a mock authenticated user
 */
export function createMockAuthUser(overrides: any = {}) {
  return {
    uid: 'test-uid-123',
    email: 'test@example.com',
    roles: ['customer'],
    mongoId: '507f1f77bcf86cd799439011',
    ...overrides,
  };
}

/**
 * Helper to create a mock admin user
 */
export function createMockAdminUser(overrides: any = {}) {
  return createMockAuthUser({
    roles: ['admin'],
    email: 'admin@example.com',
    uid: 'admin-uid-123',
    ...overrides,
  });
}
