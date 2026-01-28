import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IFeedback extends Document {
  bookingId: Types.ObjectId;
  guestId: Types.ObjectId;
  rating: number; // 1-5 stars
  title: string;
  comment: string;
  isEdited: boolean;
  editedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    bookingId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Booking', 
      required: true, 
      index: true,
      unique: true // Only 1 feedback per booking
    },
    guestId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    rating: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 5 
    },
    title: { 
      type: String, 
      required: true,
      maxlength: 100
    },
    comment: { 
      type: String, 
      required: true,
      maxlength: 1000
    },
    isEdited: { 
      type: Boolean, 
      default: false 
    },
    editedAt: { 
      type: Date 
    }
  },
  { timestamps: true }
);

export const Feedback: Model<IFeedback> = mongoose.model<IFeedback>('Feedback', FeedbackSchema);
