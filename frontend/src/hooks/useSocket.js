import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

/**
 * Custom hook that subscribes to Socket.io processing and compression events
 * and invokes callbacks for progress, completion, and errors.
 *
 * Events handled:
 * - processing:start, processing:progress, processing:complete, processing:error
 * - compression:start, compression:progress, compression:complete, compression:error, compression:skipped
 */
export function useSocket({
  onProgress,
  onComplete,
  onError,
  onStart,
  onCompressionStart,
  onCompressionProgress,
  onCompressionComplete,
  onCompressionError,
}) {
  const callbacksRef = useRef({
    onProgress, onComplete, onError, onStart,
    onCompressionStart, onCompressionProgress, onCompressionComplete, onCompressionError,
  });

  // Keep callbacks up to date without re-subscribing
  useEffect(() => {
    callbacksRef.current = {
      onProgress, onComplete, onError, onStart,
      onCompressionStart, onCompressionProgress, onCompressionComplete, onCompressionError,
    };
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Processing events
    const handleStart = (data) => callbacksRef.current.onStart?.(data);
    const handleProgress = (data) => callbacksRef.current.onProgress?.(data);
    const handleComplete = (data) => callbacksRef.current.onComplete?.(data);
    const handleError = (data) => callbacksRef.current.onError?.(data);

    // Compression events
    const handleCompressionStart = (data) => callbacksRef.current.onCompressionStart?.(data);
    const handleCompressionProgress = (data) => callbacksRef.current.onCompressionProgress?.(data);
    const handleCompressionComplete = (data) => callbacksRef.current.onCompressionComplete?.(data);
    const handleCompressionError = (data) => callbacksRef.current.onCompressionError?.(data);

    socket.on('processing:start', handleStart);
    socket.on('processing:progress', handleProgress);
    socket.on('processing:complete', handleComplete);
    socket.on('processing:error', handleError);

    socket.on('compression:start', handleCompressionStart);
    socket.on('compression:progress', handleCompressionProgress);
    socket.on('compression:complete', handleCompressionComplete);
    socket.on('compression:error', handleCompressionError);
    socket.on('compression:skipped', handleCompressionError);

    return () => {
      socket.off('processing:start', handleStart);
      socket.off('processing:progress', handleProgress);
      socket.off('processing:complete', handleComplete);
      socket.off('processing:error', handleError);

      socket.off('compression:start', handleCompressionStart);
      socket.off('compression:progress', handleCompressionProgress);
      socket.off('compression:complete', handleCompressionComplete);
      socket.off('compression:error', handleCompressionError);
      socket.off('compression:skipped', handleCompressionError);
    };
  }, []);
}
