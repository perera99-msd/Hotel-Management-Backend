/**
 * Mock implementations for axios
 */

export const mockAxios = {
  get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  delete: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  patch: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  request: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
};

jest.mock('axios', () => ({
  default: mockAxios,
  ...mockAxios,
}));
