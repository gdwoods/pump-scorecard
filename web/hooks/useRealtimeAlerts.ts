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
  const maxReconnectAttempts = 5;
  const reconnectDelayMs = 3000;

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
    reconnectAttemptsRef.current = 0;
  }, []);

  const connect = useCallback(() => {
    // Check if Supabase is configured
    if (!supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.warn('[Realtime] Supabase not configured, Realtime unavailable');
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
            
            // Call callback with new alert
            onNewAlert(newAlert);
          }
        )
        .subscribe((status) => {
          console.log('[Realtime] Subscription status:', status);
          
          if (status === 'SUBSCRIBED') {
            setStatus('connected');
            reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
            console.log('[Realtime] Successfully connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setStatus('error');
            console.error('[Realtime] Connection error:', status);
            
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
              if (onError) {
                onError(new Error('Realtime connection failed after multiple attempts'));
              }
            }
          } else if (status === 'CLOSED') {
            setStatus('disconnected');
            console.log('[Realtime] Connection closed');
          }
        });

      channelRef.current = channel;
    } catch (error) {
      console.error('[Realtime] Error setting up subscription:', error);
      setStatus('error');
      if (onError) {
        onError(error instanceof Error ? error : new Error('Unknown Realtime error'));
      }
    }
  }, [enabled, onNewAlert, onError, cleanup]);

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
