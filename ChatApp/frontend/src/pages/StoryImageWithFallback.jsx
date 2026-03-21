import { useState } from 'react';

export default function StoryImageWithFallback({ src }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="px-3 py-4 text-xs text-gray-500 italic text-center w-full max-h-32 flex items-center justify-center bg-gray-900 border border-gray-700">
        Story unavailable
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="Story"
      className="w-full max-h-32 object-cover"
      onError={() => setError(true)}
    />
  );
}