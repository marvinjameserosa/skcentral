import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to, subject, html, gmailUser, gmailPassword } = body;

    // Validate required fields
    if (!from || !to || !subject || !html || !gmailUser || !gmailPassword) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          details: 'from, to, subject, html, gmailUser, and gmailPassword are required'
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(from) || !emailRegex.test(to)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    console.log('📧 Creating transporter with:', {
      user: gmailUser,
      passwordLength: gmailPassword.length
    });

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified');
    } catch (verifyError) {
      console.error('❌ SMTP verification failed:', verifyError);
      return NextResponse.json(
        { 
          error: 'SMTP connection failed',
          details: verifyError instanceof Error ? verifyError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

    // Mail options
    const mailOptions = {
      from: `"SK Central System" <${gmailUser}>`,
      to: to,
      subject: subject,
      html: html,
      replyTo: gmailUser,
    };

    console.log('📧 Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully:', info.messageId);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      message: `Email sent successfully to ${to}`,
      response: info.response
    });

  } catch (error) {
    console.error('❌ Email sending error:', error);
    
    let errorMessage = 'Failed to send email';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Provide specific error messages for common issues
      if (error.message.includes('Invalid login')) {
        errorDetails = 'Gmail authentication failed. Please check your app password.';
      } else if (error.message.includes('getaddrinfo ENOTFOUND')) {
        errorDetails = 'Network connection failed. Please check your internet connection.';
      } else if (error.message.includes('535')) {
        errorDetails = 'Authentication failed. Please ensure 2-step verification is enabled and you\'re using an app password.';
      } else if (error.message.includes('534')) {
        errorDetails = 'Gmail blocked the login attempt. Please enable "Less secure app access" or use an app password.';
      }
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails || 'Please check your Gmail configuration and app password.'
      },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to send emails.' },
    { status: 405 }
  );
}