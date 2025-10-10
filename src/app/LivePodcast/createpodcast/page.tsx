"use client";
import React, { useState } from "react";
import Link from "next/link";
import Navbar from "../../Components/Navbar";

// ✅ Import Firestore
import { db } from "@/app/Firebase/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Define the type for the form data
interface FormData {
  title: string;
  topic: string;
  date: string;
  time: string;
}

const PodcastForm = () => {
  const [formData, setFormData] = useState<FormData>({
    title: "",
    topic: "",
    date: "",
    time: "",
  });

  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setShowConfirmation(true);
  };

  // ✅ Handle Firestore submission
  const handleConfirmation = async (confirmed: boolean) => {
    if (confirmed) {
      setIsSubmitting(true);

      try {
        await addDoc(collection(db, "podcastRegistration"), { // ✅ Updated collection name
          ...formData,
          createdAt: serverTimestamp(),
        });

        alert("🎉 Podcast successfully registered!");
        setFormData({
          title: "",
          topic: "",
          date: "",
          time: "",
        });
      } catch (error) {
        console.error("Error adding podcast: ", error);
        alert("❌ Failed to register podcast. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    }
    setShowConfirmation(false);
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">
          Podcast Submission
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Propose your podcast session details.
        </p>
      </div>

      {/* Podcast Form */}
      <div className="w-full bg-white rounded-xl shadow-md mb-6">
        {/* Blue Header */}
        <div className="relative bg-[#1167B1] text-white px-6 py-4 rounded-t-xl">
          <Link href="/podcast">
            <button className="absolute left-6 top-1/2 -translate-y-1/2 text-xl hover:opacity-80">
              ←
            </button>
          </Link>
          <h2 className="text-center text-3xl font-semibold">
            Propose a Live Podcast Session
          </h2>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-lg shadow-md"
        >
          <div className="mb-4">
            <label
              className="block text-lg font-medium text-gray-700"
              htmlFor="title"
            >
              Title of your talk
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg bg-[#D0EFFF]"
              required
            />
          </div>

          <div className="mb-4">
            <label
              className="block text-lg font-medium text-gray-700"
              htmlFor="topic"
            >
              What do you want to talk about?
            </label>
            <textarea
              id="topic"
              name="topic"
              value={formData.topic}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg bg-[#D0EFFF]"
              required
            ></textarea>
          </div>

          <div className="mb-4 flex space-x-4">
            <div className="w-1/2">
              <label
                className="block text-lg font-medium text-gray-700"
                htmlFor="date"
              >
                Date
              </label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                className="w-full p-3 border border-gray-300 rounded-lg bg-[#D0EFFF]"
                required
              />
            </div>

            <div className="w-1/2">
              <label
                className="block text-lg font-medium text-gray-700"
                htmlFor="time"
              >
                Time
              </label>
              <input
                type="time"
                id="time"
                name="time"
                value={formData.time}
                onChange={handleInputChange}
                className="w-full p-3 border border-gray-300 rounded-lg bg-[#D0EFFF]"
                required
              />
            </div>
          </div>

          <div className="text-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#1167B1] text-white p-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-md w-96">
            <h3 className="text-xl font-semibold text-gray-700">
              Are you sure you want to register?
            </h3>
            <div className="mt-4 flex justify-around">
              <button
                onClick={() => handleConfirmation(true)}
                className="bg-[#1167B1] text-white px-6 py-2 rounded-lg hover:bg-blue-600"
              >
                Yes, Register
              </button>
              <button
                onClick={() => handleConfirmation(false)}
                className="bg-gray-400 text-white px-6 py-2 rounded-lg hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
};

export default PodcastForm;
