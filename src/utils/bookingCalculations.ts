/**
 * Booking Calculations Utility
 * Handles complex rate calculations including:
 * - Pro-rated deal application (only overlapping days)
 * - Multi-month rate calculation
 * - Detailed line item breakdown
 */

interface DealPeriod {
    dealId: string;
    dealName: string;
    discount: number;
    startDate: Date;
    endDate: Date;
}

interface MonthlyRateBreakdown {
    month: number; // 0-11
    monthName: string;
    year: number;
    days: number;
    rate: number;
    subtotal: number;
    dealDays?: number;
    dealName?: string;
    dealDiscount?: number;
    dealAmount?: number;
}

interface BookingCalculation {
    totalNights: number;
    monthlyBreakdowns: MonthlyRateBreakdown[];
    subtotal: number;
    totalDealDiscount: number;
    total: number;
    dealApplied: boolean;
    dealName?: string;
    lineItemDescriptions: string[];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Calculate booking charges with pro-rated deals and multi-month rates
 */
export function calculateBookingCharges(
    checkIn: Date,
    checkOut: Date,
    monthlyRates: number[],
    baseRate: number,
    deal?: DealPeriod
): BookingCalculation {

    const result: BookingCalculation = {
        totalNights: 0,
        monthlyBreakdowns: [],
        subtotal: 0,
        totalDealDiscount: 0,
        total: 0,
        dealApplied: false,
        lineItemDescriptions: []
    };

    // Calculate total nights
    const totalNights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    result.totalNights = totalNights;

    // Group days by month
    let currentDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    while (currentDate < endDate) {
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();
        const monthKey = `${year}-${month}`;

        // Find end of this month segment or end of booking
        const nextMonth = new Date(currentDate);
        nextMonth.setMonth(month + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);

        const segmentEnd = nextMonth < endDate ? nextMonth : endDate;
        const daysInSegment = Math.ceil((segmentEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

        // Get rate for this month
        const rate = monthlyRates[month] || baseRate;

        // Calculate deal overlap for this segment
        let dealDays = 0;
        let nonDealDays = daysInSegment;

        if (deal) {
            const dealStart = new Date(deal.startDate);
            const dealEnd = new Date(deal.endDate);

            // Find overlap between segment and deal period
            const overlapStart = currentDate > dealStart ? currentDate : dealStart;
            const overlapEnd = segmentEnd < dealEnd ? segmentEnd : dealEnd;

            if (overlapStart < overlapEnd) {
                dealDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
                nonDealDays = daysInSegment - dealDays;
            }
        }

        // Calculate charges
        const nonDealCharge = nonDealDays * rate;
        const dealCharge = deal && dealDays > 0
            ? dealDays * rate * (1 - deal.discount / 100)
            : 0;
        const dealDiscount = deal && dealDays > 0
            ? dealDays * rate * (deal.discount / 100)
            : 0;

        const segmentSubtotal = nonDealCharge + dealCharge;

        const breakdown: MonthlyRateBreakdown = {
            month,
            monthName: MONTH_NAMES[month],
            year,
            days: daysInSegment,
            rate,
            subtotal: segmentSubtotal
        };

        if (deal && dealDays > 0) {
            breakdown.dealDays = dealDays;
            breakdown.dealName = deal.dealName;
            breakdown.dealDiscount = deal.discount;
            breakdown.dealAmount = dealDiscount;
            result.dealApplied = true;
            result.dealName = deal.dealName;
            result.totalDealDiscount += dealDiscount;
        }

        result.monthlyBreakdowns.push(breakdown);
        result.subtotal += segmentSubtotal;

        currentDate = new Date(segmentEnd);
    }

    result.total = result.subtotal;

    // Generate line item descriptions
    result.lineItemDescriptions = generateLineItemDescriptions(result);

    return result;
}

/**
 * Generate human-readable line item descriptions
 */
function generateLineItemDescriptions(calc: BookingCalculation): string[] {
    const descriptions: string[] = [];

    for (const breakdown of calc.monthlyBreakdowns) {
        if (breakdown.dealDays && breakdown.dealDays > 0) {
            // Split into deal and non-deal days
            const nonDealDays = breakdown.days - breakdown.dealDays;

            if (nonDealDays > 0) {
                descriptions.push(
                    `${breakdown.monthName} ${breakdown.year}: ${nonDealDays} night${nonDealDays > 1 ? 's' : ''} @ $${breakdown.rate.toFixed(2)}/night = $${(nonDealDays * breakdown.rate).toFixed(2)}`
                );
            }

            const dealRate = breakdown.rate * (1 - (breakdown.dealDiscount || 0) / 100);
            descriptions.push(
                `${breakdown.monthName} ${breakdown.year}: ${breakdown.dealDays} night${breakdown.dealDays > 1 ? 's' : ''} @ $${dealRate.toFixed(2)}/night (${breakdown.dealName}, ${breakdown.dealDiscount}% off) = $${(breakdown.dealDays * dealRate).toFixed(2)}`
            );
        } else {
            // No deal applied
            descriptions.push(
                `${breakdown.monthName} ${breakdown.year}: ${breakdown.days} night${breakdown.days > 1 ? 's' : ''} @ $${breakdown.rate.toFixed(2)}/night = $${breakdown.subtotal.toFixed(2)}`
            );
        }
    }

    if (calc.dealApplied && calc.totalDealDiscount > 0) {
        descriptions.push(`Total ${calc.dealName} discount: -$${calc.totalDealDiscount.toFixed(2)}`);
    }

    return descriptions;
}

/**
 * Generate detailed summary for invoice/bill display
 */
export function generateBillSummary(calc: BookingCalculation): string {
    let summary = `Booking Summary (${calc.totalNights} night${calc.totalNights > 1 ? 's' : ''} total):\n\n`;

    for (const breakdown of calc.monthlyBreakdowns) {
        summary += `${breakdown.monthName} ${breakdown.year}:\n`;

        if (breakdown.dealDays && breakdown.dealDays > 0) {
            const nonDealDays = breakdown.days - breakdown.dealDays;

            if (nonDealDays > 0) {
                summary += `  • ${nonDealDays} night${nonDealDays > 1 ? 's' : ''} @ $${breakdown.rate.toFixed(2)}/night = $${(nonDealDays * breakdown.rate).toFixed(2)}\n`;
            }

            const dealRate = breakdown.rate * (1 - (breakdown.dealDiscount || 0) / 100);
            summary += `  • ${breakdown.dealDays} night${breakdown.dealDays > 1 ? 's' : ''} @ $${dealRate.toFixed(2)}/night (${breakdown.dealName}, ${breakdown.dealDiscount}% off) = $${(breakdown.dealDays * dealRate).toFixed(2)}\n`;

            if (breakdown.dealAmount) {
                summary += `    Discount: -$${breakdown.dealAmount.toFixed(2)}\n`;
            }
        } else {
            summary += `  • ${breakdown.days} night${breakdown.days > 1 ? 's' : ''} @ $${breakdown.rate.toFixed(2)}/night = $${breakdown.subtotal.toFixed(2)}\n`;
        }

        summary += `  Subtotal: $${breakdown.subtotal.toFixed(2)}\n\n`;
    }

    if (calc.dealApplied && calc.totalDealDiscount > 0) {
        summary += `Total Before Discount: $${(calc.subtotal + calc.totalDealDiscount).toFixed(2)}\n`;
        summary += `Total ${calc.dealName} Discount: -$${calc.totalDealDiscount.toFixed(2)}\n`;
    }

    summary += `\nTotal: $${calc.total.toFixed(2)}`;

    return summary;
}
