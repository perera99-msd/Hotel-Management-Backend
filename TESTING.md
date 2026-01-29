# Backend Unit Testing Setup

This document describes the comprehensive unit test suite implemented for the Hotel Management Backend.

## Test Framework

- **Jest** with **ts-jest** for TypeScript support
- **Supertest** for HTTP endpoint testing
- **ESM module** support configured

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- src/utils/__tests__/bookingCalculations.test.ts
```

## Test Structure

Tests are organized using the `__tests__` folder pattern:

```
src/
├── utils/
│   ├── bookingCalculations.ts
│   └── __tests__/
│       └── bookingCalculations.test.ts
├── services/
│   ├── notificationService.ts
│   └── __tests__/
│       └── notificationService.test.ts
├── middleware/
│   ├── auth.ts
│   └── __tests__/
│       └── auth.test.ts
├── routes/
│   ├── deals.ts
│   └── __tests__/
│       └── deals.test.ts
└── __tests__/
    ├── setup.ts                    # Global test setup
    ├── helpers/
    │   └── mockRequest.ts          # Test utilities
    └── mocks/
        ├── axios.mock.ts           # Mock HTTP client
        ├── firebase.mock.ts        # Mock Firebase SDK
        ├── mongoose.mock.ts        # Mock Mongoose models
        └── nodemailer.mock.ts      # Mock email service
```

## Test Coverage

### ✅ Utilities (`src/utils/`)
- **bookingCalculations.ts** - Comprehensive coverage of:
  - Simple booking calculations
  - Multi-month bookings
  - Deal discount application (pro-rated)
  - Edge cases (same-day bookings, etc.)
  - Bill summary generation

### ✅ Middleware (`src/middleware/`)
- **auth.ts** - Complete coverage of:
  - JWT token verification
  - User authentication
  - Role-based access control
  - Error handling for invalid/expired tokens
  - New user registration flow

### ✅ Services (`src/services/`)
- **notificationService.ts** - Extensive coverage of:
  - Email notifications (Brevo/SMTP)
  - SMS notifications (Text.lk)
  - Firestore persistence
  - Admin notifications
  - Phone number formatting
  - Data sanitization
  - Error resilience (Promise.allSettled)

### ✅ Routes (`src/routes/`)
- **deals.ts** - Full endpoint coverage:
  - GET /api/deals (list, auto-expiry)
  - POST /api/deals (creation, validation)
  - PUT /api/deals/:id (updates)
  - DELETE /api/deals/:id (deletion)
  - Error handling and edge cases

## Mocking Strategy

All external dependencies are mocked to ensure tests are:
- **Fast** - No real network/database calls
- **Isolated** - Each test is independent
- **Deterministic** - No flaky tests

### Mocked Dependencies

1. **Firebase Admin SDK** - Authentication and Firestore
2. **Mongoose Models** - Database operations
3. **Nodemailer** - Email sending
4. **Axios** - HTTP requests (SMS API)
5. **Logger** - Pino logger

## Test Utilities

### Mock Request/Response Helpers

```typescript
import { createMockRequest, createMockResponse, createMockNext } from '../__tests__/helpers/mockRequest';

const req = createMockRequest({
  body: { name: 'Test' },
  user: createMockAuthUser(),
});
const res = createMockResponse();
const next = createMockNext();
```

### Mock User Helpers

```typescript
// Regular authenticated user
const user = createMockAuthUser();

// Admin user
const admin = createMockAdminUser();

// Custom user
const custom = createMockAuthUser({
  roles: ['manager', 'receptionist'],
  email: 'custom@example.com',
});
```

## Configuration Files

- **jest.config.ts** - Jest configuration for ESM + TypeScript
- **src/__tests__/setup.ts** - Global test setup, environment variables
- **src/lib/__mocks__/firebaseAdmin.ts** - Manual mock for Firebase Admin

## What's NOT Tested (Intentionally)

1. **Integration Tests** - These are unit tests only
2. **Database Integration** - All DB calls are mocked
3. **Real API Endpoints** - No actual HTTP server started
4. **E2E User Flows** - Outside scope of unit tests
5. **src/index.ts** - Server startup file (excluded from coverage)

## Coverage Goals

Current coverage focuses on:
- Core business logic (✅ High Priority)
- Authentication & authorization (✅ High Priority)
- API endpoints (✅ High Priority)
- Utility functions (✅ High Priority)

## Known Issues

1. **Firebase Admin Initialization** - Some tests need manual mocks due to ESM + Firebase incompatibility
2. **Date Calculations** - Edge cases in date ranges may vary by 1 day depending on calculation method

## Adding New Tests

### 1. Create test file

```typescript
// src/routes/__tests__/myroute.test.ts
import request from 'supertest';
import express from 'express';
import { myRouter } from '../myroute';

// Mock dependencies
jest.mock('../../models/mymodel.js');

const app = express();
app.use(express.json());
app.use('/api/myroute', myRouter);

describe('My Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should handle GET request', async () => {
    const response = await request(app).get('/api/myroute');
    expect(response.status).toBe(200);
  });
});
```

### 2. Run your test

```bash
npm test -- src/routes/__tests__/myroute.test.ts
```

### 3. Check coverage

```bash
npm run test:coverage
```

## Best Practices

1. **Clear test names** - Describe what is being tested
2. **Arrange-Act-Assert** - Structure tests clearly
3. **Mock everything external** - No real I/O in unit tests
4. **One assertion per logical concept** - But multiple expects are OK
5. **Test edge cases** - Empty arrays, null values, errors, etc.
6. **Clean up** - Use `beforeEach` to reset mocks

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 10 seconds for full suite)
- No external dependencies
- Deterministic results
- Clear error messages

## Future Enhancements

Potential areas for expansion:
- [ ] Add tests for remaining routes (rooms, bookings, menu, etc.)
- [ ] Add tests for remaining services
- [ ] Add integration tests (separate test suite)
- [ ] Add E2E tests with Playwright/Cypress
- [ ] Increase coverage to 80%+ for all modules

## Troubleshooting

### Tests failing with "Cannot find module"
- Check file extensions (.js) in imports
- Verify jest.config.ts moduleNameMapper settings

### Firebase initialization errors
- Ensure manual mock is in place: `src/lib/__mocks__/firebaseAdmin.ts`
- Check environment variables in setup.ts

### TypeScript errors in tests
- Verify @types packages are installed
- Check tsconfig.json includes test files

## Support

For questions or issues with the test suite:
1. Check this README first
2. Review existing test files for patterns
3. Check Jest documentation: https://jestjs.io/
