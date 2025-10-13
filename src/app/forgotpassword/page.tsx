'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../Firebase/firebase'; // Correct import path

export default function MarikinaForgotPassword() {
  const [kabataanID, setKabataanID] = useState(''); // Sangguniang Kabataan ID state
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!kabataanID) {
      setErrorMessage('Please enter your Sangguniang Kabataan ID.');
      return;
    }

    try {
      // Send password reset email
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage('Password reset email sent. Check your inbox!');
      setErrorMessage(''); // Reset error message on success
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrorMessage(error.message); // Show error if something goes wrong
      } else {
        setErrorMessage('An unexpected error occurred.');
      }
      setSuccessMessage(''); // Reset success message
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `url('/LoginBG.png')` }}
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white bg-opacity-95 rounded-none shadow-2xl p-8 w-full max-w-md border border-black border-[0.5px]">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image
            src="/SKLogo.png"
            alt="Federation Marikina Logo"
            width={100}
            height={100}
          />
        </div>

        {/* Title */}
        <h2 className="text-center text-2xl font-bold text-blue-900 opacity-90">FORGOT PASSWORD</h2>
        <p className="text-center text-blue-900 text-sm mb-6 opacity-75">
          Enter your Sangguniang Kabataan ID and email address to receive a password reset link
        </p>

        {/* Form */}
        <form onSubmit={handlePasswordReset} className="space-y-4">
          {/* Sangguniang Kabataan ID input */}
          <input
            type="text"
            placeholder="Enter your Sangguniang Kabataan ID"
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none"
            value={kabataanID}
            onChange={(e) => setKabataanID(e.target.value)} // Bind Kabataan ID state
            required
          />

          {/* Email input */}
          <input
            type="email"
            placeholder="Enter your email address"
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)} // Bind email state
            required
          />

          {errorMessage && <p className="text-red-600 text-center">{errorMessage}</p>} {/* Show error message */}
          {successMessage && <p className="text-green-600 text-center">{successMessage}</p>} {/* Show success message */}

          <button
            type="submit"
            className="w-full bg-blue-900 text-white py-2 rounded-md font-bold hover:bg-blue-800 transition"
          >
            SEND RESET LINK
          </button>
        </form>
        <Link href="/">
          <p className="text-center text-sm text-blue-900 mt-4 cursor-pointer hover:underline">
            Back to Login
          </p>
        </Link>
      </div>
    </div>
  );
}
