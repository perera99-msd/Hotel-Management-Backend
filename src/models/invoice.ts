import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IInvoiceLineItem {
  description: string;
  qty: number;
  amount: number;
  category?: "room" | "meal" | "service" | "other" | "discount";
  source?: "booking" | "order" | "trip" | "custom" | "discount";
  refId?: Types.ObjectId;
}

export interface IInvoice extends Document {
  bookingId: Types.ObjectId;
  guestId?: Types.ObjectId;
  lineItems: IInvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "pending" | "paid" | "cancelled";
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceLineItemSchema = new Schema<IInvoiceLineItem>({
  description: { type: String, required: true },
  qty: { type: Number, required: true },
  amount: { type: Number, required: true }, // Total amount for this line
  category: { type: String, default: 'other' },
  source: { type: String, default: 'custom' },
  refId: { type: Schema.Types.ObjectId }
});

const InvoiceSchema = new Schema<IInvoice>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'User' }, 
    lineItems: { type: [InvoiceLineItemSchema], default: [] },
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: { 
      type: String, 
      enum: ['pending', 'paid', 'cancelled'], 
      default: 'pending',
      index: true 
    },
    paidAt: { type: Date }
  },
  { timestamps: true }
);

export const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', InvoiceSchema);