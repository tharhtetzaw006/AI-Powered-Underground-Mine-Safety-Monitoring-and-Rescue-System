import React, { useState } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Camera, VideoOff, RefreshCw, Radio, Settings2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';

interface CameraSectionProps {
  id?: string;
}

export const CameraSection: React.FC<CameraSectionProps> = ({ id }) => {
  const { activeNodeId } = useLiveData();
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckStream = () => {
    setIsChecking(true);
    setTimeout(() => {
      setIsChecking(false);
    }, 1200);
  };

  return (
    <div
      id={id}
      className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            Optical Surveillance (ESP32-CAM)
          </h3>
          {activeNodeId && (
            <span className="text-[10px] text-[#8A8A8A]">
              TARGET NODE: {activeNodeId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status="OFFLINE" label="CAMERA OFFLINE" size="xs" />
          <button
            type="button"
            onClick={handleCheckStream}
            disabled={isChecking}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#0D0D0D] border border-[#222222] text-[10px] text-[#B3B3B3] hover:text-[#FFFFFF] disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'POLLING...' : 'PROBE FEED'}</span>
          </button>
        </div>
      </div>

      {/* Video Viewport Box */}
      <div className="relative aspect-video w-full max-w-2xl mx-auto rounded border border-[#222222] bg-[#000000] flex flex-col items-center justify-center p-6 text-center overflow-hidden">
        {/* Optical grid lines */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="w-full h-full border-t border-b border-dashed border-[#222222] flex items-center justify-center">
            <div className="w-12 h-12 border border-[#38BDF8]/40 rounded-full" />
          </div>
        </div>

        {/* Real Hardware Status */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 rounded border border-[#EF4444]/40 bg-[#1f0505]/40 flex items-center justify-center text-[#EF4444] mb-3">
            <VideoOff className="w-6 h-6 text-[#EF4444]" />
          </div>
          <div className="text-sm font-bold tracking-wider text-[#FFFFFF] uppercase">
            CAMERA OFFLINE
          </div>
          <p className="text-xs text-[#B3B3B3] mt-1.5 max-w-sm">
            No MJPEG or RTSP video stream detected on node optical bus. ESP32-CAM module is inactive or bandwidth-throttled.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] text-[#8A8A8A]">
            <span className="px-2 py-0.5 rounded bg-[#0D0D0D] border border-[#222222]">
              RESOLUTION: --x--
            </span>
            <span className="px-2 py-0.5 rounded bg-[#0D0D0D] border border-[#222222]">
              FPS: 0.0
            </span>
            <span className="px-2 py-0.5 rounded bg-[#0D0D0D] border border-[#222222]">
              BITRATE: 0 KBPS
            </span>
          </div>
        </div>

        {/* Viewport Corner Markings */}
        <div className="absolute top-2 left-2 text-[9px] text-[#8A8A8A] font-mono">
          OPTICAL-01 // {activeNodeId ?? 'UNBOUND'}
        </div>
        <div className="absolute bottom-2 right-2 text-[9px] text-[#8A8A8A] font-mono">
          BUS: NO SIGNAL
        </div>
      </div>
    </div>
  );
};
