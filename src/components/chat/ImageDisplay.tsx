'use client';

import { ImageInfo } from '@/types/message';

interface ImageDisplayProps {
  image: ImageInfo;
}

export default function ImageDisplay({ image }: ImageDisplayProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${image.base64}`;
    link.download = `generated-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="relative group rounded-lg overflow-hidden">
      <img
        src={`data:image/png;base64,${image.base64}`}
        alt={image.prompt}
        className="max-w-full rounded-lg"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
        <span className="text-xs text-white/80 truncate max-w-[70%]">{image.prompt}</span>
        <button
          onClick={handleDownload}
          className="px-2 py-1 bg-white/20 rounded text-xs text-white hover:bg-white/30 transition-colors"
        >
          Download
        </button>
      </div>
    </div>
  );
}
