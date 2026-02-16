import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

/**
 * Custom hook that subscribes to Socket.io processing events
 * and invokes callbacks for progress, completion, and errors.
 */
export function useSocket({ onProgress, onComplete, onError, onStart }) {
  const callbacksRef = useRef({ onProgress, onComplete, onError, onStart });

  // Keep callbacks up to date without re-subscribing
  useEffect(() => {
    callbacksRef.current = { onProgress, onComplete, onError, onStart };
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStart = (data) => callbacksRef.current.onStart?.(data);
    const handleProgress = (data) => callbacksRef.current.onProgress?.(data);
    const handleComplete = (data) => callbacksRef.current.onComplete?.(data);
    const handleError = (data) => callbacksRef.current.onError?.(data);

    socket.on('processing:start', handleStart);
    socket.on('processing:progress', handleProgress);
    socket.on('processing:complete', handleComplete);
    socket.on('processing:error', handleError);

    return () => {
      socket.off('processing:start', handleStart);
      socket.off('processing:progress', handleProgress);
      socket.off('processing:complete', handleComplete);
      socket.off('processing:error', handleError);
    };
  }, []);
}
