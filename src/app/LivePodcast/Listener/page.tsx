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

type ListenerStatus = "idle" | "connecting" | "connected" | "error" | "not_found" | "ended";

interface Participant {
  id: string;
  name: string;
  role: "host" | "listener";
  avatar: string;
  joinedAt: number;
}

interface EmojiReaction {
  id: string;
  participantId: string;
  emoji: string;
  timestamp: number;
}

const EMOJI_OPTIONS = [
  { emoji: "😊", label: "Happy" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👍", label: "Like" },
  { emoji: "😠", label: "Angry" },
  { emoji: "📚", label: "Study" },
  { emoji: "✌️", label: "Peace" },
  { emoji: "😲", label: "Surprise" },
  { emoji: "😂", label: "Funny" },
];

const ListenerPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ListenerStatus>("idle");
  const [roomId, setRoomId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomTitle, setRoomTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [listenerName, setListenerName] = useState("");
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  const [reactions, setReactions] = useState<Map<string, EmojiReaction[]>>(new Map());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isReactionAnimating, setIsReactionAnimating] = useState(false);

  const listenerIdRef = useRef<string>(`listener-${Date.now()}`);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const hasSetRemoteDescRef = useRef(false);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const roomParam = searchParams.get("roomId");
    const userId = searchParams.get("userId");
    if (roomParam) setRoomId(roomParam);
    if (userId) listenerIdRef.current = userId;
  }, [searchParams]);

  const fetchUserName = useCallback(async (uid: string): Promise<string> => {
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/app/Firebase/firebase");
      
      // Try to fetch from ApprovedUsers first
      const approvedUserRef = doc(db, "ApprovedUsers", uid);
      const approvedUserSnapshot = await getDoc(approvedUserRef);
      
      if (approvedUserSnapshot.exists()) {
        const userData = approvedUserSnapshot.data();
        const firstName = userData.firstName || "";
        const lastName = userData.lastName || "";
        if (firstName || lastName) {
          return `${firstName} ${lastName}`.trim();
        }
      }
      
      // If not found in ApprovedUsers, try adminUsers
      const adminUserRef = doc(db, "adminUsers", uid);
      const adminUserSnapshot = await getDoc(adminUserRef);
      
      if (adminUserSnapshot.exists()) {
        const userData = adminUserSnapshot.data();
        // Fallback to name field if firstName/lastName not available
        if (userData.name) {
          return userData.name;
        }
      }
      
      return "Podcast Listener";
    } catch (error) {
      console.error("Error fetching user name:", error);
      return "Podcast Listener";
    }
  }, []);

  const sendReaction = useCallback(async (emoji: string) => {
    if (!roomId || isReactionAnimating) return;
    
    setIsReactionAnimating(true);
    
    const reactionData = {
      participantId: listenerIdRef.current,
      emoji,
      timestamp: Date.now(),
    };
    
    await push(ref(rtdb, `rooms/${roomId}/reactions`), reactionData);
    setShowEmojiPicker(false);
    
    setTimeout(() => {
      setIsReactionAnimating(false);
    }, 3000);
  }, [roomId, isReactionAnimating]);

  useEffect(() => {
    if (!roomId || status !== "connected") return;
    
    const reactionsRef = ref(rtdb, `rooms/${roomId}/reactions`);
    const unsubscribe = onChildAdded(reactionsRef, (snapshot) => {
      const reaction = snapshot.val() as EmojiReaction;
      const reactionId = snapshot.key || `${Date.now()}`;
      const reactionWithId = { ...reaction, id: reactionId };
      
      setReactions((prev) => {
        const newReactions = new Map(prev);
        const participantReactions = newReactions.get(reaction.participantId) || [];
        newReactions.set(reaction.participantId, [...participantReactions, reactionWithId]);
        return newReactions;
      });
      
      setTimeout(async () => {
        setReactions((prev) => {
          const newReactions = new Map(prev);
          const participantReactions = newReactions.get(reaction.participantId) || [];
          const filtered = participantReactions.filter((r) => r.id !== reactionId);
          if (filtered.length > 0) {
            newReactions.set(reaction.participantId, filtered);
          } else {
            newReactions.delete(reaction.participantId);
          }
          return newReactions;
        });
        
        await remove(ref(rtdb, `rooms/${roomId}/reactions/${reactionId}`));
      }, 3000);
    });
    
    return () => unsubscribe();
  }, [roomId, status]);

  const createAudioElement = useCallback((participantId: string, stream: MediaStream) => {
    const oldAudio = audioElementsRef.current.get(participantId);
    if (oldAudio) {
      oldAudio.pause();
      oldAudio.srcObject = null;
      oldAudio.remove();
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
    
    audio.play().catch(() => {});
    audioElementsRef.current.set(participantId, audio);
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
        } catch {}
      });
      
      setAudioInitialized(true);
      setIsAudioMuted(false);
    } catch {}
  }, [audioInitialized]);

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        createAudioElement(`host-${Date.now()}`, event.streams[0]);
        
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.muted = isAudioMuted;
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        push(ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/listenerIceCandidates`), {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
          timestamp: Date.now(),
        }).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [roomId, createAudioElement, isAudioMuted]);

  const sendOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      await pc.setLocalDescription(offer);
      
      await set(ref(rtdb, `rooms/${roomId}/webrtc/offers/${listenerIdRef.current}`), {
        offer: { type: offer.type, sdp: offer.sdp },
        from: listenerIdRef.current,
        timestamp: Date.now(),
      });
    } catch {}
  }, [roomId]);

  const joinPodcast = useCallback(async () => {
    if (!roomId.trim()) {
      setStatus("error");
      return;
    }
    
    setStatus("connecting");
    
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/app/Firebase/firebase");
      const roomRef = doc(db, "podcasts", roomId);
      const roomSnapshot = await getDoc(roomRef);
      
      if (!roomSnapshot.exists()) {
        setStatus("not_found");
        return;
      }
      
      const roomData = roomSnapshot.data();
      if (roomData.status === "ended") {
        setStatus("ended");
        return;
      }
      
      if (!roomData.approved) {
        setStatus("not_found");
        return;
      }
      
      setRoomTitle(roomData.title || "Live Podcast");
      
      // Fetch host name from podcast data
      const fetchedHostName = roomData.hostName || "Host";
      setHostName(fetchedHostName);
      
      // Fetch listener's real name
      const userId = searchParams.get("userId") || listenerIdRef.current;
      const fetchedListenerName = await fetchUserName(userId);
      setListenerName(fetchedListenerName);
      
      const rtdbRoomRef = ref(rtdb, `rooms/${roomId}`);
      const rtdbSnapshot = await get(rtdbRoomRef);
      
      if (!rtdbSnapshot.exists()) {
        await set(rtdbRoomRef, {
          title: roomData.title,
          hostId: roomData.hostId,
          hostName: fetchedHostName,
          status: "live",
          approved: true,
          createdAt: Date.now(),
        });
      }
      
      const pc = createPeerConnection();
      
      const listenerData: Participant = {
        id: listenerIdRef.current,
        name: fetchedListenerName,
        role: "listener",
        avatar: "👤",
        joinedAt: Date.now(),
      };
      
      await set(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}`), listenerData);
      await sendOffer(pc);
      setStatus("connected");
      
      setTimeout(() => initializeAudio(), 1000);
    } catch (error) {
      console.error("Error joining podcast:", error);
      setStatus("error");
    }
  }, [roomId, createPeerConnection, sendOffer, initializeAudio, fetchUserName, searchParams]);

  useEffect(() => {
    if (roomId && status === "idle") {
      joinPodcast();
    }
  }, [roomId, status, joinPodcast]);

  useEffect(() => {
    if (!roomId || status !== "connected" || !peerConnectionRef.current) return;
    
    const answerRef = ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}/answer`);
    const unsubscribe = onValue(answerRef, async (snapshot) => {
      if (!snapshot.exists() || !peerConnectionRef.current) return;
      
      const data = snapshot.val();
      const pc = peerConnectionRef.current;
      
      if (pc.signalingState !== "have-local-offer" || hasSetRemoteDescRef.current) return;
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: data.type,
          sdp: data.sdp,
        }));
        
        hasSetRemoteDescRef.current = true;
        
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {}
        }
        pendingIceCandidatesRef.current = [];
      } catch {}
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
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
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
    
    const statusRef = ref(rtdb, `rooms/${roomId}/status`);
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists() && snapshot.val() === "ended") {
        setStatus("ended");
      }
    });
    
    return () => {
      unsubParticipants();
      unsubStatus();
    };
  }, [roomId, status]);

  const handleLeaveCall = useCallback(async () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();
    
    if (roomId) {
      await remove(ref(rtdb, `rooms/${roomId}/participants/${listenerIdRef.current}`));
      await remove(ref(rtdb, `rooms/${roomId}/webrtc/${listenerIdRef.current}`));
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
        } catch {}
      }
    }
    
    audioElementsRef.current.forEach((audio) => {
      audio.muted = newMutedState;
      if (!newMutedState) {
        audio.play().catch(() => {});
      }
    });
    
    setIsAudioMuted(newMutedState);
    
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
      
      {showEmojiPicker && (
        <div 
          onClick={() => setShowEmojiPicker(false)} 
          className="fixed inset-0 z-40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-32 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl p-6 border-2 border-gray-200 z-50 w-96"
          >
            <div className="grid grid-cols-4 gap-4">
              {EMOJI_OPTIONS.map((option) => (
                <button
                  key={option.emoji}
                  onClick={() => sendReaction(option.emoji)}
                  disabled={isReactionAnimating}
                  className={`flex flex-col items-center p-4 rounded-lg transition ${
                    isReactionAnimating 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-gray-100 cursor-pointer'
                  }`}
                  title={option.label}
                >
                  <span className="text-4xl mb-1">{option.emoji}</span>
                  <span className="text-xs text-gray-600">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2 text-gray-800">{roomTitle}</h1>
            <div className="flex justify-center items-center flex-wrap gap-3 text-sm">
              <span className="flex items-center space-x-1 bg-red-100 px-3 py-1 rounded-full text-red-800 font-semibold">
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                <span>🔴 LIVE</span>
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
            {!audioInitialized && (
              <p className="text-sm text-orange-600 mt-3 animate-pulse font-medium">
                🔊 Click anywhere to enable audio
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
              <h2 className="text-2xl font-bold text-gray-800">
                {hostName || hostParticipant.name}
              </h2>
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
                    <div className="relative inline-block">
                      <div className="w-14 h-14 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center text-xl">
                        {p.avatar}
                      </div>
                      {reactions.get(p.id)?.map((reaction) => (
                        <div
                          key={reaction.id}
                          className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-3xl z-20"
                          style={{ animation: "float-up 3s ease-out forwards" }}
                        >
                          {reaction.emoji}
                        </div>
                      ))}
                      {p.id === listenerIdRef.current && (
                        <div className="absolute -bottom-1 right-0 bg-purple-500 text-white text-xs px-2 rounded-full z-10">
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
              className={`p-5 rounded-full transition-all shadow-lg transform hover:scale-110 ${isAudioMuted ? "bg-gray-600 hover:bg-gray-700" : "bg-green-600 hover:bg-green-700"} text-white`}
              title={isAudioMuted ? "Unmute speakers" : "Mute speakers"}
            >
              {isAudioMuted ? <FaVolumeMute size={28} /> : <FaVolumeUp size={28} />}
            </button>

            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={isReactionAnimating}
              className={`p-5 rounded-full transition-all shadow-lg transform ${
                isReactionAnimating 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-yellow-500 hover:bg-yellow-600 hover:scale-110'
              } text-white`}
              title="Send reaction"
            >
              <span className="text-3xl">😊</span>
            </button>

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
              👂 Listening as {listenerName}
            </p>
            {audioInitialized && !isAudioMuted && (
              <p className="text-xs text-green-600 mt-2 font-medium">
                🔊 Speakers enabled
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

      <style jsx>{`
        @keyframes float-up {
          0% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -30px) scale(1.2);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -60px) scale(0.8);
          }
        }
      `}</style>
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