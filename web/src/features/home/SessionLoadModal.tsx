import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ProgressBar, Wordmark, Badge } from '@/components';
import { api } from '@/api/client';
import { addRecentSession } from './recents';
import {
  Download,
  Users,
  Layers,
  Flag,
  Brain,
  CheckCircle,
  AlertTriangle,
  X,
  Timer,
} from 'lucide-react';

export interface SessionLoadModalProps {
  year: number;
  round: number;
  type: string;
  eventName: string;
  refresh?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const STAGES = [
  { key: 'downloading', label: 'Downloading Telemetry', icon: Download },
  { key: 'processing_drivers', label: 'Processing Drivers', icon: Users },
  { key: 'resampling', label: 'Resampling 25 Hz Stream', icon: Layers },
  { key: 'indexing_events', label: 'Indexing Race Events', icon: Flag },
  { key: 'computing_ml', label: 'Computing ML Analytics', icon: Brain },
];

export const SessionLoadModal: React.FC<SessionLoadModalProps> = ({
  year,
  round,
  type,
  eventName,
  refresh = false,
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const [currentStage, setCurrentStage] = useState<string>('queued');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('Initializing load pipeline...');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const handleSuccess = React.useCallback(
    (targetSid: string) => {
      setProgress(1.0);
      setCurrentStage('ready');
      setMessage('Session ready for replay.');

      addRecentSession({
        sessionId: targetSid,
        eventName,
        round,
        year,
        type,
      });

      setTimeout(() => {
        onClose();
        if (type === 'Q' || type === 'SQ') {
          navigate(`/quali/${encodeURIComponent(targetSid)}`);
        } else {
          navigate(`/race/${encodeURIComponent(targetSid)}`);
        }
      }, 600);
    },
    [eventName, round, year, type, onClose, navigate],
  );

  useEffect(() => {

    if (!isOpen) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    isCancelledRef.current = false;
    setElapsedSec(0);
    setProgress(0);
    setCurrentStage('queued');
    setMessage('Connecting to session pipeline...');
    setErrorMessage(null);

    // Start elapsed timer
    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const sessionId = `${year}_${round}_${type}`;

    // Kick off load request
    api
      .loadSession({ year, round, type, refresh })
      .then((res) => {
        if (isCancelledRef.current) return;

        const targetSid = res.sessionId || sessionId;

        // If backend returned immediate ready, navigate
        if (res.jobId === 'ready') {
          handleSuccess(targetSid);
          return;
        }

        // Subscribe to SSE
        const sseUrl = `/api/jobs/${encodeURIComponent(res.jobId)}/events`;
        const es = new EventSource(sseUrl);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          if (isCancelledRef.current) return;
          try {
            const data = JSON.parse(event.data);
            if (data.stage) {
              setCurrentStage(data.stage);
            }
            if (typeof data.progress === 'number') {
              setProgress(data.progress);
            }
            if (data.message) {
              setMessage(data.message);
            }

            if (data.stage === 'ready') {
              es.close();
              handleSuccess(targetSid);
            } else if (data.stage === 'error') {
              es.close();
              setErrorMessage(data.message || 'Error occurred while loading session.');
            }
          } catch (e) {
            console.warn('Failed to parse SSE event:', e);
          }
        };

        es.onerror = () => {
          if (isCancelledRef.current) return;
          // Fallback check job status
          api
            .getJobStatus(res.jobId)
            .then((st) => {
              if (st.status === 'completed') {
                es.close();
                handleSuccess(targetSid);
              } else if (st.status === 'failed') {
                es.close();
                setErrorMessage(st.error || 'Session load pipeline failed.');
              }
            })
            .catch(() => {
              // SSE stream closed or done
            });
        };
      })
      .catch((err) => {
        if (isCancelledRef.current) return;
        setErrorMessage(err?.message || 'Failed to initiate session load.');
      });

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, year, round, type, refresh, handleSuccess]);


  const handleCancel = () => {
    isCancelledRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--surface-0)]/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
      data-testid="session-load-modal"
    >
      <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl max-w-lg w-full p-8 shadow-2xl relative space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <Wordmark size="sm" />
            <Badge variant="insight" dot>
              {refresh ? 'REFRESHING TELEMETRY' : 'LOADING SESSION'}
            </Badge>
          </div>
          <button
            onClick={handleCancel}
            className="text-[var(--text-3)] hover:text-[var(--text-1)] p-1 rounded transition-colors"
            data-testid="load-modal-cancel-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Session Meta */}
        <div>
          <h2 className="font-display font-black text-xl text-[var(--text-1)] tracking-wide">
            {eventName}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-3)] font-mono">
            <span>{year} SEASON</span>
            <span>•</span>
            <span>ROUND {round}</span>
            <span>•</span>
            <span className="text-[var(--accent)] font-bold">{type === 'Q' ? 'QUALIFYING' : type === 'R' ? 'RACE' : type}</span>
          </div>
        </div>

        {/* Progress Bar & Status */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-[var(--text-2)] truncate max-w-[320px]">{message}</span>
            <span className="text-[var(--accent)] font-bold">{Math.round(progress * 100)}%</span>
          </div>
          <ProgressBar progress={progress} height={6} variant="accent" animated />
        </div>

        {/* Pipeline Stage Indicators */}
        <div className="space-y-2 pt-2">
          {STAGES.map((st, idx) => {
            const Icon = st.icon;
            const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
            const isCompleted = currentStage === 'ready' || (currentIdx > idx && currentIdx !== -1);
            const isCurrent = currentStage === st.key;

            return (
              <div
                key={st.key}
                className={`flex items-center justify-between p-2 rounded text-xs transition-colors ${
                  isCurrent
                    ? 'bg-[var(--surface-3)] text-[var(--text-1)] font-medium border border-[var(--accent)]/40'
                    : isCompleted
                      ? 'text-[var(--text-2)] opacity-80'
                      : 'text-[var(--text-3)] opacity-40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isCurrent
                        ? 'text-[var(--accent)] animate-pulse'
                        : isCompleted
                          ? 'text-[var(--success)]'
                          : 'text-[var(--text-disabled)]'
                    }`}
                  />
                  <span>{st.label}</span>
                </div>
                <div>
                  {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-[var(--success)]" />}
                  {isCurrent && <span className="font-mono text-[10px] text-[var(--accent)]">ACTIVE</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error notification if failed */}
        {errorMessage && (
          <div className="p-3 bg-red-950/40 border border-red-800 rounded text-xs text-red-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Session Load Failed</div>
              <div className="mt-0.5 text-[11px] text-red-300">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)] font-mono">
            <Timer className="w-3.5 h-3.5" />
            <span>Elapsed: {elapsedSec}s</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-xs text-[var(--text-2)] hover:text-[var(--text-1)]"
          >
            Cancel Load
          </Button>
        </div>
      </div>
    </div>
  );
};
