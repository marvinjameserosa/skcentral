"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { rtdb } from "@/app/Firebase/firebase";
import {
  ref,
  set,
  push,
  remove,
  onChildAdded,
  onChildRemoved,
  onValue,
  DataSnapshot,
} from "firebase/database";
import { FaCopy, FaMicrophone, FaMicrophoneSlash, FaPhoneSlash, FaHandPaper, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import Navbar from "@/app/Components/Navbar";

type HostStatus = "idle" | "waiting" | "live" | "ended" | "loading" | "error";

interface Participant {
  id: string;
  name: string;
  role: "host" | "listener";
  avatar: string;
  joinedAt: number;
  canSpeak?: boolean;
}

interface SpeakRequest {
  id: string;
  participantId: string;
  participantName: string;
  timestamp: number;
}

interface PodcastData {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  status: string;
  approved: boolean;
  description?: string;
}

// Separate component that uses useSearchParams
const HostPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<HostStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [podcastData, setPodcastData] = useState<PodcastData | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [speakRequests, setSpeakRequests] = useState<SpeakRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hostIdRef = useRef<string>(`host-${Date.now()}`);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const processedOffersRef = useRef<Set<string>>(new Set());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  useEffect(() => {
    const roomParam = searchParams.get("roomId");
    const userParam = searchParams.get("userId");
    if (roomParam) {
      setRoomId(roomParam);
      setStatus("loading");
      if (userParam) hostIdRef.current = userParam;
    } else {
      setError("No room ID provided");
      setStatus("error");
    }
  }, [searchParams]);

  const initializeMicrophone = useCallback(async () => {
    try {
      console.log("🎤 Initializing host microphone...");
      
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
      setLocalStream(stream);
      console.log("✅ Host microphone initialized");
      return stream;
    } catch (err) {
      console.error("❌ Failed to access microphone:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to access microphone";
      setError(errorMessage);
      throw err;
    }
  }, []);

  const setupPodcastRoom = useCallback(async (podcast: PodcastData) => {
    if (!roomId) return;
    
    console.log("📝 Setting up podcast room in RTDB");
    const roomData = {
      title: podcast.title || "Untitled Podcast",
      hostId: hostIdRef.current,
      hostName: podcast.hostName || "Host",
      status: "waiting",
      approved: true,
      createdAt: Date.now(),
    };
    await set(ref(rtdb, `rooms/${roomId}`), roomData);

    const hostData = {
      id: hostIdRef.current,
      name: podcast.hostName || "Host",
      role: "host",
      avatar: "🎙️",
      joinedAt: Date.now(),
      canSpeak: true,
    };
    await set(ref(rtdb, `rooms/${roomId}/participants/${hostIdRef.current}`), hostData);
    console.log("✅ Podcast room setup complete");
  }, [roomId]);

  useEffect(() => {
    const fetchPodcastData = async () => {
      if (!roomId || status !== "loading") return;
      
      try {
        console.log("📡 Fetching podcast data from Firestore...");
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("@/app/Firebase/firebase");
        const podcastRef = doc(db, "podcasts", roomId);
        const podcastSnapshot = await getDoc(podcastRef);
        
        if (!podcastSnapshot.exists()) {
          console.error("❌ Podcast not found");
          setError("Podcast not found");
          setStatus("error");
          return;
        }
        
        const data = podcastSnapshot.data();
        if (!data.approved) {
          console.error("❌ Podcast not approved");
          setError("Podcast not approved");
          setStatus("error");
          return;
        }
        
        const podcast: PodcastData = {
          id: roomId,
          title: data.title || "Untitled Podcast",
          hostId: hostIdRef.current,
          hostName: data.hostName || searchParams.get("userName") || "Host",
          status: "waiting",
          approved: true,
          description: data.description,
        };
        
        setPodcastData(podcast);
        await initializeMicrophone();
        await setupPodcastRoom(podcast);
        setStatus("waiting");
        console.log("✅ Host ready, waiting for listeners");
      } catch (err) {
        console.error("❌ Failed to load podcast:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to load podcast";
        setError(`Failed to load podcast: ${errorMessage}`);
        setStatus("error");
      }
    };
    
    fetchPodcastData();
  }, [roomId, status, initializeMicrophone, setupPodcastRoom, searchParams]);

  const createAudioElement = useCallback((participantId: string, stream: MediaStream) => {
    console.log(`🔊 Creating audio element for ${participantId}`);
    
    const oldAudio = audioElementsRef.current.get(participantId);
    if (oldAudio) {
      oldAudio.pause();
      oldAudio.srcObject = null;
      oldAudio.remove();
      console.log(`🗑️ Removed old audio element for ${participantId}`);
    }

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = isAudioMuted;
    audio.srcObject = stream;
    audio.volume = 1.0;
    
    if (audioContainerRef.current) {
      audioContainerRef.current.appendChild(audio);
    }
    
    audio.play().then(() => {
      console.log(`✅ Audio playing for ${participantId}`);
    }).catch(err => {
      console.error(`❌ Error playing audio for ${participantId}:`, err);
    });

    audioElementsRef.current.set(participantId, audio);
    remoteStreamsRef.current.set(participantId, stream);
  }, [isAudioMuted]);

  const cleanupParticipantConnection = useCallback((participantId: string) => {
    const audio = audioElementsRef.current.get(participantId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElementsRef.current.delete(participantId);
      console.log(`🗑️ Cleaned up audio for ${participantId}`);
    }
    remoteStreamsRef.current.delete(participantId);
    pendingIceCandidatesRef.current.delete(participantId);
  }, []);
  
  const createPeerConnection = useCallback((participantId: string, stream: MediaStream): RTCPeerConnection => {
    console.log(`🔧 Creating peer connection for ${participantId}`);
    
    const existingPc = peerConnectionsRef.current.get(participantId);
    if (existingPc) {
      console.log(`🔌 Closing existing PC for ${participantId}`);
      existingPc.close();
      peerConnectionsRef.current.delete(participantId);
    }
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ],
    });
  
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
      console.log(`➕ Added host track to PC[${participantId}]:`, track.kind);
    });
  
    pc.ontrack = (event) => {
      console.log(`📡 Received track from ${participantId}:`, event.track.kind, event.track.id);
      if (event.streams[0]) {
        console.log(`🔊 Creating audio element for incoming track from ${participantId}`);
        createAudioElement(participantId, event.streams[0]);
      }
    };
  
    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        console.log(`🧊 Sending ICE candidate to ${participantId}`);
        push(ref(rtdb, `rooms/${roomId}/webrtc/${participantId}/hostIceCandidates`), {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
          timestamp: Date.now(),
        }).catch(err => console.error("Error sending ICE candidate:", err));
      }
    };
  
    pc.onconnectionstatechange = () => {
      console.log(`🔌 PC[${participantId}] connection state:`, pc.connectionState);
      
      if (pc.connectionState === "connected") {
        console.log(`✅ Connected to ${participantId}`);
      } else if (pc.connectionState === "disconnected") {
        console.log(`⚠️ Connection disconnected for ${participantId}, waiting for reconnection...`);
      } else if (pc.connectionState === "failed") {
        console.log(`❌ Connection failed for ${participantId}`);
        cleanupParticipantConnection(participantId);
      } else if (pc.connectionState === "closed") {
        console.log(`❌ Connection closed for ${participantId}`);
        cleanupParticipantConnection(participantId);
      }
    };
  
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 PC[${participantId}] ICE state:`, pc.iceConnectionState);
    };
  
    peerConnectionsRef.current.set(participantId, pc);
    
    if (!pendingIceCandidatesRef.current.has(participantId)) {
      pendingIceCandidatesRef.current.set(participantId, []);
    }
    
    return pc;
  }, [roomId, createAudioElement, cleanupParticipantConnection]);

  const handleOffer = useCallback(async (participantId: string, offer: RTCSessionDescriptionInit, offerId: string) => {
    if (!localStream || !roomId) {
      console.log("⚠️ Cannot handle offer: no local stream or room ID");
      return;
    }

    if (processedOffersRef.current.has(offerId)) {
      console.log(`⚠️ Already processed offer ${offerId} from ${participantId}`);
      return;
    }
    processedOffersRef.current.add(offerId);

    try {
      console.log(`📥 Processing offer from ${participantId}`);
      
      let pc = peerConnectionsRef.current.get(participantId);
      if (pc && pc.signalingState !== "stable") {
        console.log(`⚠️ Closing existing unstable PC for ${participantId}`);
        pc.close();
        peerConnectionsRef.current.delete(participantId);
        pc = undefined;
      }
      
      if (!pc) {
        pc = createPeerConnection(participantId, localStream);
      }

      console.log(`📝 Setting remote description for ${participantId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      const pendingCandidates = pendingIceCandidatesRef.current.get(participantId) || [];
      console.log(`🧊 Adding ${pendingCandidates.length} pending ICE candidates for ${participantId}`);
      for (const candidate of pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error(`Error adding pending ICE candidate for ${participantId}:`, err);
        }
      }
      pendingIceCandidatesRef.current.set(participantId, []);
      
      console.log(`📤 Creating answer for ${participantId}`);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log(`☁️ Sending answer to ${participantId}`);
      await set(ref(rtdb, `rooms/${roomId}/webrtc/${participantId}/answer`), {
        type: answer.type,
        sdp: answer.sdp,
        timestamp: Date.now(),
      });
      
      console.log(`✅ Answer sent to ${participantId}`);
    } catch (err) {
      console.error(`❌ Error handling offer from ${participantId}:`, err);
      processedOffersRef.current.delete(offerId);
    }
  }, [localStream, roomId, createPeerConnection]);

  useEffect(() => {
    if (!roomId || !localStream || status === "loading") return;

    console.log("👂 Listening for offers from listeners...");
    const offersRef = ref(rtdb, `rooms/${roomId}/webrtc/offers`);
    const unsubscribe = onChildAdded(offersRef, (snapshot: DataSnapshot) => {
      const offerId = snapshot.key;
      const data = snapshot.val();
      
      if (data?.offer && data.from && data.from !== hostIdRef.current && offerId) {
        console.log(`📨 New offer from ${data.from}`);
        handleOffer(data.from, data.offer, offerId);
      }
    });

    return () => {
      console.log("🛑 Stopped listening for offers");
      unsubscribe();
    };
  }, [roomId, localStream, status, handleOffer]);

  useEffect(() => {
    if (!roomId || status === "loading") return;

    console.log("👂 Listening for participants...");
    const participantsRef = ref(rtdb, `rooms/${roomId}/participants`);
    
    const unsubAdded = onChildAdded(participantsRef, (snapshot: DataSnapshot) => {
      const participant = snapshot.val() as Participant;
      console.log(`👤 Participant added: ${participant.name} (${participant.id})`);
      
      setParticipants((prev) => {
        if (prev.find((p) => p.id === participant.id)) return prev;
        return [...prev, participant];
      });

      if (participant.role === "listener" && status === "waiting") {
        console.log("🎙️ Going LIVE - first listener joined!");
        setStatus("live");
        set(ref(rtdb, `rooms/${roomId}/status`), "live");
      }

      if (participant.role === "listener") {
        const iceRef = ref(rtdb, `rooms/${roomId}/webrtc/${participant.id}/listenerIceCandidates`);
        onChildAdded(iceRef, async (snap: DataSnapshot) => {
          const data = snap.val();
          const pc = peerConnectionsRef.current.get(participant.id);
          
          if (data?.candidate) {
            const candidate: RTCIceCandidateInit = {
              candidate: data.candidate,
              sdpMLineIndex: data.sdpMLineIndex,
              sdpMid: data.sdpMid,
            };
            
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`🧊 Added ICE candidate for ${participant.id}`);
              } catch (err) {
                console.error(`❌ Error adding ICE candidate for ${participant.id}:`, err);
              }
            } else {
              console.log(`🧊 Queueing ICE candidate for ${participant.id}`);
              const pending = pendingIceCandidatesRef.current.get(participant.id) || [];
              pending.push(candidate);
              pendingIceCandidatesRef.current.set(participant.id, pending);
            }
          }
        });
      }
    });

    const unsubRemoved = onChildRemoved(participantsRef, (snapshot: DataSnapshot) => {
      const participant = snapshot.val() as Participant;
      console.log(`👋 Participant left: ${participant.name} (${participant.id})`);
      
      setParticipants((prev) => prev.filter((p) => p.id !== participant.id));

      const pc = peerConnectionsRef.current.get(participant.id);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(participant.id);
        console.log(`🔌 Closed PC for ${participant.id}`);
      }

      cleanupParticipantConnection(participant.id);
    });

    return () => {
      console.log("🛑 Stopped listening for participants");
      unsubAdded();
      unsubRemoved();
    };
  }, [roomId, status, cleanupParticipantConnection]);

  useEffect(() => {
    if (!roomId || status === "loading") return;

    const speakRequestsRef = ref(rtdb, `rooms/${roomId}/speakRequests`);
    const unsubscribe = onValue(speakRequestsRef, (snapshot: DataSnapshot) => {
      const requests: SpeakRequest[] = [];
      if (snapshot.exists()) {
        Object.entries(snapshot.val()).forEach(([id, req]: [string, unknown]) => {
          const request = req as Omit<SpeakRequest, "id">;
          requests.push({ id, ...request });
        });
      }
      setSpeakRequests(requests.sort((a, b) => a.timestamp - b.timestamp));
    });

    return () => unsubscribe();
  }, [roomId, status]);

  const handleApproveSpeak = async (requestId: string, participantId: string) => {
    if (!roomId) return;
    console.log(`✅ Approving speak request for ${participantId}`);
    
    await set(ref(rtdb, `rooms/${roomId}/participants/${participantId}/canSpeak`), true);
    await remove(ref(rtdb, `rooms/${roomId}/speakRequests/${requestId}`));
    
    console.log(`🎤 Listener ${participantId} can now speak - waiting for renegotiation`);
  };

  const handleDenySpeak = async (requestId: string) => {
    if (!roomId) return;
    console.log(`❌ Denying speak request ${requestId}`);
    await remove(ref(rtdb, `rooms/${roomId}/speakRequests/${requestId}`));
  };

  const handleRevokeSpeaking = async (participantId: string) => {
    if (!roomId) return;
    console.log(`🔇 Revoking speaking permission for ${participantId}`);
    await set(ref(rtdb, `rooms/${roomId}/participants/${participantId}/canSpeak`), false);
    
    cleanupParticipantConnection(participantId);
  };

  const handleEndCall = async () => {
    console.log("🛑 Ending podcast...");
    
    localStream?.getTracks().forEach((track) => {
      track.stop();
      console.log("🛑 Stopped host track:", track.kind);
    });
    
    peerConnectionsRef.current.forEach((pc, id) => {
      pc.close();
      console.log(`🔌 Closed PC for ${id}`);
    });
    peerConnectionsRef.current.clear();

    audioElementsRef.current.forEach((audio, id) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      console.log(`🗑️ Removed audio for ${id}`);
    });
    audioElementsRef.current.clear();
    remoteStreamsRef.current.clear();

    if (roomId) {
      await set(ref(rtdb, `rooms/${roomId}/status`), "ended");
      console.log("📢 Marked room as ended");
      setTimeout(() => {
        remove(ref(rtdb, `rooms/${roomId}`));
        console.log("🗑️ Cleaned up room data");
      }, 300000);
    }

    setStatus("ended");
    router.push("/LivePodcast");
  };

  const toggleMute = () => {
    if (!localStream) return;
    
    const newMutedState = !isMuted;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !newMutedState;
    });
    setIsMuted(newMutedState);
    console.log(`🎤 Host microphone ${newMutedState ? 'muted' : 'unmuted'}`);
  };

  const toggleAudioOutput = () => {
    const newMutedState = !isAudioMuted;
    setIsAudioMuted(newMutedState);
    
    audioElementsRef.current.forEach((audio, id) => {
      audio.muted = newMutedState;
      console.log(`${newMutedState ? '🔇' : '🔊'} ${newMutedState ? 'Muted' : 'Unmuted'} audio for ${id}`);
    });
    
    console.log(`${newMutedState ? '🔇' : '🔊'} All listener audio ${newMutedState ? 'muted' : 'unmuted'}`);
  };

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      alert("Room ID copied to clipboard!");
    }
  };

  useEffect(() => {
    const currentPeerConnectionsCopy = peerConnectionsRef.current;
    const currentAudioElementsCopy = audioElementsRef.current;
    
    return () => {
      console.log("🧹 Cleanup on unmount");
      localStream?.getTracks().forEach((track) => track.stop());
      currentPeerConnectionsCopy.forEach((pc) => pc.close());
      currentAudioElementsCopy.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
    };
  }, [localStream]);

  if (status === "idle" || status === "error") {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
        <div className="max-w-md mx-auto mt-20 bg-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            {status === "error" ? "Error" : "No Room ID"}
          </h2>
          <p className="text-gray-600 mb-6">{error || "Please access through an approved podcast."}</p>
          <button
            onClick={() => router.push("/LivePodcast")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition"
          >
            Back to Podcasts
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
        <div className="max-w-md mx-auto mt-20 bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Loading Podcast</h2>
          <p className="text-gray-600">Setting up your live session...</p>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
        <div className="max-w-md mx-auto mt-20 bg-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Podcast Ended</h2>
          <p className="text-gray-600 mb-8">Thanks for hosting!</p>
          <button
            onClick={() => router.push("/LivePodcast")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-xl transition"
          >
            Back to Podcasts
          </button>
        </div>
      </div>
    );
  }

  const speakingListeners = participants.filter((p) => p.role === "listener" && p.canSpeak);
  const totalSpeaking = speakingListeners.length + 1;

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
      <Navbar />
      
      <div ref={audioContainerRef} className="hidden" />
      
      <div className="bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="p-6 text-center bg-gradient-to-r from-blue-50 to-purple-50">
          <h1 className="text-3xl font-bold text-gray-800 mb-3">{podcastData?.title}</h1>
          <div className="flex justify-center items-center flex-wrap gap-3">
            <span className={`px-4 py-2 rounded-full text-sm font-semibold shadow-md ${
              status === "live" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
            }`}>
              {status === "live" ? "LIVE" : "Waiting for listeners..."}
            </span>
            <span className="text-gray-700 font-semibold bg-white px-4 py-2 rounded-full shadow-sm">
              {totalSpeaking} speaking
            </span>
          </div>
          {status === "waiting" && (
            <div className="flex justify-center items-center mt-4 space-x-2">
              <span className="font-mono bg-gray-200 px-4 py-2 rounded text-sm">
                Room ID: {roomId}
              </span>
              <button 
                onClick={copyRoomId} 
                className="p-2 bg-green-600 hover:bg-green-700 rounded text-white transition shadow-md"
                title="Copy Room ID"
              >
                <FaCopy size={18} />
              </button>
            </div>
          )}
        </div>

        {speakRequests.length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <h3 className="font-semibold text-yellow-800 mb-3 text-lg">
              Speaking Requests ({speakRequests.length})
            </h3>
            <div>
              {speakRequests.map((req, idx) => (
                <div key={req.id || idx} className="flex items-center justify-between bg-white p-3 rounded-lg mb-2 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <FaHandPaper className="text-yellow-600 text-xl" />
                    <span className="font-medium">{req.participantName}</span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApproveSpeak(req.id, req.participantId)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition shadow-md"
                    >
                      Allow
                    </button>
                    <button
                      onClick={() => handleDenySpeak(req.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition shadow-md"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-8">
          {(participants.length <= 1 && speakingListeners.length === 0) ? (
            <div className="text-center py-8">
              <div className="w-40 h-40 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-7xl shadow-2xl">
                🎙️
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{podcastData?.hostName}</h2>
              <p className="text-blue-600 font-semibold text-lg mb-4">Host</p>
              <p className="text-xl text-gray-600 mt-6 font-medium">
                Ready to go live! Share the room ID with your listeners.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {participants.map((p, idx) => (
                <div key={p.id || idx} className="flex flex-col items-center">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl relative transition-all shadow-lg ${
                    p.role === "host" ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white" :
                    p.canSpeak ? "bg-gradient-to-br from-green-500 to-green-700 text-white scale-110" : "bg-gray-300 text-gray-700"
                  }`}>
                    {p.avatar}
                    {p.canSpeak && p.role === "listener" && remoteStreamsRef.current.has(p.id) && (
                      <div className="absolute -top-1 -right-1 bg-green-400 w-5 h-5 rounded-full animate-pulse border-2 border-white"></div>
                    )}
                  </div>
                  <p className="mt-3 font-semibold text-center text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500 font-medium">
                    {p.role === "host" ? "Host" : p.canSpeak ? "Speaker" : "Listener"}
                  </p>
                  {p.role === "listener" && p.canSpeak && (
                    <button
                      onClick={() => handleRevokeSpeaking(p.id)}
                      className="mt-2 px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition shadow-md"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
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
              title={isAudioMuted ? "Unmute all listeners" : "Mute all listeners"}
            >
              {isAudioMuted ? <FaVolumeMute size={28} /> : <FaVolumeUp size={28} />}
            </button>

            <button
              onClick={toggleMute}
              className={`p-5 rounded-full transition-all shadow-lg transform hover:scale-110 ${
                isMuted ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
              } text-white`}
              title={isMuted ? "Unmute your microphone" : "Mute your microphone"}
            >
              {isMuted ? <FaMicrophoneSlash size={28} /> : <FaMicrophone size={28} />}
            </button>

            <button
              onClick={handleEndCall}
              className="p-5 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg transform hover:scale-110"
              title="End podcast"
            >
              <FaPhoneSlash size={28} />
            </button>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm font-semibold text-gray-700">
              {speakingListeners.length > 0 
                ? `Listening to ${speakingListeners.length} speaker${speakingListeners.length > 1 ? 's' : ''}` 
                : isMuted 
                ? "Your microphone is muted"
                : "You're live"}
            </p>
            {isAudioMuted && speakingListeners.length > 0 && (
              <p className="text-xs text-orange-600 mt-1">
                Listener audio is muted
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Loading fallback component
const HostPageLoading = () => {
  return (
    <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
      <div className="max-w-md mx-auto mt-20 bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Loading...</h2>
        <p className="text-gray-600">Please wait</p>
      </div>
    </div>
  );
};

// Main component wrapped with Suspense
const HostPage = () => {
  return (
    <Suspense fallback={<HostPageLoading />}>
      <HostPageContent />
    </Suspense>
  );
};

export default HostPage;