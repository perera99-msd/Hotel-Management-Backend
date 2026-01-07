import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITripPackage extends Document {
  name: string;
  description: string;
  price: number;
  duration: string; // Stores "1 day", "2 days" etc.
  maxParticipants: number;
  vehicle: string;
  location: string;
  status: string; // 'Active' | 'Inactive'
  itinerary: string[];
}

const TripPackageSchema = new Schema<ITripPackage>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: String, required: true },
    maxParticipants: { type: Number, required: true },
    vehicle: { type: String, required: true },
    location: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Active', 'Inactive'], 
        default: 'Active' 
    },
    itinerary: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const TripPackage: Model<ITripPackage> = mongoose.model<ITripPackage>('TripPackage', TripPackageSchema);