'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { db } from '@/app/Firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

type FormFields = {
  email: string;
  password: string;
  skId: string;
};

export default function MarikinaLogin() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormFields>({
    email: '',
    password: '',
    skId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { email, password, skId } = formData;
    if (!email || !password || !skId) {
      setError("Please fill in all fields.");
      setLoading(false);
      return;
    }

    try {
      const sanitizedEmail = email.toLowerCase().trim();
      const auth = getAuth();

      // ✅ Firebase Auth login
      await signInWithEmailAndPassword(auth, sanitizedEmail, password);

      // 🔍 Check SK ID in Firestore
      const q = query(
        collection(db, "adminUsers"),
        where("email", "==", sanitizedEmail),
        where("skId", "==", skId)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("Your SK ID does not match our records.");
        setLoading(false);
        return;
      }

      // 🎉 Success
      router.push('/Home');

    } catch (err: unknown) {
      console.error("Login Error:", err);
      const errorCode = (err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : "");
      if (errorCode === "auth/user-not-found") {
        setError("No account found. Please check your email.");
      } else if (errorCode === "auth/wrong-password") {
        setError("Incorrect password.");
      } else {
        setError("Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: `url('/LoginBG.png')` }}
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white bg-opacity-95 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-black border-opacity-20">
        
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image src="/SKLogo.png" alt="Federation Marikina Logo" width={110} height={110} />
        </div>
        
        {/* Title */}
        <h2 className="text-center text-3xl font-bold text-blue-900 mb-1">
          LOGIN HERE
        </h2>
        <p className="text-center text-[#002C84] text-sm mb-6">
          KAMUSTA KABATAAN NG MARIKINA
        </p>

        {/* Form */}
        <form className="space-y-4" onSubmit={handleLogin}>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="Email Address"
            required
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            name="skId"
            value={formData.skId}
            onChange={handleInputChange}
            placeholder="SK ID"
            required
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Password"
            required
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Error Message */}
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          {/* Forgot Password */}
          <p
            onClick={() => router.push('/forgotpassword')}
            className="text-center italic text-sm text-blue-900 cursor-pointer hover:underline mb-4"
          >
            Forgot Password
          </p>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#002C84] text-white py-2 rounded-md font-bold hover:bg-blue-900 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>

          {/* Switch Account */}
          <p
            onClick={() => router.push('/ITlogin')}
            className="text-center text-sm text-blue-900 cursor-pointer hover:underline"
          >
            Login as IT Admin
          </p>
        </form>
      </div>
    </div>
  );
}
