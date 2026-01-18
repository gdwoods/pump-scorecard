import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DilutionAlert } from '@/types/alert';

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'unavailable';

interface UseRealtimeAlertsOptions {
  enabled: boolean;
  onNewAlert: (alert: DilutionAlert) => void;
  onError?: (error: Error) => void;
}

/**
 * Custom hook to manage Supabase Realtime subscriptions for SEC filing alerts.
 * Automatically subscribes to INSERT events on the sec_filing_alerts table.
 * Falls back gracefully if Supabase is not configured or Realtime is unavailable.
 */
export function useRealtimeAlerts({
  enabled,
  onNewAlert,
  onError,
}: UseRealtimeAlertsOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('unavailable');
  const channelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const onNewAlertRef = useRef(onNewAlert);
  const onErrorRef = useRef(onError);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectDelayMs = 3000;

  // Keep refs up to date
  useEffect(() => {
    onNewAlertRef.current = onNewAlert;
    onErrorRef.current = onError;
  }, [onNewAlert, onError]);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      console.log('[Realtime] Unsubscribing from alerts channel');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, []);

  const connect = useCallback(() => {
    // Check if Supabase is configured (check supabase client directly)
    if (!supabase) {
      console.warn('[Realtime] Supabase client not available, Realtime unavailable');
      setStatus('unavailable');
      return;
    }

    // Check if we can access the supabase URL (client-side check)
    try {
      const url = (supabase as any).supabaseUrl;
      if (!url || url.includes('placeholder')) {
        console.warn('[Realtime] Supabase not configured, Realtime unavailable');
        setStatus('unavailable');
        return;
      }
    } catch (e) {
      console.warn('[Realtime] Supabase check failed, Realtime unavailable');
      setStatus('unavailable');
      return;
    }

    if (!enabled) {
      setStatus('disconnected');
      cleanup();
      return;
    }

    // Clean up existing connection
    cleanup();

    console.log('[Realtime] Connecting to Supabase Realtime...');
    setStatus('connecting');

    // Set a timeout to detect if connection is stuck (10 seconds)
    connectionTimeoutRef.current = setTimeout(() => {
      // Check if still in connecting state
      setStatus((currentStatus) => {
        if (currentStatus === 'connecting') {
          console.warn('[Realtime] Connection timeout, marking as unavailable');
          cleanup();
          if (onErrorRef.current) {
            onErrorRef.current(new Error('Realtime connection timeout'));
          }
          return 'unavailable';
        }
        return currentStatus;
      });
    }, 10000);

    try {
      // Subscribe to INSERT events on sec_filing_alerts table
      const channel = supabase
        .channel('sec_filing_alerts_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sec_filing_alerts',
          },
          (payload) => {
            console.log('[Realtime] New alert received:', payload.new);
            
            // Convert payload to DilutionAlert type
            const newAlert: DilutionAlert = payload.new as DilutionAlert;
            
            // Call callback with new alert using ref (avoids dependency issues)
            onNewAlertRef.current(newAlert);
          }
        )
        .subscribe((subscriptionStatus) => {
          // Clear timeout on status update
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          
          console.log('[Realtime] Subscription status:', subscriptionStatus);
          
          if (subscriptionStatus === 'SUBSCRIBED') {
            setStatus('connected');
            reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
            console.log('[Realtime] Successfully connected');
          } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
            setStatus('error');
            console.error('[Realtime] Connection error:', subscriptionStatus);
            
            // Attempt to reconnect
            if (reconnectAttemptsRef.current < maxReconnectAttempts) {
              reconnectAttemptsRef.current += 1;
              console.log(`[Realtime] Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
              reconnectTimeoutRef.current = setTimeout(() => {
                connect();
              }, reconnectDelayMs);
            } else {
              console.error('[Realtime] Max reconnect attempts reached, Realtime unavailable');
              setStatus('unavailable');
              if (onErrorRef.current) {
                onErrorRef.current(new Error('Realtime connection failed after multiple attempts'));
              }
            }
          } else if (subscriptionStatus === 'CLOSED') {
            setStatus('disconnected');
            console.log('[Realtime] Connection closed');
          }
        });

      channelRef.current = channel;
    } catch (error) {
      // Clear timeout on error
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      console.error('[Realtime] Error setting up subscription:', error);
      setStatus('unavailable'); // Change to unavailable instead of error for stuck connections
      cleanup();
      if (onErrorRef.current) {
        onErrorRef.current(error instanceof Error ? error : new Error('Unknown Realtime error'));
      }
    }
  }, [enabled, cleanup]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
      setStatus('disconnected');
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return {
    status,
    connect: () => {
      reconnectAttemptsRef.current = 0; // Reset attempts when manually connecting
      connect();
    },
    disconnect: cleanup,
  };
}
