import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Handle newline characters in private key
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), 
    }),
  });
}

// Export Auth
export const auth = admin.auth();

// Export Firestore Database
// If your database name in console is "(default)", this works:
export const db = admin.firestore();

export default admin;