 'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { db } from '@/app/Firebase/firebase';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

type FormFields = {
  email: string;
  password: string;
};

export default function MarikinaLogin() {
  const router = useRouter();
  const auth = getAuth();

  const [formData, setFormData] = useState<FormFields>({
    email: '',
    password: ''
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

    const { email, password } = formData;

    if (!email || !password) {
      setError("Please fill in all fields.");
      setLoading(false);
      return;
    }

    try {
      // ✅ Force email to be skcentralsystem@gmail.com
      if (email.toLowerCase().trim() !== "skcentralsystem@gmail.com") {
        setError("Only IT Admin can log in with this account.");
        setLoading(false);
        return;
      }

      // ✅ Firebase Auth login
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // ✅ Store login info in Firestore
      const loginRef = doc(db, "ITuser", user.uid);
      await setDoc(
        loginRef,
        {
          uid: user.uid,
          email: user.email,
          lastLogin: new Date().toISOString()
        },
        { merge: true }
      );

      // ✅ Redirect to IT Panel
      router.push('/ITlogin/ITpanel');
    } catch (err: unknown) {
      console.error("Login Error:", err);
      setError("Invalid email or password.");
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
        <div className="flex justify-center mb-4">
          <Image src="/SKLogo.png" alt="Federation Marikina Logo" width={110} height={110} />
        </div>
        <h2 className="text-center text-3xl font-bold text-blue-900 mb-1">LOGIN AS IT ADMIN</h2>
        <p className="text-center text-[#002C84] text-sm mb-6">KAMUSTA KABATAAN NG MARIKINA</p>

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
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Password"
            required
            className="w-full border border-blue-800 rounded-md px-3 py-2 text-blue-900 placeholder-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <p
            onClick={() => router.push('/forgotpassword')}
            className="text-center italic text-sm text-blue-900 cursor-pointer hover:underline mb-4"
          >
            Forgot Password
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#002C84] text-white py-2 rounded-md font-bold hover:bg-blue-900 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>
      </div>
    </div>
  );
}
