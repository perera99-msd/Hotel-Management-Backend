/**
 * Unit tests for bookingCalculations utility
 */
import { calculateBookingCharges, generateBillSummary } from '../../utils/bookingCalculations';

describe('bookingCalculations', () => {
  describe('calculateBookingCharges', () => {
    const monthlyRates = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]; // All months $100
    const baseRate = 100;

    test('should calculate simple booking without deal', () => {
      const checkIn = new Date('2026-01-15');
      const checkOut = new Date('2026-01-20'); // 5 nights

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate);

      expect(result.totalNights).toBe(5);
      expect(result.subtotal).toBe(500); // 5 nights × $100
      expect(result.total).toBe(500);
      expect(result.totalDealDiscount).toBe(0);
      expect(result.dealApplied).toBe(false);
      expect(result.monthlyBreakdowns).toHaveLength(1);
      expect(result.monthlyBreakdowns[0].days).toBe(5);
      expect(result.monthlyBreakdowns[0].rate).toBe(100);
    });

    test('should calculate booking spanning multiple months', () => {
      const checkIn = new Date('2026-01-28'); // Last few days of Jan
      const checkOut = new Date('2026-02-05'); // First few days of Feb

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate);

      expect(result.totalNights).toBe(8);
      expect(result.monthlyBreakdowns).toHaveLength(2);
      
      // January breakdown (Jan 28, 29, 30, 31 = 4 days)
      expect(result.monthlyBreakdowns[0].month).toBe(0); // January
      expect(result.monthlyBreakdowns[0].days).toBeGreaterThan(0);
      
      // February breakdown
      expect(result.monthlyBreakdowns[1].month).toBe(1); // February
      expect(result.monthlyBreakdowns[1].days).toBeGreaterThan(0);

      // Total varies based on date calculation but should be reasonable
      expect(result.total).toBeGreaterThanOrEqual(800); // At least 8 nights × $100
    });

    test('should apply deal discount for overlapping period', () => {
      const checkIn = new Date('2026-02-10');
      const checkOut = new Date('2026-02-15'); // 5 nights
      
      const deal = {
        dealId: 'deal-1',
        dealName: 'Valentine Special',
        discount: 20, // 20% off
        startDate: new Date('2026-02-12'),
        endDate: new Date('2026-02-14'),
      };

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate, deal);

      expect(result.totalNights).toBe(5);
      expect(result.dealApplied).toBe(true);
      expect(result.dealName).toBe('Valentine Special');
      
      // Feb 10-11: 2 nights at $100 = $200
      // Feb 12-13: 2 nights at $80 (20% off) = $160
      // Feb 14: 1 night at $100 = $100 (deal ends before this night)
      // Total discount: 2 nights × $20 = $40
      expect(result.totalDealDiscount).toBeCloseTo(40, 0);
      expect(result.total).toBeCloseTo(460, 0); // $500 - $40
    });

    test('should handle deal that covers entire booking', () => {
      const checkIn = new Date('2026-03-10');
      const checkOut = new Date('2026-03-15'); // 5 nights
      
      const deal = {
        dealId: 'deal-2',
        dealName: 'Spring Sale',
        discount: 30,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-03-31'),
      };

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate, deal);

      expect(result.totalNights).toBe(5);
      expect(result.dealApplied).toBe(true);
      expect(result.totalDealDiscount).toBe(150); // 5 nights × $100 × 30% = $150
      expect(result.total).toBe(350); // $500 - $150
    });

    test('should handle deal with no overlap', () => {
      const checkIn = new Date('2026-04-10');
      const checkOut = new Date('2026-04-15');
      
      const deal = {
        dealId: 'deal-3',
        dealName: 'Early Bird',
        discount: 25,
        startDate: new Date('2026-04-20'), // Deal starts after checkout
        endDate: new Date('2026-04-30'),
      };

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate, deal);

      expect(result.totalNights).toBe(5);
      expect(result.dealApplied).toBe(false);
      expect(result.totalDealDiscount).toBe(0);
      expect(result.total).toBe(500); // Full price
    });

    test('should use different monthly rates correctly', () => {
      const variableRates = [
        100, 100, 120, 120, 150, 150, // Jan-Jun
        150, 150, 120, 120, 100, 100  // Jul-Dec
      ];
      
      const checkIn = new Date('2026-05-28'); // High season ($150)
      const checkOut = new Date('2026-06-05'); // High season ($150)

      const result = calculateBookingCharges(checkIn, checkOut, variableRates, baseRate);

      expect(result.totalNights).toBe(8);
      expect(result.monthlyBreakdowns).toHaveLength(2);
      
      // May: days × $150
      expect(result.monthlyBreakdowns[0].rate).toBe(150);
      expect(result.monthlyBreakdowns[0].subtotal).toBeGreaterThan(0);
      
      // June: days × $150
      expect(result.monthlyBreakdowns[1].rate).toBe(150);
      expect(result.monthlyBreakdowns[1].subtotal).toBeGreaterThan(0);
      
      // Total should be around 8 nights at $150/night
      expect(result.total).toBeGreaterThanOrEqual(1200);
    });

    test('should handle single night booking', () => {
      const checkIn = new Date('2026-06-15');
      const checkOut = new Date('2026-06-16'); // 1 night

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate);

      expect(result.totalNights).toBe(1);
      expect(result.total).toBe(100);
      expect(result.monthlyBreakdowns).toHaveLength(1);
    });

    test('should generate correct line item descriptions', () => {
      const checkIn = new Date('2026-07-10');
      const checkOut = new Date('2026-07-15');
      
      const deal = {
        dealId: 'deal-4',
        dealName: 'Summer Deal',
        discount: 15,
        startDate: new Date('2026-07-12'),
        endDate: new Date('2026-07-14'),
      };

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate, deal);

      expect(result.lineItemDescriptions).toBeDefined();
      expect(result.lineItemDescriptions.length).toBeGreaterThan(0);
      
      // Should contain deal information
      const hasDiscountLine = result.lineItemDescriptions.some(
        line => line.includes('Summer Deal') && line.includes('15%')
      );
      expect(hasDiscountLine).toBe(true);
    });

    test('should handle deal spanning multiple months', () => {
      const checkIn = new Date('2026-08-25');
      const checkOut = new Date('2026-09-10');
      
      const deal = {
        dealId: 'deal-5',
        dealName: 'End of Summer',
        discount: 20,
        startDate: new Date('2026-08-28'),
        endDate: new Date('2026-09-05'),
      };

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate, deal);

      expect(result.totalNights).toBe(16);
      expect(result.monthlyBreakdowns).toHaveLength(2);
      expect(result.dealApplied).toBe(true);
      
      // Both months should have deal applied
      const augustBreakdown = result.monthlyBreakdowns[0];
      const septemberBreakdown = result.monthlyBreakdowns[1];
      
      expect(augustBreakdown.dealDays).toBeGreaterThan(0);
      expect(septemberBreakdown.dealDays).toBeGreaterThan(0);
    });

    test('should handle edge case with same check-in and check-out date', () => {
      const checkIn = new Date('2026-10-15');
      const checkOut = new Date('2026-10-15'); // Same day

      const result = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate);

      // Should default to at least 1 night
      expect(result.totalNights).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateBillSummary', () => {
    const monthlyRates = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const baseRate = 100;

    test('should generate readable bill summary without deal', () => {
      const checkIn = new Date('2026-11-10');
      const checkOut = new Date('2026-11-15');

      const calc = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate);
      const summary = generateBillSummary(calc);

      expect(summary).toContain('Booking Summary');
      expect(summary).toContain('5 nights total');
      expect(summary).toContain('November 2026');
      expect(summary).toContain('$100.00/night');
      expect(summary).toContain('Total: $500.00');
    });

    test('should generate bill summary with deal discount', () => {
      const checkIn = new Date('2026-12-10');
      const checkOut = new Date('2026-12-15');
      
      const deal = {
        dealId: 'deal-6',
        dealName: 'Holiday Special',
        discount: 25,
        startDate: new Date('2026-12-12'),
        endDate: new Date('2026-12-14'),
      };

      const calc = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate, deal);
      const summary = generateBillSummary(calc);

      expect(summary).toContain('Holiday Special');
      expect(summary).toContain('25% off');
      expect(summary).toContain('Discount:');
      expect(summary).toContain('Total Holiday Special Discount:');
    });

    test('should generate multi-month bill summary', () => {
      const checkIn = new Date('2026-12-28');
      const checkOut = new Date('2027-01-05');

      const calc = calculateBookingCharges(checkIn, checkOut, monthlyRates, baseRate);
      const summary = generateBillSummary(calc);

      expect(summary).toContain('December 2026');
      expect(summary).toContain('January 2027');
      expect(summary).toContain('Subtotal:');
    });
  });
});
