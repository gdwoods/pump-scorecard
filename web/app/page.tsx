"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { DilutionAlert, AlertFilters } from "@/types/alert";
import AlertTable from "@/components/AlertTable";
import AlertFiltersComponent from "@/components/AlertFilters";
import AlertDetailModal from "@/components/AlertDetailModal";
import QuickStartModal from "@/components/QuickStartModal";
import { Loader2, AlertCircle, RefreshCw, Pause, Play, Bell, BellOff, Volume2, Star, HelpCircle, BookOpen, Radio, BarChart3, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { getWatchlist } from "@/lib/watchlist";
import { useRealtimeAlerts } from "@/hooks/useRealtimeAlerts";

// Sound options configuration (moved outside component to prevent re-creation on every render)
type SoundOption = {
  id: string;
  name: string;
  play: (audioContext: AudioContext, startTime: number) => void;
};

const soundOptions: SoundOption[] = [
    {
      id: "default",
      name: "Default Beep",
      play: (ctx, startTime) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
        osc.start(startTime);
        osc.stop(startTime + 0.2);
      },
    },
    {
      id: "high",
      name: "High Pitch",
      play: (ctx, startTime) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1200;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
        osc.start(startTime);
        osc.stop(startTime + 0.15);
      },
    },
    {
      id: "low",
      name: "Low Pitch",
      play: (ctx, startTime) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 400;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
      },
    },
    {
      id: "double",
      name: "Double Beep",
      play: (ctx, startTime) => {
        // First beep
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.frequency.value = 800;
        osc1.type = "sine";
        gain1.gain.setValueAtTime(0, startTime);
        gain1.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gain1.gain.linearRampToValueAtTime(0, startTime + 0.1);
        osc1.start(startTime);
        osc1.stop(startTime + 0.1);
        
        // Second beep
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 800;
        osc2.type = "sine";
        gain2.gain.setValueAtTime(0, startTime + 0.15);
        gain2.gain.linearRampToValueAtTime(0.3, startTime + 0.16);
        gain2.gain.linearRampToValueAtTime(0, startTime + 0.25);
        osc2.start(startTime + 0.15);
        osc2.stop(startTime + 0.25);
      },
    },
    {
      id: "triple",
      name: "Triple Beep",
      play: (ctx, startTime) => {
        [0, 0.12, 0.24].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          osc.type = "sine";
          const beepStart = startTime + delay;
          gain.gain.setValueAtTime(0, beepStart);
          gain.gain.linearRampToValueAtTime(0.3, beepStart + 0.01);
          gain.gain.linearRampToValueAtTime(0, beepStart + 0.08);
          osc.start(beepStart);
          osc.stop(beepStart + 0.08);
        });
      },
    },
    {
      id: "chime",
      name: "Chime (Ascending)",
      play: (ctx, startTime) => {
        [600, 800, 1000].forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = "sine";
          const noteStart = startTime + index * 0.08;
          gain.gain.setValueAtTime(0, noteStart);
          gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.01, noteStart + 0.15);
          osc.start(noteStart);
          osc.stop(noteStart + 0.15);
        });
      },
    },
];

export default function Home() {
  const [alerts, setAlerts] = useState<DilutionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<DilutionAlert | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickStartOpen, setIsQuickStartOpen] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [enableSoundAlert, setEnableSoundAlert] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string>("default");
  const [showSoundMenu, setShowSoundMenu] = useState(false);
  const [filters, setFilters] = useState<AlertFilters>({
    limit: 500, // Increased to ensure we see filings from recent days (1/16, etc.)
  });
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());

  // Use ref to track current alerts for comparison
  const alertsRef = useRef<DilutionAlert[]>([]);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // Load sound alert preferences from localStorage
  useEffect(() => {
    const savedEnabled = localStorage.getItem("enableSoundAlert");
    const savedSound = localStorage.getItem("selectedSound");
    if (savedEnabled !== null) {
      setEnableSoundAlert(savedEnabled === "true");
    }
    if (savedSound !== null && soundOptions.find(s => s.id === savedSound)) {
      setSelectedSound(savedSound);
    }
  }, []);

  // Play selected sound
  const playAlertSound = useCallback(() => {
    if (!enableSoundAlert) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const soundOption = soundOptions.find(s => s.id === selectedSound);
      
      if (soundOption) {
        soundOption.play(audioContext, audioContext.currentTime);
        
        // Close audio context after sound completes
        setTimeout(() => {
          audioContext.close().catch(() => {});
        }, 500);
      }
    } catch (error) {
      console.log("Web Audio API not available:", error);
    }
  }, [enableSoundAlert, selectedSound]); // Removed soundOptions - it's now a constant outside component

  // Handle new alerts from Realtime
  const handleNewAlert = useCallback((newAlert: DilutionAlert) => {
    console.log('[Realtime] Processing new alert:', newAlert.ticker, newAlert.form_type);
    
    // Check if this alert is already in our list (shouldn't happen, but safety check)
    const existingAlert = alertsRef.current.find(a => a.id === newAlert.id);
    if (existingAlert) {
      console.log('[Realtime] Alert already exists, skipping');
      return;
    }

    // Apply current filters to determine if this alert should be shown
    let shouldShow = true;
    
    if (filters.ticker && newAlert.ticker.toUpperCase() !== filters.ticker.toUpperCase()) {
      shouldShow = false;
    }
    
    if (filters.formType && newAlert.form_type !== filters.formType) {
      shouldShow = false;
    }
    
    if (filters.minRiskScore !== undefined && newAlert.risk_score < filters.minRiskScore) {
      shouldShow = false;
    }
    
    if (filters.watchlistOnly && !watchlistTickers.has(newAlert.ticker.toUpperCase())) {
      shouldShow = false;
    }

    // Add to alerts list (prepend to show newest first)
    setAlerts(prev => {
      // Check again in case state was updated
      const exists = prev.find(a => a.id === newAlert.id);
      if (exists) return prev;
      
      const updated = [newAlert, ...prev];
      // Keep within limit if specified
      if (filters.limit) {
        return updated.slice(0, filters.limit);
      }
      return updated;
    });
    
    // Update last update time
    setLastUpdate(new Date());
    
    // Play sound alert if enabled and alert passes filters
    if (shouldShow) {
      console.log('[Realtime] New alert visible, playing sound');
      playAlertSound();
    }
  }, [filters, watchlistTickers, playAlertSound]);

  // Realtime subscription hook - use ref for handleNewAlert to prevent reconnect loops
  const handleNewAlertRef = useRef(handleNewAlert);
  useEffect(() => {
    handleNewAlertRef.current = handleNewAlert;
  }, [handleNewAlert]);

  const { status: realtimeStatus, connect: connectRealtime, disconnect: disconnectRealtime } = useRealtimeAlerts({
    enabled: isPolling, // Enable Realtime when polling is enabled
    onNewAlert: useCallback((newAlert: DilutionAlert) => {
      // Use ref to call latest version without causing reconnections
      handleNewAlertRef.current(newAlert);
    }, []),
    onError: useCallback((error: Error) => {
      console.error('[Realtime] Error:', error);
      // Don't set global error, just log it
      // Polling will handle fallback
    }, []),
  });

  // Close sound menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showSoundMenu && !target.closest('.sound-menu-container')) {
        setShowSoundMenu(false);
      }
    };
    
    if (showSoundMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSoundMenu]);

  // Test sound function (can be called manually)
  const testSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const soundOption = soundOptions.find(s => s.id === selectedSound);
      
      if (soundOption) {
        soundOption.play(audioContext, audioContext.currentTime);
        
        // Close audio context after sound completes
        setTimeout(() => {
          audioContext.close().catch(() => {});
        }, 500);
      }
    } catch (error) {
      console.log("Web Audio API not available:", error);
    }
  }, [selectedSound]); // Removed soundOptions - it's now a constant outside component

  const fetchAlerts = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.ticker) params.append("ticker", filters.ticker);
      if (filters.formType) params.append("formType", filters.formType);
      if (filters.minRiskScore !== undefined) {
        params.append("minRiskScore", filters.minRiskScore.toString());
      }
      if (filters.daysBack) params.append("daysBack", filters.daysBack.toString());
      if (filters.limit) params.append("limit", filters.limit.toString());

      const response = await fetch(`/api/alerts?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.statusText}`);
      }

      const data = await response.json();
      const newAlerts = data.alerts || [];
      
      // Debug logging - client side
      console.log(`[Client] Fetched ${newAlerts.length} alerts from API`);
      if (newAlerts.length > 0) {
        const dates = newAlerts.map(a => a.date).filter(Boolean);
        const uniqueDates = [...new Set(dates)].sort().reverse();
        console.log(`[Client] Date range in results: ${uniqueDates[uniqueDates.length - 1]} to ${uniqueDates[0]} (${uniqueDates.length} unique dates)`);
        
        // Check for 1/16/2025 specifically
        const jan16Filings = newAlerts.filter(a => {
          const dateStr = a.date || '';
          return dateStr.includes('2025-01-16') || dateStr.includes('2025-01/16') || dateStr.includes('1/16/2025');
        });
        if (jan16Filings.length > 0) {
          console.log(`[Client] ✓ Found ${jan16Filings.length} filing(s) from 1/16/2025`);
        } else {
          console.log(`[Client] ⚠️  No filings from 1/16/2025 in returned results`);
          console.log(`[Client] Sample dates:`, uniqueDates.slice(0, 10));
        }
      }
      
      // Check if we have new alerts (compare alert IDs)
      const currentAlertIds = new Set(alertsRef.current.map(a => a.id));
      const hasNewAlerts = newAlerts.some(alert => !currentAlertIds.has(alert.id));
      
      if (hasNewAlerts && !isInitialLoad) {
        const newCount = newAlerts.filter(a => !currentAlertIds.has(a.id)).length;
        console.log(`New alerts detected: ${newCount}`);
        // Play sound alert if enabled
        playAlertSound();
      }
      
      setAlerts(newAlerts);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Error fetching alerts:", err);
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [filters, playAlertSound]);

  // Load watchlist on mount and when filters change (to refresh watchlist state)
  useEffect(() => {
    const loadWatchlist = async () => {
      const watched = await getWatchlist();
      setWatchlistTickers(new Set(watched));
    };
    loadWatchlist();
  }, [filters.watchlistOnly]); // Reload when watchlist filter changes

  // Filter alerts by watchlist if filter is active
  const filteredAlerts = filters.watchlistOnly
    ? alerts.filter(alert => watchlistTickers.has(alert.ticker.toUpperCase()))
    : alerts;

  const handleWatchlistChange = useCallback(() => {
    // Reload watchlist when changed
    getWatchlist().then(watched => {
      setWatchlistTickers(new Set(watched));
    });
  }, []);

  // Fetch alerts when filters change
  useEffect(() => {
    fetchAlerts(true); // Initial load
  }, [fetchAlerts]);

  // Fallback polling: Only used when Realtime is unavailable or disconnected
  // With Realtime, we still poll occasionally to ensure we didn't miss anything
  useEffect(() => {
    if (!isPolling) {
      setCountdown(15);
      return;
    }

    // If Realtime is connected, use longer polling interval as backup (5 minutes)
    // If Realtime is unavailable/error, use shorter interval (15 seconds) as primary
    const useRealtime = realtimeStatus === 'connected';
    const pollingInterval = useRealtime ? 300 : 15; // 5 minutes vs 15 seconds

    let timeoutId: NodeJS.Timeout | null = null;
    let countdownInterval: NodeJS.Timeout | null = null;
    let isActive = true;

    const scheduleNextFetch = () => {
      if (!isActive) return;

      // Clear existing timers
      if (timeoutId) clearTimeout(timeoutId);
      if (countdownInterval) clearInterval(countdownInterval);

      // Add random variance: ± 2 seconds
      // This prevents appearing like a bot with perfectly timed requests
      const variance = (Math.random() - 0.5) * 4; // -2 to +2 seconds
      const intervalMs = (pollingInterval + variance) * 1000;
      const intervalSeconds = Math.round(pollingInterval + variance);
      
      // Set initial countdown (only show if not using Realtime)
      if (!useRealtime) {
        setCountdown(intervalSeconds);
      } else {
        // Hide countdown when Realtime is active
        setCountdown(-1);
      }
      
      // Start countdown timer (only if not using Realtime)
      if (!useRealtime) {
        let currentCountdown = intervalSeconds;
        countdownInterval = setInterval(() => {
          if (!isActive) return;
          currentCountdown -= 1;
          if (currentCountdown <= 0) {
            if (countdownInterval) clearInterval(countdownInterval);
          } else {
            setCountdown(currentCountdown);
          }
        }, 1000);
      }
      
      // Schedule the actual fetch
      timeoutId = setTimeout(() => {
        if (!isActive) return;
        if (useRealtime) {
          console.log(`[Polling] Backup check (Realtime active, polling every ${pollingInterval}s)`);
        } else {
          console.log(`[Polling] Primary check (Realtime unavailable, polling every ${pollingInterval}s)`);
        }
        fetchAlerts(false); // Not initial load
        scheduleNextFetch(); // Schedule next fetch with new random variance
      }, intervalMs);
    };

    scheduleNextFetch();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [isPolling, fetchAlerts, realtimeStatus]);


  const handleFiltersChange = (newFilters: AlertFilters) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters({ limit: 500 }); // Increased default limit
  };

  const handleRowClick = (alert: DilutionAlert) => {
    setSelectedAlert(alert);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAlert(null);
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">SEC Dilution Alerts</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Short seller alerts for SEC dilution filings and capital raises
              </p>
            </div>
            <button
              onClick={() => setIsQuickStartOpen(true)}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mt-1"
              title="Getting Started Guide"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <Link
              href="/education"
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mt-1"
              title="SEC Filings Education"
            >
              <BookOpen className="w-5 h-5" />
            </Link>
            <Link
              href="/analytics"
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mt-1"
              title="Analytics & Charts"
            >
              <BarChart3 className="w-5 h-5" />
            </Link>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />
            
            {/* Sound Alert Settings */}
            <div className="relative sound-menu-container">
              <button
                onClick={() => setShowSoundMenu(!showSoundMenu)}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                title="Sound alert settings"
              >
                {enableSoundAlert ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              </button>
              
              {showSoundMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700 p-4 z-50">
                  {/* Enable/Disable Toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm text-gray-900 dark:text-white font-medium">Sound Alerts</label>
                    <button
                      onClick={() => {
                        const newValue = !enableSoundAlert;
                        setEnableSoundAlert(newValue);
                        localStorage.setItem("enableSoundAlert", String(newValue));
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        enableSoundAlert ? "bg-blue-600" : "bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          enableSoundAlert ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  
                  {/* Sound Selector */}
                  {enableSoundAlert && (
                    <>
                      <label className="block text-xs text-gray-700 dark:text-gray-400 mb-2">Sound Type</label>
                      <select
                        value={selectedSound}
                        onChange={(e) => {
                          const newSound = e.target.value;
                          setSelectedSound(newSound);
                          localStorage.setItem("selectedSound", newSound);
                        }}
                        className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {soundOptions.map((sound) => (
                          <option key={sound.id} value={sound.id}>
                            {sound.name}
                          </option>
                        ))}
                      </select>
                      
                      {/* Test Button */}
                      <button
                        onClick={testSound}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-md transition-colors"
                      >
                        <Volume2 className="w-4 h-4" />
                        Test Sound
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Polling Status & Controls */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 min-w-[240px] border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Auto-refresh</span>
                <button
                  onClick={() => setIsPolling(!isPolling)}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  title={isPolling ? "Pause auto-refresh" : "Resume auto-refresh"}
                >
                  {isPolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Realtime Status */}
              {isPolling && (
                <div className="mb-2 flex items-center gap-2">
                  {realtimeStatus === 'connected' && (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                      <Radio className="w-3.5 h-3.5 fill-current" />
                      <span className="font-medium">Real-time Active</span>
                    </div>
                  )}
                  {realtimeStatus === 'connecting' && (
                    <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting...</span>
                    </div>
                  )}
                  {(realtimeStatus === 'error' || realtimeStatus === 'disconnected') && (
                    <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                      <Radio className="w-3.5 h-3.5" />
                      <span>Using Polling</span>
                    </div>
                  )}
                  {realtimeStatus === 'unavailable' && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Radio className="w-3.5 h-3.5" />
                      <span>Realtime Unavailable</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Polling Countdown (only show if not using Realtime) */}
              {isPolling && realtimeStatus !== 'connected' && countdown >= 0 && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-sm text-gray-900 dark:text-white">
                    Next refresh in <span className="font-semibold text-blue-600 dark:text-blue-400">{countdown}s</span>
                  </span>
                </div>
              )}
              {isPolling && realtimeStatus === 'connected' && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Real-time updates active
                </div>
              )}
              {!isPolling && (
                <div className="text-sm text-gray-600 dark:text-gray-500">Paused</div>
              )}
              {lastUpdate && (
                <div className="text-xs text-gray-600 dark:text-gray-500 mt-1">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <AlertFiltersComponent
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onReset={handleResetFilters}
          onWatchlistChange={handleWatchlistChange}
        />

        {/* Content */}
        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
            <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading alerts...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-semibold">Error</h3>
            </div>
            <p className="text-red-300">{error}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {filteredAlerts.length} Alert{filteredAlerts.length !== 1 ? "s" : ""} Found
                {filters.watchlistOnly && (
                  <span className="ml-2 text-sm font-normal text-yellow-600 dark:text-yellow-400">
                    (Watchlist: {watchlistTickers.size} ticker{watchlistTickers.size !== 1 ? "s" : ""})
                  </span>
                )}
              </h2>
            </div>

            {/* Show watchlist summary when watchlist filter is active */}
            {filters.watchlistOnly && watchlistTickers.size > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-300 mb-3">
                  My Watchlist ({watchlistTickers.size} ticker{watchlistTickers.size !== 1 ? "s" : ""})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Array.from(watchlistTickers).sort().map((ticker) => {
                    const hasFiling = alerts.some(alert => alert.ticker.toUpperCase() === ticker);
                    return (
                      <div
                        key={ticker}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 ${
                          hasFiling
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        <Star className="w-3.5 h-3.5 fill-current text-yellow-500" />
                        <span>{ticker}</span>
                        {!hasFiling && (
                          <span className="text-xs opacity-75">(no filings yet)</span>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { removeFromWatchlist } = await import("@/lib/watchlist");
                            const success = await removeFromWatchlist(ticker);
                            if (success) {
                              handleWatchlistChange();
                            }
                          }}
                          className="ml-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors"
                          title="Remove from watchlist"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {Array.from(watchlistTickers).some(ticker => !alerts.some(alert => alert.ticker.toUpperCase() === ticker)) && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                    💡 Tickers shown in gray don't have filings yet. They'll appear below when filings are detected.
                  </p>
                )}
              </div>
            )}

            <AlertTable alerts={filteredAlerts} onRowClick={handleRowClick} onWatchlistChange={handleWatchlistChange} />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      {/* Quick Start Modal */}
      <QuickStartModal
        isOpen={isQuickStartOpen}
        onClose={() => setIsQuickStartOpen(false)}
      />
    </div>
  );
}
