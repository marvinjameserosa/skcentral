'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function MarikinaLogin() {
  const [clickCount, setClickCount] = useState(0);

  const handleClick = () => {
    if (clickCount === 0) {
      // Handle the "send code again" functionality
      console.log("Sending code...");
      setClickCount(1);  // Increment click count to prevent further actions
    } else if (clickCount === 1) {
      // Show the popup message
      alert("This process is not available, try again later.");
      setClickCount(0);  // Reset click count after showing the message
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
          <Image
            src="/SKLogo.png"
            alt="Federation Marikina Logo"
            width={100}
            height={100}
          />
        </div>

        {/* Title */}
        <h2 className="text-center text-3xl font-bold text-blue-900 opacity-90">VERIFICATION</h2>
        <p className="text-center text-blue-900 text-sm mb-6 opacity-75">
          Enter the 6 digit code sent to your email
        </p>

        {/* Form */}
        <form className="space-y-4">
          <input
            type="text"
            placeholder="Enter code"
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none"
          />

<a
  href="/forgotpassword/verification/ChangePassword"
  className="w-full bg-blue-900 text-white py-2 rounded-md font-bold hover:bg-blue-900 transition text-center block"
>
  CONTINUE
</a>

          {/* Send Code Again Button */}
          <p
            className="text-center text-sm text-blue-900 cursor-pointer hover:underline"
            onClick={handleClick}
          >
            Send Code Again
          </p>
        </form>
      </div>
    </div>
  );
}
