"use client";

import React, { useState, useEffect } from "react";
import { SpeedometerIcon, CheckIcon } from "../icons";

interface SpeedTestModalProps {
  isOpen: boolean;
  targetSpeedMbps?: number;
  onClose: () => void;
}

export function SpeedTestModal({
  isOpen,
  targetSpeedMbps = 50,
  onClose,
}: SpeedTestModalProps) {
  const [stage, setStage] = useState<"idle" | "ping" | "download" | "upload" | "done">("idle");
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [ping, setPing] = useState(0);
  const [jitter, setJitter] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setStage("idle");
      setDownloadSpeed(0);
      setUploadSpeed(0);
      setPing(0);
      setJitter(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const startTest = () => {
    setStage("ping");
    setPing(0);
    setDownloadSpeed(0);
    setUploadSpeed(0);

    // Ping stage
    setTimeout(() => {
      setPing(8 + Math.floor(Math.random() * 6));
      setJitter(1 + Math.floor(Math.random() * 3));
      setStage("download");

      // Download stage animation
      let dCount = 0;
      const dInterval = setInterval(() => {
        dCount += 4;
        const currentTarget = targetSpeedMbps - 1 + Math.random() * 3;
        if (dCount >= currentTarget) {
          clearInterval(dInterval);
          setDownloadSpeed(parseFloat(currentTarget.toFixed(1)));
          setStage("upload");

          // Upload stage animation
          let uCount = 0;
          const uTarget = Math.max(10, currentTarget * 0.45);
          const uInterval = setInterval(() => {
            uCount += 2;
            if (uCount >= uTarget) {
              clearInterval(uInterval);
              setUploadSpeed(parseFloat(uTarget.toFixed(1)));
              setStage("done");
            } else {
              setUploadSpeed(parseFloat(uCount.toFixed(1)));
            }
          }, 60);
        } else {
          setDownloadSpeed(parseFloat(dCount.toFixed(1)));
        }
      }, 50);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 text-center">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SpeedometerIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Fiber Speed Test
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Speedometer Center Dial */}
        <div className="relative py-4">
          <div className="w-40 h-40 rounded-full border-8 border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center mx-auto relative shadow-inner">
            {/* Active Spinner Ring */}
            {stage !== "idle" && stage !== "done" && (
              <div className="absolute inset-0 rounded-full border-8 border-blue-500 border-t-transparent animate-spin" />
            )}

            <span className="text-4xl font-black font-mono text-slate-900 dark:text-white">
              {stage === "upload" || stage === "done" ? uploadSpeed : downloadSpeed}
            </span>
            <span className="text-xs font-bold text-slate-400 mt-0.5">
              Mbps {stage === "upload" ? "Upload" : "Download"}
            </span>
          </div>

          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-2 block">
            {stage === "idle" && "Ready to test local fiber latency"}
            {stage === "ping" && "Testing server ping latency..."}
            {stage === "download" && "Testing download throughput..."}
            {stage === "upload" && "Testing upload throughput..."}
            {stage === "done" && "Speed test completed successfully!"}
          </span>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Ping</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{ping} ms</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Download</span>
            <span className="font-black text-blue-600 dark:text-blue-400 font-mono">{downloadSpeed} Mbps</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Upload</span>
            <span className="font-black text-indigo-600 dark:text-indigo-400 font-mono">{uploadSpeed} Mbps</span>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {stage === "idle" || stage === "done" ? (
            <button
              type="button"
              onClick={startTest}
              className="w-full py-3 rounded-2xl bg-[#090b4d] hover:bg-[#060835] text-white font-bold text-xs shadow-md transition-all active:scale-[0.99]"
            >
              {stage === "done" ? "Test Again" : "Start Speed Test"}
            </button>
          ) : (
            <div className="text-xs text-slate-400 animate-pulse">Running test in progress...</div>
          )}
        </div>
      </div>
    </div>
  );
}
