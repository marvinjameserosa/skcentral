'use client';

import { useState } from 'react';
import Image from 'next/image';
import Navbar from "../../Components/Navbar";

export default function UserSettings() {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [code, setCode] = useState('');
  const [passwords, setPasswords] = useState({
    current: '',
    newPass: '',
    confirm: '',
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handlePasswordChangeClick = () => {
    setShowEmailModal(true); // Show email verification first
  };

  const handleEmailVerification = () => {
    setShowEmailModal(false); // Close email verification modal
    setShowPasswordModal(true); // Show password change modal
  };

  const handleDeviceModalClick = () => {
    setShowDeviceModal(true); // Show device modal
  };


  const handleLogin = () => {
    // Dummy credentials for validation (replace with actual logic)
    const validEmail = 'user@example.com';
    const validPassword = 'password123';

    if (email === validEmail && password === validPassword) {
      // If credentials are correct, delete the device and proceed
      setShowDeviceModal(false); // Close the device login modal
      alert('Device deleted successfully'); // Or any other logic you'd like
      setShowLoginModal(false); // Close the login confirmation modal
    } else {
      // If credentials are incorrect, display an error message
      setErrorMessage('Email or password is incorrect');
    }
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      {/* Greeting Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">Kamusta!</h2>
          <h1 className="text-3xl font-bold text-[#1167B1]">Kabataan ng Marikina</h1>
        </div>
      </div>

      {/* Login and Recovery Section */}
      <div className="bg-white rounded-xl shadow-lg mb-6">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-[#0A2F7A] mb-1">Login and Recovery</h2>
          <p className="text-sm text-gray-700 mb-4">
            Manage your passwords, login preferences, and recovery methods.
          </p>

          <div className="space-y-4">
            <div
              className="bg-[#d9e8f6] px-6 py-4 rounded-md cursor-pointer"
              onClick={handlePasswordChangeClick} // Trigger email modal
            >
              <p className="text-xl font-semibold text-[#0A2F7A]">Change Password</p>
            </div>
          </div>
        </div>
      </div>

      {/* Where You're Logged In Section */}
      <div className="bg-white rounded-xl shadow-lg">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-[#0A2F7A] mb-1">Where you’re logged in</h2>
          <p className="text-sm text-gray-700 mb-4">
            See what device are used to log in to your accounts
          </p>

          <div
            className="bg-[#d9e8f6] flex justify-between items-center px-6 py-4 rounded-md cursor-pointer"
            onClick={handleDeviceModalClick} // Open device modal
          >
            <div>
              <p className="text-xl font-semibold text-[#0A2F7A]">Device</p>
              <p className="text-sm text-gray-700">Location</p>
            </div>
            <p className="text-xl font-bold text-[#0A2F7A]">DATE AND TIME</p>
            <Image src="/ArrowRight.svg" alt="Arrow" width={24} height={24} />
          </div>
        </div>
      </div>

      {/* MODAL: Check your Email */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#e7f0fa] rounded-2xl w-[400px] p-6 text-center shadow-lg border-2 border-[#0A2F7A]">
            <h2 className="text-3xl font-bold text-[#0A2F7A] mb-2">Check your Email</h2>
            <p className="text-lg text-gray-700 mb-4">Enter the code we sent to your email</p>

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code"
              className="w-full text-xl font-bold px-4 py-2 border border-gray-400 rounded-md mb-2"
            />

            <p className="text-sm text-[#0A2F7A] font-semibold mb-4 cursor-pointer hover:underline">
              Get a new Code
            </p>

            <button
              onClick={handleEmailVerification} // Proceed to password change modal
              className="w-full bg-[#1167B1] text-white text-xl font-bold py-3 rounded-md mb-2 hover:bg-[#0e5290]"
            >
              Continue
            </button>
            <button
              onClick={() => setShowEmailModal(false)}
              className="w-full bg-[#fcd116] text-black text-xl font-bold py-3 rounded-md hover:brightness-90"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Change Password */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#e7f0fa] rounded-2xl w-[450px] p-6 pt-8 relative text-center shadow-lg border-2 border-[#0A2F7A]">
            {/* Close button inside modal */}
            <button
              onClick={() => setShowPasswordModal(false)}
              className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-8 h-8 flex items-center justify-center"
            >
              <span className="text-2xl">X</span>
            </button>

            <h2 className="text-3xl font-bold text-[#0A2F7A] mb-2">Change Password</h2>
            <p className="text-sm text-gray-700 mb-6">
              Your password must be at least 8 characters and should include a combination
              of numbers, letters and special characters (!@$%).
            </p>

            <div className="space-y-3 mb-4">
              <input
                type="password"
                placeholder="Current Password"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                className="w-full text-lg font-bold text-[#0A2F7A] px-4 py-2 border border-gray-400 rounded-md"
              />
              <input
                type="password"
                placeholder="New Password"
                value={passwords.newPass}
                onChange={(e) => setPasswords({ ...passwords, newPass: e.target.value })}
                className="w-full text-lg font-bold text-[#0A2F7A] px-4 py-2 border border-gray-400 rounded-md"
              />
              <input
                type="password"
                placeholder="Re-type Password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                className="w-full text-lg font-bold text-[#0A2F7A] px-4 py-2 border border-gray-400 rounded-md"
              />
            </div>

            <p className="text-sm text-[#0A2F7A] font-semibold mb-6 cursor-pointer hover:underline">
              Forgot your Password
            </p>

            <button
              onClick={() => alert('Password changed')}
              className="w-full bg-[#1167B1] text-white text-xl font-bold py-3 rounded-md hover:bg-[#0e5290]"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Device Login Details */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#e7f0fa] rounded-2xl w-[400px] p-6 shadow-lg border-2 border-[#0A2F7A] relative">
            {/* X button inside the modal shape, at the top-right corner */}
            <button
              onClick={() => setShowDeviceModal(false)}
              className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-8 h-8 flex items-center justify-center"
            >
              <span className="text-2xl">X</span>
            </button>

            <h2 className="text-3xl font-bold text-[#0A2F7A] mb-2 text-center mt-4">Logins on Device</h2>
            <p className="text-lg text-gray-700 mb-8 text-center">
              We’ll help you secure your account in case you see a login you don’t recognize.
            </p>

            {/* Separator line */}
            <div className="border-t border-gray-300 my-4"></div>

            {/* Device, Location, DATE AND YEAR section */}
            <div className="mb-8 text-left">
              <p className="text-xl font-semibold text-[#0A2F7A]">Device</p>
              <p className="text-sm text-gray-700">Location</p>
              <p className="text-xl font-bold text-[#0A2F7A]">DATE AND YEAR</p>
            </div>

            {/* Separator line */}
            <div className="border-t border-gray-300 my-6"></div>

            {/* Logout button */}
            <button
              onClick={() => setShowLoginModal(true)} // Open the login confirmation modal after logging out
              className="w-full bg-[#1167B1] text-white text-xl font-bold py-3 rounded-md mb-2 hover:bg-[#0e5290]"
            >
              Logout on this Device
            </button>
          </div>
        </div>
      )}

{/* MODAL: Login Confirmation */}
{showLoginModal && (
  <div className="fixed inset-0 bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-[#e7f0fa] rounded-2xl w-[400px] p-6 shadow-lg border-2 border-[#0A2F7A] relative">
      {/* Close button inside modal */}
      <button
        onClick={() => {
          setShowEmailModal(false);  // Close all modals
          setShowPasswordModal(false);
          setShowDeviceModal(false);
          setShowLoginModal(false);
        }}
        className="absolute top-4 right-4 text-white bg-red-600 rounded-full w-8 h-8 flex items-center justify-center"
      >
        <span className="text-2xl">X</span>
      </button>

      <h2 className="text-3xl font-bold text-[#0A2F7A] mb-2 text-center mt-4">Confirmation</h2>
      <p className="text-sm text-gray-600 text-center mb-4">
        For confirmation, please input your credentials to proceed with the process
      </p>

      {/* Email input */}
      <div className="mb-4">
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full text-lg font-bold text-[#0A2F7A] px-4 py-2 border border-gray-400 rounded-md"
          placeholder="Enter your SK ID/Email"
        />
      </div>

      {/* Password input */}
      <div className="mb-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full text-lg font-bold text-[#0A2F7A] px-4 py-2 border border-gray-400 rounded-md"
          placeholder="Enter your password"
        />
      </div>

      {/* Error message */}
      {errorMessage && (
        <p className="text-sm text-red-600 text-center mb-4">
          {errorMessage}
        </p>
      )}

      {/* Proceed button */}
      <button
        onClick={handleLogin}
        className="w-full bg-[#1167B1] text-white text-xl font-bold py-3 rounded-md mb-2 hover:bg-[#0e5290]"
      >
        Proceed
      </button>
    </div>
  </div>
)}
        <Navbar></Navbar>
    </div>
  );
}
