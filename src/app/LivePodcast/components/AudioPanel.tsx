"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";

interface AudioPanelProps {
  stream?: MediaStream | null;
  label?: string;
  isMuted?: boolean;
  isHost?: boolean;
}

const AudioPanel: React.FC<AudioPanelProps> = ({
  stream,
  label,
  isMuted = false,
  isHost = false,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const initializeAudio = async () => {
      try {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          if (!isHost) {
            audioRef.current.play().catch(() => {});
          }
        }

        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        analyserRef.current = analyser;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          analyser.getByteFrequencyData(dataArray);

          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          const active = average > 15 && !isMuted;
          setIsActive(active);

          if (!canvas) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / dataArray.length) * 2.5;
          let x = 0;

          for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;

            const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
            if (active) {
              gradient.addColorStop(0, "#10B981");
              gradient.addColorStop(1, "#34D399");
            } else {
              gradient.addColorStop(0, "#6B7280");
              gradient.addColorStop(1, "#9CA3AF");
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
          }

          animationRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
          }
          audioContext.close();
        };
      } catch (error) {
        console.error("Audio initialization error:", error);
      }
    };

    initializeAudio();
  }, [stream, isHost, isMuted]);

  return (
    <div className="flex flex-col items-center p-4">
      {label && (
        <span className="mb-3 text-gray-800 font-medium text-sm">{label}</span>
      )}

      <div className="relative mb-4">
        <div
          className={`relative flex items-center justify-center w-24 h-24 rounded-full border-4 transition-all duration-300 ${
            isActive ? "border-green-400 bg-green-900/30 shadow-lg" : "border-gray-400 bg-gray-700"
          }`}
        >
          {isActive && !isMuted && (
            <div className="absolute inset-0 rounded-full bg-green-400/10 animate-pulse" />
          )}

          <div className="relative z-10">
            {isMuted ? (
              <FaMicrophoneSlash size={28} className="text-red-400" />
            ) : (
              <FaMicrophone
                size={28}
                className={isActive ? "text-green-400" : "text-gray-400"}
              />
            )}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={96}
          height={24}
          className="absolute -bottom-8 left-0 rounded opacity-75"
          style={{ width: "96px", height: "24px" }}
        />
      </div>

      <div className="flex items-center space-x-2 text-xs mt-4">
        <span className={stream ? "text-green-400" : "text-gray-400"}>
          {stream
            ? isActive && !isMuted
              ? "Active"
              : isMuted
              ? "Muted"
              : "Connected"
            : "No Audio"}
        </span>
      </div>

      <audio
        ref={audioRef}
        autoPlay={!isHost}
        playsInline
        muted={isHost}
        className="hidden"
      />
    </div>
  );
};

export default AudioPanel;