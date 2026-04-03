import nodemailer from 'nodemailer';

export const sendOTPEmail = async (email, otp) => {
  if (!process.env.EMAIL || !process.env.EMAIL_PASS) {
    console.warn('EMAIL credentials missing; OTP email is not sent');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL,
    to: email,
    subject: 'Verify your account',
    text: `Your OTP is ${otp}. It expires in 10 minutes.`,
  });
};
