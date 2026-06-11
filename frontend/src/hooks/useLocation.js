import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useLocation — Live GPS tracking hook
 * Watches the browser geolocation and returns the latest coords.
 */
export default function useLocation({ enabled = true } = {}) {
  const [location, setLocation] = useState(null); // { lat, lng, accuracy, timestamp }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const watchIdRef = useRef(null);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setLoading(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          timestamp: new Date(position.timestamp),
        });
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location permission denied. Please allow location access.');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Location information is unavailable.');
            break;
          case err.TIMEOUT:
            setError('Location request timed out.');
            break;
          default:
            setError('An unknown error occurred getting location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startWatching();
    } else {
      stopWatching();
      // Reset stale state so next pair starts fresh
      setLocation(null);
      setError(null);
      setLoading(false);
    }
    return () => stopWatching();
  }, [enabled, startWatching, stopWatching]);

  return { location, error, loading, startWatching, stopWatching };
}
