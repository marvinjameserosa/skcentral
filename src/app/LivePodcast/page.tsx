"use client";

import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/app/Firebase/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  increment,
  DocumentData,
  QuerySnapshot,
  query,
  where,
  getDocs,
  deleteDoc} from "firebase/firestore";
import Navbar from "../Components/Navbar";

interface PodcastRoom {
  id: string;
  title: string;
  hostId: string;
  hostName?: string;
  speaker?: string;
  participantCount: number;
  status: 'waiting' | 'live' | 'ended' | 'approved';
  createdAt: number;
  approved?: boolean;
  webrtcRoomId?: string;
  description?: string;
  topic?: string;
  category?: string;
  maxParticipants?: number;
  isPublic?: boolean;
  date?: string;
  time?: string;
  userUID?: string;
  tags?: string[];
  endedAt?: number;
}

interface PodcastParticipant {
  userId: string;
  userName: string;
  role: 'host' | 'listener';
  joinedAt: number;
  isActive: boolean;
}

const LivePodcast = () => {
  const [podcastRooms, setPodcastRooms] = useState<PodcastRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const generateWebRTCRoomId = useCallback(() => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `podcast_${timestamp}_${random}`;
  }, []);

  const getErrorMessage = useCallback((error: unknown) => {
    const err = error as { code?: string; message?: string };
    if (err.code === 'permission-denied') {
      return 'Access denied. Please check your permissions.';
    }
    if (err.code === 'unavailable') {
      return 'Database temporarily unavailable. Please try again.';
    }
    if (err.code === 'unauthenticated') {
      return 'Authentication required. Please log in.';
    }
    if (err.message) {
      return err.message;
    }
    return 'Connection failed. Please check your internet connection.';
  }, []);

  const parseDateTime = useCallback((dateStr?: string, timeStr?: string, fallback?: number) => {
    if (dateStr && timeStr) {
      try {
        const dateTime = new Date(`${dateStr} ${timeStr}`);
        if (!isNaN(dateTime.getTime())) {
          return dateTime.getTime();
        }
      } catch {
        console.warn('Failed to parse date/time:', dateStr, timeStr);
      }
    }
    return fallback || Date.now();
  }, []);

  // Get current user ID and name from ApprovedUsers
  useEffect(() => {
    const getCurrentUser = async () => {
      setIsLoadingUser(true);
      try {
        // Get user ID from localStorage
        const userId = localStorage.getItem('userUID');
        
        if (!userId) {
          console.warn('No user ID found in localStorage');
          setIsLoadingUser(false);
          return;
        }

        setCurrentUserId(userId);
        
        // Query ApprovedUsers collection using UID
        const approvedUsersRef = collection(db, "ApprovedUsers");
        const q = query(approvedUsersRef, where("uid", "==", userId));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          const userName = userData.name || userData.userName || userData.displayName || null;
          
          setCurrentUserName(userName);
          console.log('Current user loaded:', { userId, userName });
        } else {
          console.warn('User not found in ApprovedUsers collection');
          setCurrentUserName(null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setCurrentUserName(null);
      } finally {
        setIsLoadingUser(false);
      }
    };

    getCurrentUser();
  }, []);

  // Clean up ended podcasts after 1 day
  useEffect(() => {
    const cleanupEndedPodcasts = async () => {
      try {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        const endedPodcastsQuery = query(
          collection(db, "podcasts"),
          where("status", "==", "ended")
        );
        
        const snapshot = await getDocs(endedPodcastsQuery);
        
        const deletePromises = snapshot.docs
          .filter(doc => {
            const data = doc.data();
            return data.endedAt && data.endedAt <= oneDayAgo;
          })
          .map(doc => deleteDoc(doc.ref));
        
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
          console.log(`Cleaned up ${deletePromises.length} ended podcasts`);
        }
      } catch (error) {
        console.error('Error cleaning up ended podcasts:', error);
      }
    };

    cleanupEndedPodcasts();
    const cleanupInterval = setInterval(cleanupEndedPodcasts, 60 * 60 * 1000);

    return () => clearInterval(cleanupInterval);
  }, []);

  // Fetch podcasts
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const fetchPodcasts = async () => {
      try {
        const podcastsQuery = query(
          collection(db, "podcasts"),
          where("status", "==", "approved")
        );

        unsubscribe = onSnapshot(
          podcastsQuery,
          async (snapshot: QuerySnapshot<DocumentData>) => {
            try {
              const rooms: PodcastRoom[] = [];
              const processPromises: Promise<void>[] = [];

              snapshot.forEach((docSnap) => {
                const processDoc = async () => {
                  const roomData = docSnap.data();
                  const roomId = docSnap.id;

                  if (!roomData || typeof roomData !== "object") return;

                  const {
                    title = "Untitled Podcast",
                    hostId = "unknown",
                    hostName,
                    speaker,
                    status = "waiting",
                    createdAt,
                    webrtcRoomId,
                    description = "",
                    topic = "",
                    category = "General",
                    maxParticipants = 50,
                    isPublic = true,
                    date,
                    time,
                    userUID,
                    tags = [],
                    endedAt
                  } = roomData;

                  const finalHostName = hostName || speaker || "Unknown Host";
                  const finalCreatedAt = parseDateTime(date, time, createdAt);

                  let finalWebRTCRoomId = webrtcRoomId;
                  if (!finalWebRTCRoomId && status !== 'ended') {
                    finalWebRTCRoomId = generateWebRTCRoomId();
                    try {
                      await updateDoc(doc(db, "podcasts", roomId), {
                        webrtcRoomId: finalWebRTCRoomId
                      });
                    } catch (updateError) {
                      console.warn('Failed to update WebRTC room ID:', updateError);
                    }
                  }

                  let participantCount = 0;
                  if (status !== 'ended') {
                    try {
                      const participantsQuery = query(
                        collection(db, `podcasts/${roomId}/participants`),
                        where("isActive", "==", true)
                      );
                      const participantsSnapshot = await getDocs(participantsQuery);
                      participantCount = participantsSnapshot.size;
                    } catch (participantError) {
                      console.warn('Failed to get participant count for room:', roomId, participantError);
                      participantCount = 0;
                    }
                  }

                  const room: PodcastRoom = {
                    id: roomId,
                    title,
                    hostId,
                    hostName: finalHostName,
                    speaker,
                    participantCount,
                    status: status as 'waiting' | 'live' | 'ended' | 'approved',
                    createdAt: finalCreatedAt,
                    approved: true,
                    webrtcRoomId: finalWebRTCRoomId,
                    description,
                    topic,
                    category,
                    maxParticipants,
                    isPublic,
                    date,
                    time,
                    userUID,
                    tags,
                    endedAt
                  };

                  rooms.push(room);
                };

                processPromises.push(processDoc());
              });

              await Promise.all(processPromises);

              rooms.sort((a, b) => {
                const statusPriority = { live: 3, waiting: 2, approved: 2, ended: 1 };
                const aPriority = statusPriority[a.status] || 0;
                const bPriority = statusPriority[b.status] || 0;
                
                if (aPriority !== bPriority) {
                  return bPriority - aPriority;
                }
                return b.createdAt - a.createdAt;
              });

              setPodcastRooms(rooms);
              setError(null);
            } catch (processError) {
              const errorMsg = getErrorMessage(processError);
              setError(`Failed to process podcast data: ${errorMsg}`);
            } finally {
              setIsLoading(false);
            }
          },
          (queryError) => {
            const errorMsg = getErrorMessage(queryError);
            setError(`Database query failed: ${errorMsg}`);
            setIsLoading(false);
          }
        );
      } catch (setupError) {
        const errorMsg = getErrorMessage(setupError);
        setError(`Setup failed: ${errorMsg}`);
        setIsLoading(false);
      }
    };

    fetchPodcasts();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [generateWebRTCRoomId, getErrorMessage, parseDateTime]);

  // Check if current user is the host of a specific podcast
  const checkIfUserIsHost = useCallback((room: PodcastRoom): boolean => {
    // Must have both user ID and user name loaded
    if (!currentUserId || !currentUserName) {
      return false;
    }
    
    // Check if the podcast has a userUID
    if (!room.userUID) {
      return false;
    }

    // Primary check: UID must match
    const uidMatches = room.userUID === currentUserId;
    
    // Secondary check: Name should match (with normalization)
    const normalizedCurrentName = currentUserName.toLowerCase().trim();
    const normalizedHostName = (room.hostName || '').toLowerCase().trim();
    const nameMatches = normalizedCurrentName === normalizedHostName;
    
    // Both conditions must be true
    const isHost = uidMatches && nameMatches;
    
    // Debug logging
    if (uidMatches && !nameMatches) {
      console.warn('UID matches but name does not:', {
        podcastId: room.id,
        currentUserId,
        podcastUserUID: room.userUID,
        currentUserName: normalizedCurrentName,
        hostName: normalizedHostName
      });
    }
    
    return isHost;
  }, [currentUserId, currentUserName]);

  const joinPodcastRoom = async (
    roomId: string,
    webrtcRoomId: string,
    userId: string,
    userName: string,
    role: "host" | "listener" = "listener"
  ) => {
    try {
      const roomDoc = await new Promise<DocumentData | undefined>((resolve, reject) => {
        const unsubscribe = onSnapshot(
          doc(db, "podcasts", roomId),
          (doc) => {
            unsubscribe();
            if (doc.exists()) {
              resolve(doc.data());
            } else {
              reject(new Error('Podcast not found'));
            }
          },
          (error) => {
            unsubscribe();
            reject(error);
          }
        );
      });

      if (!roomDoc || !roomDoc.approved) {
        throw new Error('Podcast not approved');
      }

      if (roomDoc.status === 'ended') {
        throw new Error('This podcast has ended');
      }

      const participantsQuery = query(
        collection(db, `podcasts/${roomId}/participants`),
        where("isActive", "==", true)
      );
      const participantsSnapshot = await getDocs(participantsQuery);
      
      if (participantsSnapshot.size >= (roomDoc.maxParticipants || 50)) {
        throw new Error('Room is full (maximum 50 participants reached)');
      }

      const participantRef = doc(db, `podcasts/${roomId}/participants`, userId);
      const participantData: PodcastParticipant = {
        userId,
        userName,
        role,
        joinedAt: Date.now(),
        isActive: true
      };
      await setDoc(participantRef, participantData);
      
      const roomRef = doc(db, "podcasts", roomId);
      await updateDoc(roomRef, {
        participantCount: increment(1)
      });
      
      return { success: true, webrtcRoomId };
    } catch (error) {
      console.error('Error joining podcast:', error);
      throw new Error(`Failed to join podcast: ${getErrorMessage(error)}`);
    }
  };

  const handleJoinPodcast = async (room: PodcastRoom, asHost: boolean = false) => {
    try {
      if (room.status === 'ended') {
        alert('This podcast has ended and is no longer available');
        return;
      }

      if (room.participantCount >= (room.maxParticipants || 50)) {
        alert('This room is full (maximum 50 participants)');
        return;
      }

      // Verify host authorization
      if (asHost) {
        if (!currentUserId || !currentUserName) {
          alert('Unable to verify your identity. Please refresh the page and try again.');
          return;
        }

        const isHost = checkIfUserIsHost(room);
        
        if (!isHost) {
          alert('You are not authorized to join as host for this podcast. Your account must match the podcast creator.');
          return;
        }
      }

      const userId = currentUserId || `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const userName = asHost ? (currentUserName || 'Podcast Host') : (currentUserName || 'Podcast Listener');
      
      if (!room.webrtcRoomId) {
        throw new Error('WebRTC room ID not available');
      }
      
      const result = await joinPodcastRoom(
        room.id, 
        room.webrtcRoomId, 
        userId, 
        userName, 
        asHost ? 'host' : 'listener'
      );
      
      if (result.success) {
        const url = asHost 
          ? `/LivePodcast/Host?roomId=${room.id}&webrtcRoomId=${result.webrtcRoomId}&userId=${userId}&userName=${encodeURIComponent(userName)}`
          : `/LivePodcast/Listener?roomId=${room.id}&webrtcRoomId=${result.webrtcRoomId}&userId=${userId}&userName=${encodeURIComponent(userName)}`;
        window.location.href = url;
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      alert(`Failed to join podcast: ${errorMsg}`);
    }
  };

  const getStatusStyling = useCallback((status: string) => {
    switch (status) {
      case "live":
        return {
          className: "bg-red-50 text-red-700 border-red-200 ring-1 ring-red-300",
          icon: "🔴",
          pulse: "animate-pulse"
        };
      case "waiting":
        return {
          className: "bg-yellow-50 text-yellow-700 border-yellow-200 ring-1 ring-yellow-300",
          icon: "⏳",
          pulse: ""
        };
      case "approved":
        return {
          className: "bg-green-50 text-green-700 border-green-200 ring-1 ring-green-300",
          icon: "✅",
          pulse: ""
        };
      case "ended":
        return {
          className: "bg-gray-50 text-gray-700 border-gray-200 ring-1 ring-gray-300",
          icon: "🏁",
          pulse: ""
        };
      default:
        return {
          className: "bg-gray-50 text-gray-700 border-gray-200 ring-gray-300",
          icon: "📻",
          pulse: ""
        };
    }
  }, []);

  const handlePodcastRequest = () => {
    window.location.href = '/LivePodcast/PodcastRequest';
  };

  if (error && !isLoading) {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa]">
        <Navbar />
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">🚨 Connection Error</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <button 
              type="button"
              onClick={() => window.location.reload()} 
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              🔄 Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto relative">
      <Navbar />
      
      {/* Floating Action Button for Podcast Request */}
      <button
        onClick={() => (window.location.href = '/LivePodcast/createpodcast')}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 z-50 group flex items-center justify-center"
        title="Request a Podcast"
      >
        <span className="text-2xl">🎙️</span>
      </button>

      {/* Floating Action Button for Podcast Approval */}
      <button
        onClick={() => (window.location.href = '/LivePodcast/PodcastApproval')}
        className="fixed bottom-24 right-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 z-50 group flex items-center justify-center"
        title="Podcast Approval"
      >
        <div className="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-1 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          Podcast Approval
        </div>
        <span className="text-2xl">✅</span>
      </button>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Live Podcasts</h1>
        <p className="text-xl text-gray-600">
          Join approved podcasts and connect with hosts and listeners in real-time
        </p>
        {currentUserName && (
          <p className="text-sm text-gray-500 mt-2">
            Logged in as: <span className="font-semibold">{currentUserName}</span>
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <span className="text-3xl">📻</span>
            Available Podcasts
            {!isLoading && (
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                {podcastRooms.length} total
              </span>
            )}
          </h2>
        </div>

        <div className="p-8">
          {isLoading || isLoadingUser ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
              <p className="text-gray-500 text-lg">
                {isLoadingUser ? 'Loading user data...' : 'Loading podcasts...'}
              </p>
            </div>
          ) : podcastRooms.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {podcastRooms.map((room) => {
                const statusStyling = getStatusStyling(room.status);
                const isHost = checkIfUserIsHost(room);
                const isFull = room.participantCount >= (room.maxParticipants || 50);
                const isEnded = room.status === 'ended';

                return (
                  <div
                    key={room.id}
                    className={`bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 transition-all duration-300 ${
                      isEnded ? 'opacity-60' : 'hover:border-blue-300 hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 truncate flex-1 mr-2">
                        {room.title}
                      </h3>
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${statusStyling.className} ${statusStyling.pulse}`}
                      >
                        <span className="mr-1">{statusStyling.icon}</span>
                        {room.status.toUpperCase()}
                      </span>
                    </div>

                    {(room.description || room.topic) && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {room.description || room.topic}
                      </p>
                    )}

                    <div className="space-y-3 mb-6 text-sm">
                      <div className="flex items-center text-gray-700">
                        <span className="mr-3 text-lg">👤</span>
                        <span className="font-medium truncate">{room.hostName}</span>
                        {isHost && (
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </div>

                      <div className="flex items-center text-gray-600">
                        <span className="mr-3 text-lg">👥</span>
                        <span className="font-medium">
                          {room.participantCount}/{room.maxParticipants || 50} participants
                        </span>
                      </div>

                      {room.category && (
                        <div className="flex items-center text-gray-600">
                          <span className="mr-3 text-lg">🏷️</span>
                          <span className="font-medium">{room.category}</span>
                        </div>
                      )}
                    </div>

                    {isEnded ? (
                      <div className="w-full py-3 px-4 rounded-lg bg-gray-300 text-gray-600 text-sm font-bold text-center">
                        <span className="mr-2">🏁</span>
                        Podcast Ended
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {isHost && (
                          <button
                            type="button"
                            onClick={() => handleJoinPodcast(room, true)}
                            disabled={isFull}
                            className={`w-full py-3 px-4 rounded-lg transition-all duration-200 text-sm font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${
                              isFull
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                            }`}
                          >
                            <span className="mr-2">👑</span>
                            Join as Host
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleJoinPodcast(room, false)}
                          disabled={isFull}
                          className={`w-full py-3 px-4 rounded-lg transition-all duration-200 text-sm font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${
                            isFull
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                          }`}
                        >
                          <span className="mr-2">
                            {isFull ? '🚫' : '🎧'}
                          </span>
                          {isFull ? 'Room Full' : 'Join as Listener'}
                        </button>
                      </div>
                    )}

                    {room.tags && room.tags.length > 0 && (
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-1">
                          {room.tags.slice(0, 3).map((tag, index) => (
                            <span
                              key={index}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full"
                            >
                              #{tag}
                            </span>
                          ))}
                          {room.tags.length > 3 && (
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                              +{room.tags.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎙️</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                No Podcasts Available
              </h3>
              <p className="text-gray-500 max-w-md mx-auto mb-4">
                There are currently no approved podcasts available. Check back later or request your own!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivePodcast;