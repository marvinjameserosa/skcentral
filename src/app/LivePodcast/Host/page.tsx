
"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { rtdb } from "@/app/Firebase/firebase";
import {
  ref,
  push,
  remove,
  onChildAdded,
  onChildRemoved,
  onValue,
  DataSnapshot,
  set,
} from "firebase/database";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/app/Firebase/firebase";
import {
  FaCopy,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaHandPaper,
  FaVolumeUp,
  FaVolumeMute,
} from "react-icons/fa";
import Navbar from "@/app/Components/Navbar";

type HostStatus = "idle" | "waiting" | "live" | "ended" | "loading" | "error";

interface Participant {
  id: string;
  name: string;
  role: "host" | "listener";
  avatar: string;
  joinedAt: number;
  canSpeak?: boolean;
  muted?: boolean;
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
  const [showEndDialog, setShowEndDialog] = useState(false);

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
      console.log("[Host] Initializing host microphone...");
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
      console.log("[Host] Host microphone initialized");
      return stream;
    } catch (err) {
      console.error("[Host] Failed to access microphone:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to access microphone";
      setError(errorMessage);
      throw err;
    }
  }, []);

  const setupPodcastRoom = useCallback(
    async (podcast: PodcastData) => {
      if (!roomId) return;
      
      console.log("[Host] Setting up podcast room in Firestore");
      const roomData = {
        title: podcast.title || "Untitled Podcast",
        hostId: hostIdRef.current,
        hostName: podcast.hostName || "Host",
        status: "waiting",
        approved: true,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, "podcasts", roomId), roomData, { merge: true });

      const hostData = {
        id: hostIdRef.current,
        name: podcast.hostName || "Host",
        role: "host",
        avatar: "🎙️",
        joinedAt: Date.now(),
        canSpeak: true,
      };
      await setDoc(
        doc(db, "podcasts", roomId, "participants", hostIdRef.current),
        hostData,
        { merge: true }
      );
      console.log("[Host] Podcast room setup complete (Firestore)");
    },
    [roomId]
  );

  useEffect(() => {
    const fetchPodcastData = async () => {
      if (!roomId || status !== "loading") return;
      
      try {
        console.log("[Host] Fetching podcast data from Firestore...");
        const podcastRef = doc(db, "podcasts", roomId);
        const podcastSnapshot = await getDoc(podcastRef);
        
        if (!podcastSnapshot.exists()) {
          console.error("[Host] Podcast not found");
          setError("Podcast not found");
          setStatus("error");
          return;
        }
        
        const data = podcastSnapshot.data();
        if (!data.approved) {
          console.error("[Host] Podcast not approved");
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
        console.log("[Host] Host ready, waiting for listeners");
      } catch (err) {
        console.error("[Host] Failed to load podcast:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to load podcast";
        setError(`Failed to load podcast: ${errorMessage}`);
        setStatus("error");
      }
    };
    
    fetchPodcastData();
  }, [roomId, status, initializeMicrophone, setupPodcastRoom, searchParams]);

  const createAudioElement = useCallback(
    (participantId: string, stream: MediaStream) => {
      console.log(`[Host] Creating audio element for ${participantId}`);
      
      const oldAudio = audioElementsRef.current.get(participantId);
      if (oldAudio) {
        oldAudio.pause();
        oldAudio.srcObject = null;
        oldAudio.remove();
        console.log(`[Host] Removed old audio element for ${participantId}`);
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
      
      audio
        .play()
        .then(() => {
          console.log(`[Host] Audio playing for ${participantId}`);
        })
        .catch((err) => {
          console.log(`[Host] Autoplay blocked for ${participantId}:`, err.message);
        });

      audioElementsRef.current.set(participantId, audio);
      remoteStreamsRef.current.set(participantId, stream);
    },
    [isAudioMuted]
  );

  const cleanupParticipantConnection = useCallback((participantId: string) => {
    const audio = audioElementsRef.current.get(participantId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElementsRef.current.delete(participantId);
      console.log(`[Host] Cleaned up audio for ${participantId}`);
    }
    remoteStreamsRef.current.delete(participantId);
    pendingIceCandidatesRef.current.delete(participantId);
  }, []);
  
  const createPeerConnection = useCallback(
    (participantId: string, stream: MediaStream): RTCPeerConnection => {
      console.log(`[Host] Creating peer connection for ${participantId}`);
      
      const existingPc = peerConnectionsRef.current.get(participantId);
      if (existingPc) {
        console.log(`[Host] Closing existing PC for ${participantId}`);
        existingPc.close();
        peerConnectionsRef.current.delete(participantId);
      }
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      });
  
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log(`[Host] Added host track to PC[${participantId}]:`, track.kind);
      });
  
      pc.ontrack = (event) => {
        console.log(`[Host] ✅ Received track from ${participantId}:`, event.track.kind);
        if (event.streams[0]) {
          console.log(`[Host] 🔊 Creating audio element for incoming track from ${participantId}`);
          createAudioElement(participantId, event.streams[0]);
        }
      };
  
      pc.onicecandidate = (event) => {
        if (event.candidate && roomId) {
          console.log(`[Host] Sending ICE candidate to ${participantId}`);
          push(ref(rtdb, `rooms/${roomId}/webrtc/${participantId}/hostIceCandidates`), {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
            timestamp: Date.now(),
          }).catch((err) => console.error("[Host] Error sending ICE candidate:", err));
        }
      };
  
      pc.onconnectionstatechange = () => {
        console.log(`[Host] PC[${participantId}] connection state:`, pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log(`[Host] ✅ Connected to ${participantId} - two-way audio ready`);
        } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          console.log(`[Host] Connection ${pc.connectionState} for ${participantId}`);
          cleanupParticipantConnection(participantId);
        }
      };
  
      peerConnectionsRef.current.set(participantId, pc);
      
      if (!pendingIceCandidatesRef.current.has(participantId)) {
        pendingIceCandidatesRef.current.set(participantId, []);
      }
      
      return pc;
    },
    [roomId, createAudioElement, cleanupParticipantConnection]
  );

  const handleOffer = useCallback(
    async (participantId: string, offer: RTCSessionDescriptionInit, offerId: string) => {
      if (!localStream || !roomId) {
        console.log("[Host] Cannot handle offer: no local stream or room ID");
        return;
      }

      if (processedOffersRef.current.has(offerId)) {
        console.log(`[Host] Already processed offer ${offerId} from ${participantId}`);
        return;
      }
      processedOffersRef.current.add(offerId);

      try {
        console.log(`[Host] Processing offer from ${participantId}`);
        let pc = peerConnectionsRef.current.get(participantId);
        if (pc && pc.signalingState !== "stable") {
          console.log(`[Host] Closing existing unstable PC for ${participantId}`);
          pc.close();
          peerConnectionsRef.current.delete(participantId);
          pc = undefined;
        }
        
        if (!pc) {
          pc = createPeerConnection(participantId, localStream);
        }

        console.log(`[Host] Setting remote description for ${participantId}`);
        await pc.setRemoteDescription(offer);

        const pendingCandidates = pendingIceCandidatesRef.current.get(participantId) || [];
        console.log(`[Host] Adding ${pendingCandidates.length} pending ICE candidates for ${participantId}`);
        for (const candidate of pendingCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.error(`[Host] Error adding pending ICE candidate for ${participantId}:`, err);
          }
        }
        pendingIceCandidatesRef.current.set(participantId, []);

        console.log(`[Host] Creating answer for ${participantId}`);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log(`[Host] Sending answer to ${participantId}`);
        await set(ref(rtdb, `rooms/${roomId}/webrtc/${participantId}/answer`), {
          type: answer.type,
          sdp: answer.sdp,
          timestamp: Date.now(),
        });

        console.log(`[Host] ✅ Answer sent to ${participantId} - waiting for connection`);
      } catch (err) {
        console.error(`[Host] Error handling offer from ${participantId}:`, err);
        processedOffersRef.current.delete(offerId);
      }
    },
    [localStream, roomId, createPeerConnection]
  );

  useEffect(() => {
    if (!roomId || !localStream || status === "loading") return;

    console.log("[Host] 👂 Listening for offers from listeners...");
    const offersRef = ref(rtdb, `rooms/${roomId}/webrtc/offers`);
    const unsubscribe = onChildAdded(offersRef, (snapshot: DataSnapshot) => {
      const offerId = snapshot.key;
      const data = snapshot.val();

      if (data?.offer && data.from && data.from !== hostIdRef.current && offerId) {
        console.log(`[Host] 📥 New offer from ${data.from}`);
        handleOffer(data.from, data.offer, offerId);
      }
    });

    return () => {
      console.log("[Host] Stopped listening for offers");
      unsubscribe();
    };
  }, [roomId, localStream, status, handleOffer]);

  useEffect(() => {
    if (!roomId || status === "loading") return;

    console.log("[Host] Listening for participants...");
    const participantsRef = ref(rtdb, `rooms/${roomId}/participants`);
    const unsubAdded = onChildAdded(participantsRef, (snapshot: DataSnapshot) => {
      const participant = snapshot.val() as Participant;
      console.log(`[Host] Participant added: ${participant.name} (${participant.id})`);

      setParticipants((prev) => {
        if (prev.find((p) => p.id === participant.id)) return prev;
        return [...prev, participant];
      });

      if (participant.role === "listener" && status === "waiting") {
        console.log("[Host] Going LIVE - first listener joined!");
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
                await pc.addIceCandidate(candidate);
                console.log(`[Host] Added ICE candidate for ${participant.id}`);
              } catch (err) {
                console.error(`[Host] Error adding ICE candidate for ${participant.id}:`, err);
              }
            } else {
              console.log(`[Host] Queueing ICE candidate for ${participant.id}`);
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
      console.log(`[Host] Participant left: ${participant.name} (${participant.id})`);

      setParticipants((prev) => prev.filter((p) => p.id !== participant.id));

      const pc = peerConnectionsRef.current.get(participant.id);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(participant.id);
        console.log(`[Host] Closed PC for ${participant.id}`);
      }

      cleanupParticipantConnection(participant.id);
    });

    return () => {
      console.log("[Host] Stopped listening for participants");
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
    console.log(`[Host] ✅ Approving speak request for ${participantId}`);
    await set(ref(rtdb, `rooms/${roomId}/participants/${participantId}/canSpeak`), true);
    await remove(ref(rtdb, `rooms/${roomId}/speakRequests/${requestId}`));
    console.log(`[Host] 🎙️ Listener ${participantId} can now speak - audio will be received`);
  };

  const handleDenySpeak = async (requestId: string) => {
    if (!roomId) return;
    console.log(`[Host] Denying speak request ${requestId}`);
    await remove(ref(rtdb, `rooms/${roomId}/speakRequests/${requestId}`));
  };

  const handleRevokeSpeaking = async (participantId: string) => {
    if (!roomId) return;
    console.log(`[Host] Revoking speaking permission for ${participantId}`);
    await set(ref(rtdb, `rooms/${roomId}/participants/${participantId}/canSpeak`), false);
    cleanupParticipantConnection(participantId);
  };

  const handleLeaveCall = async () => {
    console.log("[Host] Leaving podcast as host...");
    localStream?.getTracks().forEach((track) => {
      track.stop();
    });
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();
    remoteStreamsRef.current.clear();

    if (roomId) {
      await deleteDoc(
        doc(db, "podcasts", roomId, "participants", hostIdRef.current)
      );
    }
    setShowEndDialog(false);
    router.push("/LivePodcast");
  };

  const handleEndCall = async () => {
    console.log("[Host] Ending podcast...");
    localStream?.getTracks().forEach((track) => {
      track.stop();
    });
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();
    remoteStreamsRef.current.clear();

    if (roomId) {
      await updateDoc(doc(db, "podcasts", roomId), { status: "ended" });
      console.log("[Host] Marked podcast as ended");
      setTimeout(() => {
        deleteDoc(doc(db, "podcasts", roomId));
      }, 300000);
    }
    setShowEndDialog(false);
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
    console.log(`[Host] 🎙️ Host microphone ${newMutedState ? "muted" : "unmuted"}`);
  };

  const toggleAudioOutput = () => {
    const newMutedState = !isAudioMuted;
    setIsAudioMuted(newMutedState);
    audioElementsRef.current.forEach((audio) => {
      audio.muted = newMutedState;
    });
    console.log(`[Host] 🔊 All co-host audio ${newMutedState ? "muted" : "unmuted"}`);
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
    const currentLocalStream = localStream;
    return () => {
      console.log("[Host] Cleanup on unmount");
      currentLocalStream?.getTracks().forEach((track) => track.stop());
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
          <p className="text-gray-600 mb-6">
            {error || "Please access through an approved podcast."}
          </p>
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

  const speakingListeners = participants.filter(
    (p) => p.role === "listener" && p.canSpeak
  );
  const totalSpeaking = speakingListeners.length + 1;

  return (
    <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
      <Navbar />

      <div ref={audioContainerRef} className="hidden" />

      {showEndDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">End Podcast?</h3>
            <p className="text-gray-600 mb-6">What would you like to do?</p>
            <div className="space-y-3">
              <button
                onClick={handleEndCall}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition font-semibold"
              >
                End Podcast for Everyone
              </button>
              <button
                onClick={handleLeaveCall}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg transition font-semibold"
              >
                Leave (Keep Podcast Running)
              </button>
              <button
                onClick={() => setShowEndDialog(false)}
                className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-lg transition font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="p-6 text-center bg-gradient-to-r from-blue-50 to-purple-50">
          <h1 className="text-3xl font-bold text-gray-800 mb-3">{podcastData?.title}</h1>
          <div className="flex justify-center items-center flex-wrap gap-3">
            <span
              className={`px-4 py-2 rounded-full text-sm font-semibold shadow-md ${
                status === "live" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {status === "live" ? "🔴 LIVE - TWO-WAY AUDIO" : "Waiting for listeners..."}
            </span>
            <span className="text-gray-700 font-semibold bg-white px-4 py-2 rounded-full shadow-sm">
              {totalSpeaking} speaking
            </span>
            <span className="text-gray-700 font-semibold bg-white px-4 py-2 rounded-full shadow-sm">
              {participants.length} total
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
                <div
                  key={req.id || idx}
                  className="flex items-center justify-between bg-white p-3 rounded-lg mb-2 shadow-sm"
                >
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

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 shadow-md">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">👤</span> You (Host)
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-700 font-semibold">{podcastData?.hostName}</p>
                  <p className="text-sm text-gray-600">Host • Always speaking</p>
                </div>
                <div className="text-3xl">🎙️</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 shadow-md">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">👥</span> Participants
              </h3>
              <p className="text-3xl font-bold text-green-700">
                {participants.filter((p) => p.role === "listener").length}
              </p>
              <p className="text-sm text-gray-600 mt-1">Active listeners</p>
            </div>
          </div>

          {speakingListeners.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Speaking Listeners</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {speakingListeners.map((participant) => (
                  <div
                    key={participant.id}
                    className="bg-white border-2 border-green-200 rounded-xl p-4 shadow-md hover:shadow-lg transition"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">{participant.avatar}</div>
                        <div>
                          <p className="font-semibold text-gray-800">{participant.name}</p>
                          <p className="text-xs text-green-600 font-medium">Can speak</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeSpeaking(participant.id)}
                      className="w-full bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm transition font-medium"
                    >
                      Revoke Speaking
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">All Listeners</h3>
            {participants.filter((p) => p.role === "listener").length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-8 text-center">
                <p className="text-gray-500 text-lg">No listeners yet</p>
                <p className="text-gray-400 text-sm mt-2">Share the room ID to invite people</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {participants
                  .filter((p) => p.role === "listener")
                  .map((participant) => (
                    <div
                      key={participant.id}
                      className={`rounded-xl p-4 shadow-md ${
                        participant.canSpeak
                          ? "bg-green-50 border-2 border-green-300"
                          : "bg-white border border-gray-200"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">{participant.avatar}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 truncate">{participant.name}</p>
                          <p className="text-xs text-gray-500">
                            {participant.canSpeak ? "Speaking" : "Listening"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-center items-center space-x-4">
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full transition shadow-lg ${
                isMuted
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? <FaMicrophoneSlash size={24} /> : <FaMicrophone size={24} />}
            </button>
            <button
              onClick={toggleAudioOutput}
              className={`p-4 rounded-full transition shadow-lg ${
                isAudioMuted
                  ? "bg-gray-600 hover:bg-gray-700 text-white"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
              title={isAudioMuted ? "Unmute Listeners" : "Mute Listeners"}
            >
              {isAudioMuted ? <FaVolumeMute size={24} /> : <FaVolumeUp size={24} />}
            </button>
            <button
              onClick={() => setShowEndDialog(true)}
              className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-full transition shadow-lg"
              title="End/Leave Podcast"
            >
              <FaPhoneSlash size={24} />
            </button>
          </div>
          <div className="flex justify-center items-center space-x-6 mt-4 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isMuted ? "bg-red-500" : "bg-green-500"}`}></div>
              <span>{isMuted ? "Muted" : "Mic Active"}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isAudioMuted ? "bg-gray-500" : "bg-purple-500"}`}></div>
              <span>{isAudioMuted ? "Listeners Muted" : "Hearing Listeners"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HostPage = () => {
  return (
    <Suspense
      fallback={
        <div className="ml-[260px] min-h-screen p-6 bg-gray-50">
          <div className="max-w-md mx-auto mt-20 bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Loading...</h2>
          </div>
        </div>
      }
    >
      <HostPageContent />
    </Suspense>
  );
};

export default HostPage;