import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, company, useCase } = body;

    if (!name || !email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid input. Name and valid email are required.' },
        { status: 400 }
      );
    }

    console.log('Waitlist submission:', { name, email, company, useCase });

    return NextResponse.json(
      { 
        success: true,
        message: 'You\'ve been added to the waitlist!',
        estimatedWait: '2-4 weeks'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json(
      { error: 'Internal server error. Please try again later.' },
      { status: 500 }
    );
  }
}