"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/app/Firebase/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import Navbar from "../../Components/Navbar";

interface Podcast {
  id: string;
  podcastId: string;
  title: string;
  speaker: string;
  topic: string;
  status: string;
  date: string;
  time: string;
  userUID: string;
}

const PodcastApproval = () => {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generate Room ID: SKCMP-XXXXX-YYYYMMDD
  const generateRoomId = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let random = "";
    for (let i = 0; i < 5; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const date = new Date();
    const dateString = `${date.getFullYear()}${String(
      date.getMonth() + 1
    ).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `SKCMP-${random}-${dateString}`;
  };

  // Generate Host ID
  const generateHostId = (): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `host_${timestamp}_${random}`;
  };

  const fetchPendingPodcasts = async () => {
    try {
      const q = query(
        collection(db, "podcastRegistration"),
        where("status", "==", "pending")
      );

      const querySnapshot = await getDocs(q);
      const pending: Podcast[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<Podcast, "id">;
        pending.push({
          id: docSnap.id,
          ...data,
        });
      });

      // Sort by date & time, newest first
      pending.sort((a, b) => {
        const aTime = new Date(`${a.date}T${a.time}`).getTime();
        const bTime = new Date(`${b.date}T${b.time}`).getTime();
        return bTime - aTime;
      });

      setPodcasts(pending);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching podcasts:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPodcasts();
  }, []);

  const handleApprove = async (docId: string) => {
    try {
      const podcastRef = doc(db, "podcastRegistration", docId);
      const podcastSnap = await getDoc(podcastRef);

      if (!podcastSnap.exists()) {
        alert("Podcast not found");
        return;
      }

      const podcastData = podcastSnap.data();

      // Generate unique IDs
      const roomId = generateRoomId();
      const hostId = generateHostId();
      const hostName = podcastData.speaker || "Unknown Host";

      console.log("Approving podcast with:", { roomId, hostId, hostName });

      // Create a document in the "podcasts" collection with the approved data
      await setDoc(doc(db, "podcasts", roomId), {
        roomId: roomId,
        hostId: hostId,
        hostName: hostName,
        podcastId: podcastData.podcastId,
        title: podcastData.title,
        speaker: podcastData.speaker,
        topic: podcastData.topic,
        hostUID: podcastData.userUID,
        scheduledDate: podcastData.date,
        scheduledTime: podcastData.time,
        createdAt: serverTimestamp(),
        status: "approved",
      });

      // Remove from pending collection
      await deleteDoc(podcastRef);

      alert(
        `✅ Podcast approved successfully!\n\n` +
          `Room ID: ${roomId}\n` +
          `Host ID: ${hostId}\n` +
          `Host Name: ${hostName}\n\n` +
          `The podcast has been moved to the approved podcasts collection.`
      );

      fetchPendingPodcasts();
    } catch (error) {
      console.error("Error approving podcast:", error);
      alert("Failed to approve podcast. Please try again.");
    }
  };

  const handleReject = async (docId: string) => {
    try {
      const confirmed = window.confirm(
        "Are you sure you want to reject this podcast request?"
      );

      if (!confirmed) return;

      await updateDoc(doc(db, "podcastRegistration", docId), {
        status: "rejected",
        rejectedAt: serverTimestamp(),
      });

      alert("Podcast request rejected.");
      fetchPendingPodcasts();
    } catch (error) {
      console.error("Error rejecting podcast:", error);
      alert("Failed to reject podcast. Please try again.");
    }
  };

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-800">
          Podcast Approval
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Review and approve podcast requests from hosts.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-8 shadow border border-gray-200">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
          Pending Podcast Requests
        </h2>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading pending requests...</p>
          </div>
        ) : podcasts.length > 0 ? (
          <div className="space-y-4">
            {podcasts.map((pod) => (
              <div
                key={pod.id}
                className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-gray-300 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 mr-4">
                        {pod.title}
                      </h3>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                        Pending Approval
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center text-gray-600">
                        <span className="mr-2">🏷️</span>
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
                          {pod.podcastId}
                        </span>
                      </div>

                      <div className="flex items-center text-gray-600">
                        <span className="mr-2">👤</span>
                        <span className="truncate">
                          Speaker: {pod.speaker}
                        </span>
                      </div>

                      <div className="flex items-center text-gray-500">
                        <span className="mr-2">⏰</span>
                        <span>
                          Scheduled: {pod.date} {pod.time}
                        </span>
                      </div>
                    </div>

                    {pod.topic && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="mr-2">💬</span>
                        <span>Topic: {pod.topic}</span>
                      </div>
                    )}

                    {pod.userUID && (
                      <div className="mt-2 text-xs text-gray-500">
                        <span className="mr-2">🔑</span>
                        <span className="font-mono">User ID: {pod.userUID}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-3 ml-6">
                    <button
                      onClick={() => handleApprove(pod.id)}
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2 shadow-md hover:shadow-lg"
                    >
                      <span>✓</span>
                      <span>Approve</span>
                    </button>

                    <button
                      onClick={() => handleReject(pod.id)}
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2 shadow-md hover:shadow-lg"
                    >
                      <span>✗</span>
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl">
              ✓
            </div>
            <p className="text-gray-500 text-lg">
              No pending podcast requests
            </p>
            <p className="text-gray-400 text-sm mt-2">
              All podcast requests have been reviewed
            </p>
          </div>
        )}
      </div>
      <Navbar />
    </div>
  );
};
  
export default PodcastApproval;
