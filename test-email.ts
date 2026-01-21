import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function test() {
  console.log('Testing with User:', process.env.SMTP_USER);
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER, // Sender address
      to: process.env.SMTP_USER,   // Send to yourself
      subject: "Test Email",
      text: "If you see this, credentials work!",
    });
    console.log("✅ Success! Message ID:", info.messageId);
  } catch (error) {
    console.error("❌ Failed:", error);
  }
}

test();