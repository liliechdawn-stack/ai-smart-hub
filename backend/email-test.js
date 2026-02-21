const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('📧 Testing email configuration...');
console.log('Email User:', process.env.EMAIL_USER);
console.log('Email Pass length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 'Not set');

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function testEmail() {
  try {
    console.log('Attempting to send email...');
    
    const info = await transporter.sendMail({
      from: `"Test" <${process.env.EMAIL_USER}>`,
      to: 'ericchung992@gmail.com',
      subject: '🔔 Direct Test Email',
      text: 'This is a direct test from the email-test.js file',
      html: '<h2>Test Email</h2><p>If you see this, email is working!</p>'
    });
    
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    
  } catch (error) {
    console.error('❌ Failed to send email:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Command:', error.command);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔐 Authentication Error:');
      console.log('1. Make sure you have 2-Factor Authentication enabled on your Google account');
      console.log('2. Generate an App Password at: https://myaccount.google.com/apppasswords');
      console.log('3. Use that 16-character password in your .env file');
    }
  }
}

testEmail();