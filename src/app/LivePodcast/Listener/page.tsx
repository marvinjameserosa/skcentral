"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { rtdb } from "@/app/Firebase/firebase";
import {
  ref,
  set,
  get,
  onValue,
  onChildAdded,
  remove,
  push,
} from "firebase/database";
import { FaPhoneSlash, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import Navbar from "@/app/Components/Navbar";
import { auth, db } from "@/app/Firebase/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type ListenerStatus = "idle" | "connecting" | "connected" | "error" | "not_found" | "ended";

interface Participant {
  id: string;
  name: string;
  role: "host" | "listener";
  avatar: string;
  joinedAt: number;
  emoji?: string;
  emojiTimestamp?: number;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "🤔"];

const ListenerPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ListenerStatus>("idle");
  const [roomId, setRoomId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomTitle, setRoomTitle] = useState("");
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const [hostVideoStream, setHostVideoStream] = useState<MediaStream | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string>("");

  const listenerIdRef = useRef<string>(`listener-${Date.now()}`);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const hasSetRemoteDescRef = useRef(false);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const roomParam = searchParams.get("roomId");
    const userId = searchParams.get("userId");
    if (roomParam) setRoomId(roomParam);
    if (userId) listenerIdRef.current = userId;
  }, [searchParams]);

  // Fetch user name from adminUsers collection
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(collection(db, "adminUsers"), where("uid", "==", user.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            const name = userData.name || "Podcast Listener";
            setUserDisplayName(name);
            console.log("[Listener] User name fetched:", name);
          } else {
            setUserDisplayName("Podcast Listener");
            console.log("[Listener] No user data found, using default name");
          }
        } catch (error) {
          console.error("[Listener] Error fetching user name:", error);
          setUserDisplayName("Podcast Listener");
        }
      } else {
        setUserDisplayName("Podcast Listener");
      }
    });

    return () => unsubscribe();
  }, []);

  const generateListenerName = useCallback(() => {
    // If we have a user display name from the database, use it
    if (userDisplayName) {
      return userDisplayName;
    }
    
    // Otherwise check URL parameter
    const userName = searchParams.get("userName");
    if (userName) return decodeURIComponent(userName);
    
    // Fallback to random name
    const adjectives = ["Happy", "Curious", "Friendly", "Smart", "Cool", "Bright", "Eager"];
    const nouns = ["Listener", "Fan", "Friend", "Buddy", "Guest", "Attendee"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
  }, [searchParams, userDisplayName]);

  const createAudioElement = useCallback((participantId: string, stream: MediaStream) => {
    console.log(`[Listener] 🔊 Creating audio element for ${participantId}`);
    
    const oldAudio = audioElementsRef.current.get(participantId);
    if (oldAudio) {
      oldAudio.pause();
      oldAudio.srcObject = null;
      oldAudio.remove();
      console.log(`[Listener] Removed old audio element for ${participantId}`);
    }

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = isAudioMuted;
    audio.srcObject = stream;
    audio.volume = 1.0;
    
    if (audioContainerRef.current) {
      audioContainerRef.current.appendChild(audio);
    }
    
    audio.play().then(() => {
      console.log(`[Listener] ✅ Audio playing for ${participantId}`);
    }).catch((err) => {
      console.log(`[Listener] Autoplay blocked for ${participantId}:`, err.message);
    });

    audioElementsRef.current.set(participantId, audio);
    remoteStreamsRef.current.set(participantId, stream);
  }, [isAudioMuted]);

  const initializeAudio = useCallback(async () => {
    if (audioInitialized) return;
    
    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.muted = false;
        await remoteAudioRef.current.play();
      }
      
      audioElementsRef.current.forEach(async (audio) => {
        audio.muted = false;
        audio.volume = 1.0;
        try {
          await audio.play();
        } catch (err) {
          console.log("[Listener] Audio play blocked:", err);
        }
      });
      
      setAudioInitialized(true);
      setIsAudioMuted(false);
      console.log("[Listener] ✅ Audio initialized - speakers enabled");
    } catch {
      console.log("[Listener] Audio autoplay blocked, waiting for user interaction");
    }
  }, [audioInitialized]);

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    console.log("[Listener] Creating peer connection (listen only)");
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ],
    });

    // Add audio transceiver (recvonly)
    pc.addTransceiver("audio", { direction: "recvonly" });
    // Add video transceiver (recvonly) for host viewing
    pc.addTransceiver("video", { direction: "recvonly" });

    pc.ontrack = (event) => {
      console.log("[Listener] Received remote track:", event.track.kind);
      if (event.track.kind === "audio") {
        if (event.streams[0]) {
          console.log("[Listener] 🔊 Creating audio element for incoming audio (host audio)");
          createAudioElement(`host-audio-${Date.now()}`, event.streams[0]);
          
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.muted = isAudioMuted;
            remoteAudioRef.current.volume = 1.0;
            remoteAudioRef.current.play().catch((err) => {
              console.log("[Listener] Autoplay blocked:", err.message);
            });
            console.log("[Listener] 🔊 Host audio attached to main audio element");
          }
        }
      } else if (event.track.kind === "video") {
        if (event.streams[0]) {
          console.log("[Listener] 🎥 Received host video stream");
          setHostVideoStream(event.streams[0]);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        console.log("[Listener] Sending ICE candidate");
        push(ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/listenerIceCandidates`), {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
          timestamp: Date.now(),
        }).catch(err => console.error("[Listener] Error sending ICE candidate:", err));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[Listener] Connection state:", pc.connectionState);
      setConnectionState(pc.connectionState);
      
      if (pc.connectionState === "connected") {
        console.log("[Listener] ✅ WebRTC connected!");
        console.log("[Listener] ✅ Receiving host stream!");
      } else if (pc.connectionState === "failed") {
        console.error("[Listener] ❌ Connection failed");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[Listener] ICE connection state:", pc.iceConnectionState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [roomId, createAudioElement, isAudioMuted]);

  const sendOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      console.log("[Listener] Creating offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      console.log("[Listener] Setting local description...");
      await pc.setLocalDescription(offer);
      
      console.log("[Listener] Sending offer to Firebase...");
      await set(ref(rtdb, `rooms/${roomId}/webrtc/offers/${listenerIdRef.current}`), {
        offer: { type: offer.type, sdp: offer.sdp },
        from: listenerIdRef.current,
        timestamp: Date.now(),
      });
      
      console.log("[Listener] ✅ Offer sent successfully");
    } catch (err) {
      console.error("[Listener] ❌ Error sending offer:", err);
    }
  }, [roomId]);

  const joinPodcast = useCallback(async () => {
    if (!roomId.trim()) {
      setStatus("error");
      return;
    }
    
    console.log("[Listener] 📡 Joining podcast:", roomId);
    setStatus("connecting");
    
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/app/Firebase/firebase");
      const roomRef = doc(db, "podcasts", roomId);
      const roomSnapshot = await getDoc(roomRef);
      
      if (!roomSnapshot.exists()) {
        console.error("[Listener] ❌ Room not found");
        setStatus("not_found");
        return;
      }
      
      const roomData = roomSnapshot.data();
      if (roomData.status === "ended") {
        console.log("[Listener] Podcast has ended");
        setStatus("ended");
        return;
      }
      
      if (!roomData.approved) {
        console.error("[Listener] ❌ Room not approved");
        setStatus("not_found");
        return;
      }
      
      setRoomTitle(roomData.title || "Live Podcast");
      
      const rtdbRoomRef = ref(rtdb, `rooms/${roomId}`);
      const rtdbSnapshot = await get(rtdbRoomRef);
      
      if (!rtdbSnapshot.exists()) {
        console.log("[Listener] Creating RTDB room entry");
        await set(rtdbRoomRef, {
          title: roomData.title,
          hostId: roomData.hostId,
          status: "live",
          approved: true,
          createdAt: Date.now(),
        });
      }
      
      const pc = createPeerConnection();
      
      const listenerData: Participant = {
        id: listenerIdRef.current,
        name: generateListenerName(),
        role: "listener",
        avatar: "👤",
        joinedAt: Date.now(),
      };
      
      console.log("[Listener] Adding listener to participants with name:", listenerData.name);
      await set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}`), listenerData);
      
      await sendOffer(pc);
      
      setStatus("connected");
      console.log("[Listener] ✅ Successfully joined podcast");
      
      setTimeout(() => initializeAudio(), 1000);
    } catch (err) {
      console.error("[Listener] ❌ Join error:", err);
      setStatus("error");
    }
  }, [roomId, createPeerConnection, generateListenerName, sendOffer, initializeAudio]);

  useEffect(() => {
    if (roomId && status === "idle" && userDisplayName) {
      joinPodcast();
    }
  }, [roomId, status, userDisplayName, joinPodcast]);

  const sendEmojiReaction = useCallback(async (emoji: string) => {
    if (!roomId) return;
    
    console.log("[Listener] 😊 Sending emoji reaction:", emoji);
    
    await set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}/emoji`), emoji);
    await set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}/emojiTimestamp`), Date.now());
    
    setShowEmojiPicker(false);
    
    setTimeout(async () => {
      await set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}/emoji`), null);
    }, 3000);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || status !== "connected" || !peerConnectionRef.current) return;
    
    const answerRef = ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/answer`);
    const unsubscribe = onValue(answerRef, async (snapshot) => {
      if (!snapshot.exists() || !peerConnectionRef.current) return;
      
      const data = snapshot.val();
      const pc = peerConnectionRef.current;
      
      if (pc.signalingState !== "have-local-offer") {
        console.log(`[Listener] Cannot set remote description, state is: ${pc.signalingState}`);
        return;
      }
      
      if (hasSetRemoteDescRef.current) {
        console.log("[Listener] Remote description already set, skipping");
        return;
      }
      
      try {
        console.log("[Listener] Setting remote description (answer)");
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: data.type,
          sdp: data.sdp,
        }));
        
        hasSetRemoteDescRef.current = true;
        console.log("[Listener] ✅ Remote description set successfully");
        
        console.log(`[Listener] Adding ${pendingIceCandidatesRef.current.length} pending ICE candidates`);
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("[Listener] Error adding pending ICE candidate:", err);
          }
        }
        pendingIceCandidatesRef.current = [];
        
      } catch (err) {
        console.error("[Listener] ❌ Error setting remote description:", err);
      }
    });
    
    return () => unsubscribe();
  }, [roomId, status]);

  useEffect(() => {
    if (!roomId || status !== "connected") return;
    
    const iceRef = ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/hostIceCandidates`);
    const unsubscribe = onChildAdded(iceRef, async (snapshot) => {
      if (!snapshot.exists() || !peerConnectionRef.current) return;
      
      const data = snapshot.val();
      const pc = peerConnectionRef.current;
      
      if (!data?.candidate) return;
      
      const candidate: RTCIceCandidateInit = {
        candidate: data.candidate,
        sdpMLineIndex: data.sdpMLineIndex,
        sdpMid: data.sdpMid,
      };
      
      if (!pc.remoteDescription) {
        console.log("[Listener] Queueing ICE candidate (no remote description yet)");
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      
      try {
        console.log("[Listener] Adding ICE candidate");
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[Listener] Error adding ICE candidate:", err);
      }
    });
    
    return () => unsubscribe();
  }, [roomId, status]);

  useEffect(() => {
    if (!roomId || status !== "connected") return;
    
    const participantsRef = ref(rtdb, `rooms/${roomId}/participants`);
    const unsubParticipants = onValue(participantsRef, (snapshot) => {
      if (snapshot.exists()) {
        const participantsList: Participant[] = [];
        snapshot.forEach((child) => {
          const participantData = child.val() as Participant;
          participantsList.push(participantData);
          
          // Auto-clear emoji after 3 seconds
          if (participantData.emoji && participantData.emojiTimestamp) {
            const timeSinceEmoji = Date.now() - participantData.emojiTimestamp;
            if (timeSinceEmoji < 3000) {
              setTimeout(() => {
                set(ref(rtdb, `rooms/${roomId}/participants/${participantData.id}/emoji`), null);
              }, 3000 - timeSinceEmoji);
            }
          }
        });
        setParticipants(participantsList);
      }
    });
    
    const statusRef = ref(rtdb, `rooms/${roomId}/status`);
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists() && snapshot.val() === "ended") {
        console.log("[Listener] Podcast ended by host");
        setStatus("ended");
      }
    });
    
    return () => {
      unsubParticipants();
      unsubStatus();
    };
  }, [roomId, status]);

  const handleLeaveCall = useCallback(async () => {
    console.log("[Listener] Leaving call...");
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log("[Listener] Closed peer connection");
    }

    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();
    remoteStreamsRef.current.clear();
    
    if (roomId) {
      await remove(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}`));
      await remove(ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}`));
      console.log("[Listener] Removed from participants");
    }
    
    router.push("/LivePodcast");
  }, [roomId, router]);

  const toggleAudioOutput = useCallback(async () => {
    const newMutedState = !isAudioMuted;
    
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = newMutedState;
      if (!newMutedState) {
        try {
          await remoteAudioRef.current.play();
          console.log("[Listener] 🔊 Main audio unmuted");
        } catch (err) {
          console.error("[Listener] Error playing audio:", err);
        }
      } else {
        console.log("[Listener] 🔇 Main audio muted");
      }
    }
    
    audioElementsRef.current.forEach((audio) => {
      audio.muted = newMutedState;
      if (!newMutedState) {
        audio.play().catch(err => console.log("[Listener] Audio play blocked:", err));
      }
    });
    
    setIsAudioMuted(newMutedState);
    console.log(`[Listener] 🔊 All audio ${newMutedState ? 'muted' : 'unmuted'}`);
    
    if (!audioInitialized) {
      setAudioInitialized(true);
    }
  }, [isAudioMuted, audioInitialized]);

  const handleUserInteraction = useCallback(() => {
    if (!audioInitialized) {
      initializeAudio();
    }
  }, [audioInitialized, initializeAudio]);

  useEffect(() => {
    const currentAudioElements = audioElementsRef.current;
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      currentAudioElements.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
    };
  }, []);

  if (status !== "connected") {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          {status === "connecting" && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
              <p className="text-blue-600 text-lg font-semibold">Connecting to podcast...</p>
              <p className="text-sm text-gray-500 mt-2">Room: {roomId}</p>
            </>
          )}
          {status === "not_found" && (
            <>
              <p className="text-red-600 text-lg mb-4 font-semibold">Room not found</p>
              <p className="text-sm text-gray-500 mb-4">Room ID: {roomId}</p>
              <button
                onClick={() => router.push("/LivePodcast")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition"
              >
                Back to Podcasts
              </button>
            </>
          )}
          {status === "error" && (
            <>
              <p className="text-red-600 text-lg mb-4 font-semibold">Connection failed</p>
              <div className="space-x-2">
                <button
                  onClick={joinPodcast}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                >
                  Retry
                </button>
                <button
                  onClick={() => router.push("/LivePodcast")}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
                >
                  Back
                </button>
              </div>
            </>
          )}
          {status === "ended" && (
            <>
              <p className="text-yellow-600 text-lg mb-4 font-semibold">Podcast has ended</p>
              <p className="text-sm text-gray-500 mb-4">Thanks for listening!</p>
              <button
                onClick={() => router.push("/LivePodcast")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition"
              >
                Back to Podcasts
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const hostParticipant = participants.find(p => p.role === "host");
  const listenerParticipants = participants.filter(p => p.role === "listener");

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-gray-50" onClick={handleUserInteraction}>
      <Navbar />
      
      <div ref={audioContainerRef} className="hidden" />
      
      <div className="bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2 text-gray-800">{roomTitle}</h1>
            <div className="flex justify-center items-center flex-wrap gap-3 text-sm">
              <span className="flex items-center space-x-1 bg-red-100 px-3 py-1 rounded-full text-red-800 font-semibold">
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                <span>LIVE</span>
              </span>
              <span className="text-gray-600 font-medium">
                {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                connectionState === "connected" ? "bg-green-100 text-green-700" :
                connectionState === "connecting" ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {connectionState}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Room: {roomId}</p>
            {!audioInitialized && (
              <p className="text-sm text-orange-600 mt-3 animate-pulse font-medium">
                🔊 Click anywhere to enable audio
              </p>
            )}
          </div>
        </div>

        <div className="p-8">
          {hostParticipant && (
            <div className="mb-8 text-center relative">
              {hostVideoStream ? (
                <video
                  className="w-80 h-80 mx-auto rounded-xl shadow-xl"
                  autoPlay
                  playsInline
                  muted={isAudioMuted}
                  style={{ objectFit: "cover" }}
                  ref={(video) => {
                    if (video && hostVideoStream) {
                      video.srcObject = hostVideoStream;
                      video.play().catch(err => console.log(err));
                    }
                  }}
                />
              ) : (
                <div className="w-40 h-40 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-7xl shadow-2xl relative">
                  {hostParticipant.avatar}
                  {hostParticipant.emoji && (
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-5xl animate-bounce">
                      {hostParticipant.emoji}
                    </div>
                  )}
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-800">{hostParticipant.name}</h2>
              <p className="text-blue-600 font-semibold text-lg">Host</p>
            </div>
          )}

          {listenerParticipants.length > 0 && (
            <div className="w-full">
              <h3 className="text-lg font-semibold text-center text-gray-700 mb-6">
                Listeners ({listenerParticipants.length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                {listenerParticipants.map((p) => (
                  <div key={p.id} className="flex flex-col items-center relative">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl relative bg-gray-300 text-gray-700">
                      {p.avatar}
                      {p.emoji && (
                        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-3xl animate-bounce">
                          {p.emoji}
                        </div>
                      )}
                      {p.id === listenerIdRef.current && (
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 bg-purple-500 text-white text-xs px-2 rounded-full">
                          You
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-center truncate w-full font-medium">
                      {p.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-gradient-to-b from-gray-50 to-gray-100 border-t">
          <div className="flex justify-center items-center space-x-4 mb-4">
            <button
              onClick={toggleAudioOutput}
              className={`p-5 rounded-full transition-all shadow-lg transform hover:scale-110 ${
                isAudioMuted ? "bg-gray-600 hover:bg-gray-700" : "bg-green-600 hover:bg-green-700"
              } text-white`}
              title={isAudioMuted ? "Unmute speakers (hear host)" : "Mute speakers"}
            >
              {isAudioMuted ? <FaVolumeMute size={28} /> : <FaVolumeUp size={28}/>}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full transition-all shadow-lg transform hover:scale-110 text-2xl"
                title="Send reaction"
              >
                😊
              </button>
              
              {showEmojiPicker && (
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl p-3 grid grid-cols-4 gap-2 z-10 w-80">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      disabled={reactionCooldown}
                      onClick={() => {
                        if (!reactionCooldown) {
                          sendEmojiReaction(emoji);
                          setReactionCooldown(true);
                          setTimeout(() => setReactionCooldown(false), 3000);
                        }
                      }}
                      className="text-3xl hover:scale-125 transition-transform p-2 hover:bg-gray-100 rounded disabled:opacity-50"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleLeaveCall}
              className="p-5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all shadow-lg transform hover:scale-110"
              title="Leave podcast"
            >
              <FaPhoneSlash size={28} />
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">
              👂 Listening Mode
            </p>
            {audioInitialized && !isAudioMuted && (
              <p className="text-xs text-green-600 mt-2 font-medium">
                🔊 Speakers enabled - hearing host
              </p>
            )}
            {isAudioMuted && (
              <p className="text-xs text-orange-600 mt-2 font-medium">🔇 Speakers muted</p>
            )}
          </div>
        </div>

        <audio 
          ref={remoteAudioRef} 
          autoPlay 
          playsInline
          className="hidden"
        />
      </div>
    </div>
  );
};

const LoadingFallback = () => (
  <div className="ml-[260px] min-h-screen p-6 bg-gray-50 flex items-center justify-center">
    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
      <p className="text-blue-600 text-lg font-semibold">Loading...</p>
    </div>
  </div>
);

const ListenerPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ListenerPageContent />
    </Suspense>
  );
};

export default ListenerPage;