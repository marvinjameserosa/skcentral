"use client";
import React, { useState } from "react";
import Link from "next/link";
import Navbar from "../../Components/Navbar";
import { db } from "@/app/Firebase/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

interface FormData {
  speaker: string;
  title: string;
  topic: string;
  date: string;
  time: string;
}

const PodcastForm = () => {
  const [formData, setFormData] = useState<FormData>({
    speaker: "",
    title: "",
    topic: "",
    date: "",
    time: "",
  });

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert("⚠️ Please login first!");
      return;
    }

    // Show confirmation modal
    setShowConfirmation(true);
  };

  const handleConfirmation = async (confirmed: boolean) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!confirmed || !user) {
      setShowConfirmation(false);
      return;
    }

    setIsSubmitting(true);

    try {
      // Create a new document reference with a generated ID (same as Flutter)
      const newDocRef = doc(collection(db, "podcastRegistration"));

      // Save the proposal data
      await setDoc(newDocRef, {
        podcastId: newDocRef.id,
        userUID: user.uid,
        speaker: formData.speaker.trim(),
        title: formData.title.trim(),
        topic: formData.topic.trim(),
        date: formData.date.trim(),
        time: formData.time.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      alert("🎉 Proposal Submitted (Pending Review)");
      setFormData({ speaker: "", title: "", topic: "", date: "", time: "" });
      setShowConfirmation(false);
    } catch (error) {
      console.error("Error submitting proposal:", error);
      alert("❌ Failed to submit proposal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      {/* Navbar */}
      <Navbar />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">
          Podcast Submission
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Propose your podcast session details.
        </p>
      </div>

      {/* Form Card */}
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
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-b-xl">
          {/* Speaker */}
          <div className="mb-4">
            <label
              className="block text-lg font-medium text-gray-700"
              htmlFor="speaker"
            >
              Speaker Name
            </label>
            <input
              type="text"
              id="speaker"
              name="speaker"
              value={formData.speaker}
              onChange={handleInputChange}
              className="w-full p-3 border border-gray-300 rounded-lg bg-[#D0EFFF]"
              required
            />
          </div>

          {/* Title */}
          <div className="mb-4">
            <label
              className="block text-lg font-medium text-gray-700"
              htmlFor="title"
            >
              Title
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

          {/* Topic */}
          <div className="mb-4">
            <label
              className="block text-lg font-medium text-gray-700"
              htmlFor="topic"
            >
              Short Description / Topic
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

          {/* Date and Time */}
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

          {/* Submit Button */}
          <div className="text-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#1167B1] text-white p-3 rounded-lg hover:bg-blue-600"
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
              Are you sure you want to submit your proposal?
            </h3>
            <div className="mt-4 flex justify-around">
              <button
                onClick={() => handleConfirmation(true)}
                className="bg-[#1167B1] text-white px-6 py-2 rounded-lg hover:bg-blue-600"
              >
                Yes, Submit
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
    </div>
  );
};

export default PodcastForm;
