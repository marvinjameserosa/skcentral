'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function MarikinaLogin() {
  const [] = useState(0);

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
        <h2 className="text-center text-3xl font-bold text-blue-900 opacity-90">CHANGE PASSWORD</h2>
        <p className="text-center text-blue-900 text-sm mb-6 opacity-75">
          Your password must be at least 8 characters long
        </p>

        {/* Form */}
        <form className="space-y-4">
          <input
            type="text"
            placeholder="Enter your new password"
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none"
          />
<Link
  href="/"
  className="w-full bg-blue-900 text-white py-2 rounded-md font-bold hover:bg-blue-900 transition text-center block"
>
  CONTINUE
</Link>
        </form>
      </div>
    </div>
  );
}
