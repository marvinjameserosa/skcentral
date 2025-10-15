"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db, auth, rtdb } from "@/app/Firebase/firebase";
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
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref as rtdbRef,
  onValue,
  onChildAdded,
  set as rtdbSet,
  update as rtdbUpdate,
  push as rtdbPush,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";
import Navbar from "../Components/Navbar";
import Image from "next/image";

interface PodcastRoom {
  id: string;
  title: string;
  hostId: string;
  hostName?: string;
  speaker?: string;
  participantCount: number;
  status: 'waiting' | 'live' | 'ended' | 'approved' | 'scheduled' | 'happening-soon';
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
  scheduledTime?: number;
  roomId?: string;
}

interface PodcastParticipant {
  userId: string;
  userName: string;
  role: 'host' | 'listener';
  joinedAt: number;
  isActive: boolean;
}

interface FilterOptions {
  category: string;
  status: string;
  sortBy: 'createdAt' | 'participantCount' | 'title';
  sortOrder: 'asc' | 'desc';
}

interface RTCConfiguration {
  iceServers: Array<{
    urls: string | string[];
  }>;
}

const LivePodcast = () => {
  const [podcastRooms, setPodcastRooms] = useState<PodcastRoom[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<PodcastRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [searchTerm] = useState<string>('');
  const [filters] = useState<FilterOptions>({
    category: 'all',
    status: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  const [, setCategories] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const rtdbUnsubscribersRef = useRef<Map<string, (() => void)[]>>(new Map());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        const cleanTimeStr = timeStr.trim();
        const dateTime = new Date(`${dateStr} ${cleanTimeStr}`);
        if (!isNaN(dateTime.getTime())) {
          return dateTime.getTime();
        }
      } catch {
        console.warn('Failed to parse date/time:', dateStr, timeStr);
      }
    }
    return fallback || Date.now();
  }, []);

  const isPodcastJoinable = useCallback((room: PodcastRoom) => {
    if (room.status === 'ended') {
      return { joinable: false, reason: 'Podcast has ended' };
    }

    if (room.date && room.time) {
      const scheduledTime = parseDateTime(room.date, room.time);
      if (currentTime < scheduledTime) {
        const timeUntil = scheduledTime - currentTime;
        const minutesUntil = Math.floor(timeUntil / 60000);
        const hoursUntil = Math.floor(minutesUntil / 60);
        const daysUntil = Math.floor(hoursUntil / 24);
        
        let timeString = '';
        if (daysUntil > 0) {
          timeString = `${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
        } else if (hoursUntil > 0) {
          timeString = `${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}`;
        } else {
          timeString = `${minutesUntil} minute${minutesUntil > 1 ? 's' : ''}`;
        }
        
        return { 
          joinable: false, 
          reason: `Starts in ${timeString}`,
          scheduledTime: scheduledTime
        };
      }
    }

    if (room.participantCount >= (room.maxParticipants || 50)) {
      return { joinable: false, reason: 'Room is full' };
    }

    return { joinable: true, reason: '' };
  }, [currentTime, parseDateTime]);

  const formatScheduledTime = useCallback((dateStr?: string, timeStr?: string) => {
    if (!dateStr || !timeStr) return '';
    
    try {
      const scheduledDate = new Date(`${dateStr} ${timeStr.trim()}`);
      if (isNaN(scheduledDate.getTime())) return '';
      
      const now = new Date();
      const isToday = scheduledDate.toDateString() === now.toDateString();
      const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === scheduledDate.toDateString();
      
      const timeFormatted = scheduledDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      if (isToday) {
        return `Today at ${timeFormatted}`;
      } else if (isTomorrow) {
        return `Tomorrow at ${timeFormatted}`;
      } else {
        const dateFormatted = scheduledDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: scheduledDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
        return `${dateFormatted} at ${timeFormatted}`;
      }
    } catch {
      return '';
    }
  }, []);

  const getParticipantCount = async (roomId: string): Promise<number> => {
    try {
      const participantsQuery = query(
        collection(db, `podcasts/${roomId}/participants`),
        where("isActive", "==", true)
      );
      const snapshot = await getDocs(participantsQuery);
      return snapshot.size;
    } catch (error) {
      console.warn('Failed to get participant count for room:', roomId, error);
      return 0;
    }
  };

  const initializeWebRTC = async (roomId: string, webrtcRoomId: string, userId: string, userName: string, isHost: boolean) => {
    try {
      console.log(`Initializing WebRTC for ${isHost ? 'host' : 'listener'}:`, roomId);

      if (isHost) {
        // Request microphone permission
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });

        console.log('Local stream acquired for host');

        // Update Firestore status to live
        await updateDoc(doc(db, "podcasts", roomId), {
          status: 'live',
          startedAt: serverTimestamp()
        });

        // Initialize RTDB room structure
        const rtdbRoomRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}`);
        await rtdbSet(rtdbRoomRef, {
          hostJoined: true,
          isLive: true,
          status: 'live',
          firestoreDocId: roomId,
          hostUserId: userId,
          hostUserName: userName
        });

        console.log('RTDB room initialized');

        // Listen for join requests from mobile listeners
        const joinRequestsRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/joinRequests`);
        
        const unsubscribe = onChildAdded(joinRequestsRef, async (snapshot) => {
          const requestId = snapshot.key;
          const data = snapshot.val();
          
          if (requestId && data) {
            console.log('New join request:', requestId, data);
            await handleListenerJoin(webrtcRoomId, requestId, data);
          }
        });

        rtdbUnsubscribersRef.current.set('joinRequests', [unsubscribe]);

      } else {
        // Listener logic - send join request to RTDB
        const joinRequestRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/joinRequests/${userId}`);
        await rtdbSet(joinRequestRef, {
          userId,
          userName,
          timestamp: rtdbServerTimestamp()
        });

        console.log('Join request sent to RTDB');

        // Listen for offer from host
        const offersRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/offers/${userId}`);
        
        const unsubscribe = onValue(offersRef, async (snapshot) => {
          const offer = snapshot.val();
          if (offer && offer.sdp && offer.type) {
            console.log('Received offer from host');
            await handleHostOffer(webrtcRoomId, userId, offer);
          }
        });

        rtdbUnsubscribersRef.current.set('offer', [unsubscribe]);
      }

      return true;
    } catch (error) {
      console.error('Error initializing WebRTC:', error);
      throw error;
    }
  };

  const handleListenerJoin = async (webrtcRoomId: string, requestId: string, data: { userId: string; userName: string; timestamp: number }) => {
    try {
      if (peerConnectionsRef.current.has(requestId)) {
        console.log('Peer connection already exists for:', requestId);
        return;
      }

      const configuration: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };

      const pc = new RTCPeerConnection(configuration);
      peerConnectionsRef.current.set(requestId, pc);

      // Add local audio tracks
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          if (localStreamRef.current) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      // Create data channel for emoji reception
      const dataChannel = pc.createDataChannel('emojis', {
        ordered: true
      });

      dataChannel.onopen = () => {
        console.log('Data channel opened for:', requestId);
      };

      dataChannel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'emoji') {
            console.log('Received emoji from listener:', message.emoji);
            // Handle emoji display logic here
          }
        } catch (e) {
          console.error('Error parsing data channel message:', e);
        }
      };

      dataChannelsRef.current.set(requestId, dataChannel);

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/candidates/${requestId}/host`);
          rtdbPush(candidateRef, {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          });
        }
      };

      // Listen for listener's ICE candidates
      const listenerCandidatesRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/candidates/${requestId}/listener`);
      
      const candidateUnsubscribe = onChildAdded(listenerCandidatesRef, async (snapshot) => {
        const candidateData = snapshot.val();
        if (candidateData && pc.remoteDescription) {
          const candidate = new RTCIceCandidate({
            candidate: candidateData.candidate,
            sdpMid: candidateData.sdpMid,
            sdpMLineIndex: candidateData.sdpMLineIndex
          });
          await pc.addIceCandidate(candidate);
        }
      });

      const existingUnsubscribers = rtdbUnsubscribersRef.current.get(requestId) || [];
      rtdbUnsubscribersRef.current.set(requestId, [...existingUnsubscribers, candidateUnsubscribe]);

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const offerRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/offers/${requestId}`);
      await rtdbSet(offerRef, {
        sdp: offer.sdp,
        type: offer.type,
        createdAt: rtdbServerTimestamp(),
        listenerUserName: data.userName || ''
      });

      console.log('Offer sent to listener:', requestId);

      // Listen for answer
      const answerRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/answers/${requestId}`);
      
      const answerUnsubscribe = onValue(answerRef, async (snapshot) => {
        const answer = snapshot.val();
        if (answer && answer.sdp && answer.type) {
          const answerDesc = new RTCSessionDescription({
            sdp: answer.sdp,
            type: answer.type as RTCSdpType
          });
          await pc.setRemoteDescription(answerDesc);
          console.log('Answer received from listener:', requestId);
        }
      });

      const allUnsubscribers = rtdbUnsubscribersRef.current.get(requestId) || [];
      rtdbUnsubscribersRef.current.set(requestId, [...allUnsubscribers, answerUnsubscribe]);

    } catch (error) {
      console.error('Error handling listener join:', error);
    }
  };

  const handleHostOffer = async (webrtcRoomId: string, userId: string, offer: RTCSessionDescriptionInit) => {
    try {
      const configuration: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };

      const pc = new RTCPeerConnection(configuration);
      peerConnectionsRef.current.set(userId, pc);

      // Handle incoming audio tracks
      pc.ontrack = (event) => {
        console.log('Received remote track from host');
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(e => console.error('Error playing audio:', e));
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/candidates/${userId}/listener`);
          rtdbPush(candidateRef, {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          });
        }
      };

      // Listen for host's ICE candidates
      const hostCandidatesRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/candidates/${userId}/host`);
      
      const candidateUnsubscribe = onChildAdded(hostCandidatesRef, async (snapshot) => {
        const candidateData = snapshot.val();
        if (candidateData) {
          const candidate = new RTCIceCandidate({
            candidate: candidateData.candidate,
            sdpMid: candidateData.sdpMid,
            sdpMLineIndex: candidateData.sdpMLineIndex
          });
          await pc.addIceCandidate(candidate);
        }
      });

      rtdbUnsubscribersRef.current.set('hostCandidates', [candidateUnsubscribe]);

      // Set remote description and create answer
      const offerDesc = new RTCSessionDescription({
        sdp: offer.sdp,
        type: offer.type as RTCSdpType
      });
      
      await pc.setRemoteDescription(offerDesc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer to RTDB
      const answerRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}/answers/${userId}`);
      await rtdbSet(answerRef, {
        sdp: answer.sdp,
        type: answer.type
      });

      console.log('Answer sent to host');

    } catch (error) {
      console.error('Error handling host offer:', error);
    }
  };

  const cleanupWebRTC = async (webrtcRoomId?: string) => {
    try {
      // Close all peer connections
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();

      // Close all data channels
      dataChannelsRef.current.forEach(dc => dc.close());
      dataChannelsRef.current.clear();

      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      // Unsubscribe from RTDB listeners
      rtdbUnsubscribersRef.current.forEach(unsubscribers => {
        unsubscribers.forEach(unsub => unsub());
      });
      rtdbUnsubscribersRef.current.clear();

      // Clean up RTDB room if host
      if (webrtcRoomId) {
        const rtdbRoomRef = rtdbRef(rtdb, `podcastRooms/${webrtcRoomId}`);
        await rtdbUpdate(rtdbRoomRef, {
          hostJoined: false,
          isLive: false,
          status: 'ended'
        });
      }

      console.log('WebRTC cleanup completed');
    } catch (error) {
      console.error('Error during WebRTC cleanup:', error);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const fetchPodcasts = async () => {
      try {
        setDebugInfo('Connecting to Firebase...');
        setConnectionStatus('connecting');

        const podcastsQuery = query(
          collection(db, "podcasts"),
          orderBy("date", "desc")
        );

        setDebugInfo('Setting up real-time listener...');
        
        unsubscribe = onSnapshot(
          podcastsQuery,
          async (snapshot: QuerySnapshot<DocumentData>) => {
            try {
              setConnectionStatus('connected');
              setDebugInfo(`Received ${snapshot.size} total documents from Firebase`);
              
              const rooms: PodcastRoom[] = [];
              const foundCategories = new Set<string>();

              for (const docSnap of snapshot.docs) {
                try {
                  const roomData = docSnap.data();
                  const roomId = docSnap.id;

                  if (!roomData || typeof roomData !== "object") {
                    console.warn('Invalid room data for:', roomId);
                    continue;
                  }

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
                    approved = false,
                    roomId: firestoreRoomId
                  } = roomData;

                  if (status === 'ended') {
                    console.log(`Skipping ended podcast ${roomId}`);
                    continue;
                  }

                  const finalHostName = hostName || speaker || "Unknown Host";
                  const finalCreatedAt = parseDateTime(date, time, createdAt);
                  const scheduledTime = date && time ? parseDateTime(date, time) : undefined;

                  let finalWebRTCRoomId = webrtcRoomId;
                  if (!finalWebRTCRoomId) {
                    finalWebRTCRoomId = generateWebRTCRoomId();
                    try {
                      await updateDoc(doc(db, "podcasts", roomId), {
                        webrtcRoomId: finalWebRTCRoomId
                      });
                      console.log('Generated WebRTC room ID for:', roomId);
                    } catch (updateError) {
                      console.warn('Failed to update WebRTC room ID:', updateError);
                    }
                  }

                  const participantCount = await getParticipantCount(roomId);

                  if (category && category !== 'General') {
                    foundCategories.add(category);
                  }

                  const room: PodcastRoom = {
                    id: roomId,
                    title,
                    hostId,
                    hostName: finalHostName,
                    speaker,
                    participantCount,
                    status: status as 'waiting' | 'live' | 'ended' | 'approved' | 'scheduled',
                    createdAt: finalCreatedAt,
                    approved: approved || status === 'approved' || status === 'scheduled',
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
                    scheduledTime,
                    roomId: firestoreRoomId || roomId
                  };

                  rooms.push(room);
                  console.log('Added podcast to list:', roomId, room.title, 'Status:', room.status);
                } catch (docError) {
                  console.error('Error processing document:', docSnap.id, docError);
                }
              }

              console.log(`Total podcasts found (excluding ended): ${rooms.length}`);
              setDebugInfo(`Found ${rooms.length} podcasts (${snapshot.size} total, excluded ended ones)`);

              rooms.sort((a, b) => {
                const statusPriority = { 
                  live: 5, 
                  waiting: 4, 
                  approved: 3, 
                  scheduled: 2, 
                  "happening-soon": 1, 
                  ended: 0 
                };
                const aPriority = statusPriority[a.status] || 0;
                const bPriority = statusPriority[b.status] || 0;
                if (aPriority !== bPriority) {
                  return bPriority - aPriority;
                }
                return b.createdAt - a.createdAt;
              });

              setPodcastRooms(rooms);
              setCategories(['General', ...Array.from(foundCategories).sort()]);
              setError(null);
              setIsLoading(false);
            } catch (processError) {
              const errorMsg = getErrorMessage(processError);
              console.error('Error processing podcasts:', processError);
              setError(`Failed to process podcast data: ${errorMsg}`);
              setDebugInfo(`Processing error: ${errorMsg}`);
              setIsLoading(false);
            }
          },
          (queryError) => {
            const errorMsg = getErrorMessage(queryError);
            console.error('Firestore query error:', queryError);
            setError(`Database query failed: ${errorMsg}`);
            setDebugInfo(`Query error: ${errorMsg}`);
            setConnectionStatus('error');
            setIsLoading(false);
          }
        );
      } catch (setupError) {
        const errorMsg = getErrorMessage(setupError);
        console.error('Setup error:', setupError);
        setError(`Setup failed: ${errorMsg}`);
        setDebugInfo(`Setup error: ${errorMsg}`);
        setConnectionStatus('error');
        setIsLoading(false);
      }
    };

    fetchPodcasts();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      cleanupWebRTC();
    };
  }, [generateWebRTCRoomId, getErrorMessage, parseDateTime]);

  const filteredAndSortedRooms = useMemo(() => {
    const filtered = podcastRooms.filter(room => {
      if (room.status === 'ended') return false;

      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        room.title.toLowerCase().includes(searchLower) ||
        room.hostName?.toLowerCase().includes(searchLower) ||
        room.description?.toLowerCase().includes(searchLower) ||
        room.topic?.toLowerCase().includes(searchLower) ||
        room.speaker?.toLowerCase().includes(searchLower);

      const matchesCategory = filters.category === 'all' || room.category === filters.category;
      const matchesStatus = filters.status === 'all' || room.status === filters.status;
      return matchesSearch && matchesCategory && matchesStatus;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'participantCount':
          comparison = a.participantCount - b.participantCount;
          break;
        case 'createdAt':
        default:
          comparison = a.createdAt - b.createdAt;
          break;
      }
      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [podcastRooms, searchTerm, filters]);

  useEffect(() => {
    setFilteredRooms(filteredAndSortedRooms);
  }, [filteredAndSortedRooms]);

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

      if (!roomDoc) {
        throw new Error('Podcast not found');
      }

      const isJoinable = roomDoc.status !== 'ended';
      if (!isJoinable) {
        throw new Error('This podcast has ended and is no longer available');
      }

      if (roomDoc.date && roomDoc.time) {
        const scheduledTime = parseDateTime(roomDoc.date, roomDoc.time);
        if (Date.now() < scheduledTime) {
          const timeFormatted = formatScheduledTime(roomDoc.date, roomDoc.time);
          throw new Error(`This podcast is scheduled for ${timeFormatted}. Please wait until then to join.`);
        }
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
        participantCount: increment(1),
        status: role === 'host' ? 'live' : roomDoc.status
      });

      // Initialize WebRTC connection
      const isHost = role === 'host';
      await initializeWebRTC(roomId, webrtcRoomId, userId, userName, isHost);
      
      return { success: true, webrtcRoomId };
    } catch (error) {
      console.error('Error joining podcast:', error);
      throw error;
    }
  };

  const handleJoinPodcast = async (room: PodcastRoom) => {
    try {
      const joinability = isPodcastJoinable(room);
      
      if (!joinability.joinable) {
        alert(joinability.reason);
        return;
      }

      setDebugInfo(`Joining podcast: ${room.title}...`);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const userName = 'Podcast Listener';
      
      if (!room.webrtcRoomId) {
        throw new Error('WebRTC room ID not available');
      }
      
      const result = await joinPodcastRoom(room.id, room.webrtcRoomId, userId, userName, 'listener');
      
      if (result.success) {
        const listenerUrl = `/LivePodcast/Listener?roomId=${room.id}&webrtcRoomId=${result.webrtcRoomId}&userId=${userId}&userName=${encodeURIComponent(userName)}`;
        window.location.href = listenerUrl;
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setError(`Failed to join podcast: ${errorMsg}`);
      alert(`Failed to join podcast: ${errorMsg}`);
    }
  };

  const handleJoinAsHost = async (room: PodcastRoom) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("Please log in to join as host");
        return;
      }

      const adminQuery = query(collection(db, "adminUsers"), where("uid", "==", currentUser.uid));
      const adminSnapshot = await getDocs(adminQuery);
      
      if (adminSnapshot.empty) {
        alert("You are not authorized to join as host. Only registered users can host podcasts.");
        return;
      }

      const adminUserData = adminSnapshot.docs[0].data();
      const userName = adminUserData.name;

      if (userName !== room.hostName && userName !== room.speaker) {
        alert(`You are not the host of this podcast. Only ${room.hostName || room.speaker} can join as host.`);
        return;
      }

      const joinability = isPodcastJoinable(room);
      if (!joinability.joinable) {
        alert(joinability.reason);
        return;
      }

      setDebugInfo(`Joining as Host: ${room.title}...`);
      const userId = currentUser.uid;
      
      if (!room.webrtcRoomId) {
        throw new Error('WebRTC room ID not available');
      }
      
      const result = await joinPodcastRoom(room.id, room.webrtcRoomId, userId, userName, 'host');
      
      if (result.success) {
        const hostUrl = `/LivePodcast/Host?roomId=${room.id}&webrtcRoomId=${result.webrtcRoomId}&userId=${userId}&userName=${encodeURIComponent(userName)}`;
        window.location.href = hostUrl;
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setError(`Failed to join as host: ${errorMsg}`);
      alert(`Failed to join as host: ${errorMsg}`);
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
      case "scheduled":
        return {
          className: "bg-green-50 text-green-700 border-green-200 ring-1 ring-green-300",
          icon: "✅",
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

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setDebugInfo('Retrying...');
    window.location.reload();
  }, []);

  const handleGoToPodcastApproval = () => {
    window.location.href = '/LivePodcast/PodcastApproval';
  };

  if (error && !isLoading) {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa]">
        <Navbar />
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <div className="bg-white p-4 rounded border text-sm mb-4">
              <strong className="text-gray-700">Debug Info:</strong>
              <p className="text-gray-600 mt-1">{debugInfo}</p>
              <p className="text-gray-600">Connection Status: <span className="font-mono">{connectionStatus}</span></p>
            </div>
            <button 
              type="button"
              onClick={handleRetry} 
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-[#e7f0fa] overflow-auto relative">
      <Navbar />
      
      <button
        onClick={handleGoToPodcastApproval}
        className="fixed bottom-6 right-6 bg-[#002C84] hover:bg-[#001f6d] text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 z-50 group"
        title="Go to Podcast Approval"
      >
        <div className="flex items-center justify-center">
          <Image
            src="/ProposedPodcastIcon.svg"
            alt="Podcast Icon"
            width={24}
            height={24}
            className="w-6 h-6"
          />      
        </div>
        <div className="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-1 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          Podcast Approval
        </div>
      </button>

      <div className="fixed bottom-25 right-6">
        <a
          href="/LivePodcast/createpodcast"
          aria-label="Create Podcast"
          className="flex items-center justify-center w-16 h-16 bg-[#08326A] text-white rounded-full shadow-2xl border-4 border-white hover:bg-[#0a3f85] transition-colors"
        >
          <svg className="w-8 h-8" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        </a>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-4xl font-bold text-gray-900">Live Podcasts</h1>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            connectionStatus === 'connected' ? 'bg-green-100 text-green-800' :
            connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {connectionStatus === 'connected' && '🟢 Connected'}
            {connectionStatus === 'connecting' && '🟡 Connecting'}
            {connectionStatus === 'error' && '🔴 Disconnected'}
          </div>
        </div>
        <p className="text-xl text-gray-600">
          Join available podcasts and connect with hosts and listeners in real-time
        </p>
        <div className="mt-4 bg-blue-50 p-4 rounded text-sm text-gray-700 border border-blue-200">
          <strong>Status:</strong> {debugInfo}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <span className="text-3xl">🎙️</span>
            Available Podcasts
            {!isLoading && (
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                {filteredRooms.length} available
              </span>
            )}
          </h2>
        </div>

        <div className="p-8">
          {isLoading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
              <p className="text-gray-500 text-lg">Loading podcasts...</p>
              <p className="text-gray-400 text-sm mt-2">{debugInfo}</p>
            </div>
          ) : filteredRooms.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredRooms.map((room) => {
                const statusStyling = getStatusStyling(room.status);
                const joinability = isPodcastJoinable(room);
                const scheduledTimeStr = formatScheduledTime(room.date, room.time);
                
                return (
                  <div
                    key={room.id}
                    className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                        {room.title}
                      </h3>
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${statusStyling.className} ${statusStyling.pulse}`}
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
                      </div>
                      
                      {scheduledTimeStr && (
                        <div className="flex items-center text-gray-600">
                          <span className="mr-3 text-lg">📅</span>
                          <span className="font-medium text-xs">{scheduledTimeStr}</span>
                        </div>
                      )}

                      <div className="flex items-center text-gray-600">
                        <span className="mr-3 text-lg">👥</span>
                        <span className="font-medium">
                          {room.participantCount}/{room.maxParticipants} participants
                        </span>
                      </div>
                    </div>

                    {!joinability.joinable && joinability.reason && (
                      <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800 text-center">
                        ⏰ {joinability.reason}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleJoinPodcast(room)}
                        disabled={!joinability.joinable}
                        className={`w-full py-3 px-4 rounded-lg transition-all duration-200 text-sm font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${
                          !joinability.joinable
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                        }`}
                      >
                        <span className="mr-2">
                          {!joinability.joinable ? '🚫' : '🎧'}
                        </span>
                        {!joinability.joinable ? 'Cannot Join' : 'Join as Listener'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleJoinAsHost(room)}
                        disabled={!joinability.joinable}
                        className={`w-full py-3 px-4 rounded-lg transition-all duration-200 text-sm font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${
                          !joinability.joinable
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                        }`}
                      >
                        <span className="mr-2">👑</span>
                        Join as Host
                      </button>
                    </div>

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
                There are currently no podcasts available. Check back later or create your own!
              </p>
              <div className="bg-gray-100 p-4 rounded text-sm text-gray-600 max-w-md mx-auto mt-4">
                <strong>Debug Info:</strong> {debugInfo}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivePodcast;