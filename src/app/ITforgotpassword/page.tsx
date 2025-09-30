/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-html-link-for-pages */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../Firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function MarikinaForgotPassword() {
  const [kabataanID, setKabataanID] = useState('');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure both fields are filled
    if (!kabataanID || !email) {
      setErrorMessage('Please enter both SK ID and Email.');
      setSuccessMessage('');
      return; // Stop execution
    }

    try {
      // Query Firestore for exact SK ID + Email pair
      const usersRef = collection(db, 'ITuser');
      const q = query(
        usersRef,
        where('kabataanID', '==', kabataanID),
        where('email', '==', email) // Ensure the field name matches Firestore
      );
      const querySnapshot = await getDocs(q);

      // If no matching document is found, show an error and stop execution
      if (querySnapshot.empty) {
        setErrorMessage('Invalid SK ID or Email. Please try again.');
        setSuccessMessage('');
        return; // Stop further execution
      }

      // If a match is found, send the password reset email
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage('Password reset email sent. Check your inbox!');
      setErrorMessage('');
    } catch (error: any) {
      // Handle errors from Firebase
      setErrorMessage('Failed to send password reset email. Please try again.');
      setSuccessMessage('');
      console.error('Error:', error.message);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `url('/LoginBG.png')` }}
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white bg-opacity-95 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-black border-[0.5px]">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image src="/SKLogo.png" alt="Federation Marikina Logo" width={100} height={100} />
        </div>

        <h2 className="text-center text-2xl font-bold text-blue-900 opacity-90">FORGOT PASSWORD</h2>
        <p className="text-center text-blue-900 text-sm mb-6 opacity-75">
          Enter your Sangguniang Kabataan ID and email address to receive a password reset link
        </p>

        <form onSubmit={handlePasswordReset} className="space-y-4">
          <input
            type="text"
            placeholder="Enter your Sangguniang Kabataan ID"
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none"
            value={kabataanID}
            onChange={(e) => setKabataanID(e.target.value)}
            required
          />

          <input
            type="email"
            placeholder="Enter your email address"
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {errorMessage && <p className="text-red-600 text-center">{errorMessage}</p>}
          {successMessage && <p className="text-green-600 text-center">{successMessage}</p>}

          <button
            type="submit"
            className="w-full bg-blue-900 text-white py-2 rounded-md font-bold hover:bg-blue-800 transition"
          >
            SEND RESET LINK
          </button>
        </form>

        <a href="/">
          <p className="text-center text-sm text-blue-900 cursor-pointer hover:underline">
            Back to Login
          </p>
        </a>
      </div>
    </div>
  );
}
