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
import { FaPhoneSlash, FaMicrophone, FaMicrophoneSlash, FaHandPaper, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import Navbar from "@/app/Components/Navbar";

type ListenerStatus = "idle" | "connecting" | "connected" | "error" | "not_found" | "ended";

interface Participant {
  id: string;
  name: string;
  role: "host" | "listener";
  avatar: string;
  joinedAt: number;
  canSpeak?: boolean;
}

// Separate component that uses useSearchParams
const ListenerPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ListenerStatus>("idle");
  const [roomId, setRoomId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [roomTitle, setRoomTitle] = useState("");
  const [canSpeak, setCanSpeak] = useState(false);
  const [hasRequestedSpeak, setHasRequestedSpeak] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");

  const listenerIdRef = useRef<string>(`listener-${Date.now()}`);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const hasSetRemoteDescRef = useRef(false);
  const micInitializedRef = useRef(false);

  useEffect(() => {
    const roomParam = searchParams.get("roomId");
    const userId = searchParams.get("userId");
    if (roomParam) setRoomId(roomParam);
    if (userId) listenerIdRef.current = userId;
  }, [searchParams]);

  const generateListenerName = useCallback(() => {
    const userName = searchParams.get("userName");
    if (userName) return decodeURIComponent(userName);
    const adjectives = ["Happy", "Curious", "Friendly", "Smart", "Cool", "Bright", "Eager"];
    const nouns = ["Listener", "Fan", "Friend", "Buddy", "Guest", "Attendee"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
  }, [searchParams]);

  const initializeAudio = useCallback(async () => {
    if (audioInitialized || !remoteAudioRef.current) return;
    
    try {
      remoteAudioRef.current.volume = 1.0;
      await remoteAudioRef.current.play();
      setAudioInitialized(true);
      console.log("✅ Audio initialized successfully");
    } catch {
      console.log("⚠️ Audio autoplay blocked, waiting for user interaction");
    }
  }, [audioInitialized]);

  const createPeerConnection = useCallback((withMic: boolean = false): RTCPeerConnection => {
    console.log("🔧 Creating peer connection...", withMic ? "with microphone" : "listen only");
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ],
    });

    pc.addTransceiver("audio", { direction: withMic ? "sendrecv" : "recvonly" });

    pc.ontrack = (event) => {
      console.log("📡 Received remote track:", event.track.kind, event.track.id);
      if (remoteAudioRef.current && event.streams[0]) {
        console.log("🔊 Setting audio source");
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch((err) => {
          console.log("⚠️ Autoplay blocked:", err.message);
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        console.log("🧊 Sending ICE candidate");
        push(ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/listenerIceCandidates`), {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
          timestamp: Date.now(),
        }).catch(err => console.error("Error sending ICE candidate:", err));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("🔌 Connection state:", pc.connectionState);
      setConnectionState(pc.connectionState);
      
      if (pc.connectionState === "connected") {
        console.log("✅ WebRTC connected successfully!");
      } else if (pc.connectionState === "failed") {
        console.error("❌ Connection failed");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("🧊 ICE connection state:", pc.iceConnectionState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [roomId]);

  const sendOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      console.log("📤 Creating offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      console.log("📝 Setting local description...");
      await pc.setLocalDescription(offer);
      
      console.log("☁️ Sending offer to Firebase...");
      await set(ref(rtdb, `rooms/${roomId}/webrtc/offers/${listenerIdRef.current}`), {
        offer: { type: offer.type, sdp: offer.sdp },
        from: listenerIdRef.current,
        timestamp: Date.now(),
      });
      
      console.log("✅ Offer sent successfully");
    } catch (err) {
      console.error("❌ Error sending offer:", err);
    }
  }, [roomId]);

  const initializeMicrophone = useCallback(async () => {
    if (micInitializedRef.current) {
      console.log("🎤 Microphone already initialized");
      return localStream;
    }

    try {
      console.log("🎤 Requesting microphone access...");
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Media devices API not available. Please use HTTPS or a supported browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      console.log("✅ Microphone access granted");
      setLocalStream(stream);
      micInitializedRef.current = true;
      
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      
      return stream;
    } catch (err) {
      console.error("❌ Microphone error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to access microphone";
      alert(`Failed to access microphone: ${errorMessage}. Please check your permissions.`);
      return null;
    }
  }, [localStream]);

  const renegotiateWithMicrophone = useCallback(async () => {
    if (!peerConnectionRef.current || !roomId) return;
    
    console.log("🔄 Renegotiating connection with microphone...");
    
    const stream = await initializeMicrophone();
    if (!stream) return;

    const pc = peerConnectionRef.current;
    
    pc.close();
    hasSetRemoteDescRef.current = false;
    pendingIceCandidatesRef.current = [];
    
    const newPc = createPeerConnection(true);
    
    stream.getTracks().forEach((track) => {
      newPc.addTrack(track, stream);
      console.log("➕ Added mic track to peer connection");
    });
    
    await sendOffer(newPc);
    
    setIsMuted(true);
    console.log("✅ Renegotiation complete");
  }, [roomId, initializeMicrophone, createPeerConnection, sendOffer]);

  const joinPodcast = useCallback(async () => {
    if (!roomId.trim()) {
      setStatus("error");
      return;
    }
    
    console.log("🚀 Joining podcast:", roomId);
    setStatus("connecting");
    
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/app/Firebase/firebase");
      const roomRef = doc(db, "podcasts", roomId);
      const roomSnapshot = await getDoc(roomRef);
      
      if (!roomSnapshot.exists()) {
        console.error("❌ Room not found");
        setStatus("not_found");
        return;
      }
      
      const roomData = roomSnapshot.data();
      if (roomData.status === "ended") {
        console.log("⚠️ Podcast has ended");
        setStatus("ended");
        return;
      }
      
      if (!roomData.approved) {
        console.error("❌ Room not approved");
        setStatus("not_found");
        return;
      }
      
      setRoomTitle(roomData.title || "Live Podcast");
      
      const rtdbRoomRef = ref(rtdb, `rooms/${roomId}`);
      const rtdbSnapshot = await get(rtdbRoomRef);
      
      if (!rtdbSnapshot.exists()) {
        console.log("📝 Creating RTDB room entry");
        await set(rtdbRoomRef, {
          title: roomData.title,
          hostId: roomData.hostId,
          status: "live",
          approved: true,
          createdAt: Date.now(),
        });
      }
      
      const pc = createPeerConnection(false);
      
      const listenerData: Participant = {
        id: listenerIdRef.current,
        name: generateListenerName(),
        role: "listener",
        avatar: "👤",
        joinedAt: Date.now(),
        canSpeak: false,
      };
      
      console.log("👤 Adding listener to participants");
      await set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}`), listenerData);
      
      await sendOffer(pc);
      
      setStatus("connected");
      console.log("✅ Successfully joined podcast");
      
      setTimeout(() => initializeAudio(), 1000);
    } catch (err) {
      console.error("❌ Join error:", err);
      setStatus("error");
    }
  }, [roomId, createPeerConnection, generateListenerName, sendOffer, initializeAudio]);

  useEffect(() => {
    if (roomId && status === "idle") {
      joinPodcast();
    }
  }, [roomId, status, joinPodcast]);

  const requestToSpeak = useCallback(async () => {
    if (!roomId || hasRequestedSpeak) return;
    
    await initializeAudio();
    
    const listenerName = participants.find(p => p.id === listenerIdRef.current)?.name || generateListenerName();
    
    console.log("✋ Requesting to speak");
    await push(ref(rtdb, `rooms/${roomId}/speakRequests`), {
      participantId: listenerIdRef.current,
      participantName: listenerName,
      timestamp: Date.now(),
    });
    
    setHasRequestedSpeak(true);
    setTimeout(() => setHasRequestedSpeak(false), 30000);
  }, [roomId, hasRequestedSpeak, participants, generateListenerName, initializeAudio]);

  useEffect(() => {
    if (!roomId || status !== "connected" || !peerConnectionRef.current) return;
    
    const answerRef = ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/answer`);
    const unsubscribe = onValue(answerRef, async (snapshot) => {
      if (!snapshot.exists() || !peerConnectionRef.current) return;
      
      const data = snapshot.val();
      const pc = peerConnectionRef.current;
      
      if (pc.signalingState !== "have-local-offer") {
        console.log(`⚠️ Cannot set remote description, state is: ${pc.signalingState}`);
        return;
      }
      
      if (hasSetRemoteDescRef.current) {
        console.log("⚠️ Remote description already set, skipping");
        return;
      }
      
      try {
        console.log("📥 Setting remote description (answer)");
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: data.type,
          sdp: data.sdp,
        }));
        
        hasSetRemoteDescRef.current = true;
        console.log("✅ Remote description set successfully");
        
        console.log(`🧊 Adding ${pendingIceCandidatesRef.current.length} pending ICE candidates`);
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error adding pending ICE candidate:", err);
          }
        }
        pendingIceCandidatesRef.current = [];
        
      } catch (err) {
        console.error("❌ Error setting remote description:", err);
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
        console.log("🧊 Queueing ICE candidate (no remote description yet)");
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      
      try {
        console.log("🧊 Adding ICE candidate");
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("❌ Error adding ICE candidate:", err);
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
          participantsList.push(child.val() as Participant);
        });
        setParticipants(participantsList);
      }
    });
    
    const myParticipantRef = ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}/canSpeak`);
    const unsubCanSpeak = onValue(myParticipantRef, async (snapshot) => {
      const speakValue = snapshot.val();
      console.log("🎤 canSpeak changed:", speakValue);
      if (speakValue === true && !micInitializedRef.current) {
        console.log("🎤 Permission granted, renegotiating with microphone");
        await renegotiateWithMicrophone();
        setCanSpeak(true);
        setHasRequestedSpeak(false);
      } else if (speakValue === true) {
        setCanSpeak(true);
        setHasRequestedSpeak(false);
      } else if (speakValue === false) {
        console.log("🔇 Speaking permission revoked");
        setCanSpeak(false);
        setIsMuted(true);
        if (localStream) {
          localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
        }
      }
    });
    
    const statusRef = ref(rtdb, `rooms/${roomId}/status`);
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists() && snapshot.val() === "ended") {
        console.log("📢 Podcast ended by host");
        setStatus("ended");
      }
    });
    
    return () => {
      unsubParticipants();
      unsubCanSpeak();
      unsubStatus();
    };
  }, [roomId, status, localStream, renegotiateWithMicrophone]);

  const handleLeaveCall = useCallback(async () => {
    console.log("👋 Leaving call...");
    
    localStream?.getTracks().forEach((track) => {
      track.stop();
      console.log("🛑 Stopped track:", track.kind);
    });
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log("🔌 Closed peer connection");
    }
    
    if (roomId) {
      await remove(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}`));
      await remove(ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}`));
      console.log("🗑️ Removed from participants");
    }
    
    router.push("/LivePodcast");
  }, [localStream, roomId, router]);

  const toggleMute = useCallback(() => {
    if (!localStream || !canSpeak) return;
    
    const newMutedState = !isMuted;
    
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !newMutedState;
    });
    
    setIsMuted(newMutedState);
    console.log(`🎤 Microphone ${newMutedState ? 'muted' : 'unmuted'}`);
    
    if (roomId) {
      set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}/muted`), newMutedState);
    }
  }, [localStream, canSpeak, isMuted, roomId]);

  const toggleAudioOutput = useCallback(async () => {
    if (remoteAudioRef.current) {
      const newMutedState = !isAudioMuted;
      
      if (!newMutedState) {
        remoteAudioRef.current.muted = false;
        try {
          await remoteAudioRef.current.play();
          console.log("🔊 Audio unmuted and playing");
        } catch (err) {
          console.error("Error playing audio:", err);
        }
      } else {
        remoteAudioRef.current.muted = true;
        console.log("🔇 Audio muted");
      }
      
      setIsAudioMuted(newMutedState);
      
      if (!audioInitialized) {
        setAudioInitialized(true);
      }
    }
  }, [isAudioMuted, audioInitialized]);

  const handleUserInteraction = useCallback(() => {
    if (!audioInitialized) {
      initializeAudio();
    }
  }, [audioInitialized, initializeAudio]);

  useEffect(() => {
    const currentRoomId = roomId;
    const currentListenerId = listenerIdRef.current;
    
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (currentRoomId && currentListenerId) {
        remove(ref(rtdb, `rooms/${currentRoomId}/participants/${currentListenerId}`));
        remove(ref(rtdb, `rooms/${currentRoomId}/webrtc/${currentListenerId}`));
      }
    };
  }, [roomId, localStream]);

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
              {canSpeak && (
                <span className="flex items-center space-x-1 text-green-600 font-semibold">
                  <FaMicrophone size={14} />
                  <span>Speaking Enabled</span>
                </span>
              )}
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
                Click anywhere to enable audio
              </p>
            )}
          </div>
        </div>

        <div className="p-8">
          {hostParticipant && (
            <div className="mb-8 text-center">
              <div className="w-40 h-40 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-7xl shadow-2xl">
                {hostParticipant.avatar}
              </div>
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
                  <div key={p.id} className="flex flex-col items-center">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl relative transition-all ${
                      p.canSpeak ? "bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg scale-110" : 
                      "bg-gray-300 text-gray-700"
                    }`}>
                      {p.avatar}
                      {p.canSpeak && (
                        <div className="absolute -top-1 -right-1 bg-green-400 w-4 h-4 rounded-full animate-pulse border-2 border-white"></div>
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
          <div className="flex justify-center items-center space-x-4">
            <button
              onClick={toggleAudioOutput}
              className={`p-5 rounded-full transition-all shadow-lg transform hover:scale-110 ${
                isAudioMuted ? "bg-gray-600 hover:bg-gray-700" : "bg-green-600 hover:bg-green-700"
              } text-white`}
              title={isAudioMuted ? "Unmute audio" : "Mute audio"}
            >
              {isAudioMuted ? <FaVolumeMute size={28} /> : <FaVolumeUp size={28} />}
            </button>

            {!canSpeak ? (
              <button
                onClick={requestToSpeak}
                disabled={hasRequestedSpeak}
                className={`p-5 rounded-full transition-all shadow-lg transform hover:scale-110 ${
                  hasRequestedSpeak ? "bg-yellow-500 cursor-wait" : "bg-blue-600 hover:bg-blue-700"
                } text-white disabled:opacity-75`}
                title={hasRequestedSpeak ? "Request sent" : "Request to speak"}
              >
                <FaHandPaper size={28} />
              </button>
            ) : (
              <button
                onClick={toggleMute}
                className={`p-5 rounded-full transition-all shadow-lg transform hover:scale-110 ${
                  isMuted ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? <FaMicrophoneSlash size={28} /> : <FaMicrophone size={28} />}
              </button>
            )}

            <button
              onClick={handleLeaveCall}
              className="p-5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all shadow-lg transform hover:scale-110"
              title="Leave podcast"
            >
              <FaPhoneSlash size={28} />
            </button>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm font-semibold text-gray-700">
              {canSpeak
                ? (isMuted ? "Speaking (microphone muted)" : "Speaking (microphone active)")
                : hasRequestedSpeak
                ? "Request sent, waiting for approval..."
                : "Listening"
              }
            </p>
            {audioInitialized && (
              <p className="text-xs text-green-600 mt-2 font-medium">Audio enabled</p>
            )}
          </div>
        </div>

        <audio 
          ref={remoteAudioRef} 
          autoPlay 
          playsInline
          muted={isAudioMuted}
          className="hidden"
        />
      </div>
    </div>
  );
};

// Loading fallback component
const LoadingFallback = () => (
  <div className="ml-[260px] min-h-screen p-6 bg-gray-50 flex items-center justify-center">
    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
      <p className="text-blue-600 text-lg font-semibold">Loading...</p>
    </div>
  </div>
);

// Main exported component with Suspense boundary
const ListenerPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ListenerPageContent />
    </Suspense>
  );
};

export default ListenerPage;