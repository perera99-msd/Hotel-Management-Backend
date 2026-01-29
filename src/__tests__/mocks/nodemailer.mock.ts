/**
 * Mock implementations for nodemailer
 */

export const mockTransporter = {
  sendMail: jest.fn().mockResolvedValue({
    messageId: 'mock-message-id',
    accepted: ['test@example.com'],
    rejected: [],
    response: '250 OK',
  }),
  verify: jest.fn().mockResolvedValue(true),
};

export const mockNodemailer = {
  createTransport: jest.fn(() => mockTransporter),
};

jest.mock('nodemailer', () => mockNodemailer);
