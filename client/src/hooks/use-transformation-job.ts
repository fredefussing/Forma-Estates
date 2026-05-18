import { useEffect, useState, useCallback, useRef } from 'react';

export function useTransformationJob(designId: number | null) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);

  const reset = useCallback(() => {
    setStatus('idle');
    setResultUrl(null);
    setVersions([]);
    setError(null);
    setStatusMessage('');
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (!designId) {
      reset();
      return;
    }

    setStatus('pending');
    setStatusMessage('Starter generering...');
    setElapsed(0);

    let isActive = true;
    const startTime = Date.now();
    const POLL_INTERVAL = 1000;
    const MAX_ELAPSED_MS = 240 * 1000; // 4 min hard stop

    // Elapsed ticker — updates every second for live counter
    const ticker = setInterval(() => {
      if (!isActive) return;
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const poll = async () => {
      while (isActive) {
        const elapsedMs = Date.now() - startTime;

        if (elapsedMs > MAX_ELAPSED_MS) {
          setStatus('failed');
          setError('Det tog for lang tid. Prøv igen eller kontakt support.');
          break;
        }

        try {
          const response = await fetch(`/api/designs/${designId}/status`);
          const data = await response.json();

          if (!isActive) break;

          if (data.status === 'completed') {
            setStatus('completed');
            setResultUrl(data.resultUrl);
            setVersions(Array.isArray(data.versions) ? data.versions : data.resultUrl ? [data.resultUrl] : []);
            setStatusMessage('Billede klar!');
            break;
          }

          if (data.status === 'failed' || data.status === 'error') {
            setStatus('failed');
            setError(data.error || 'Noget gik galt. Prøv igen.');
            console.error('[Polling fejl]', { designId, status: data.status, error: data.error });
            break;
          }

          setStatus('processing');
          if (data.statusMessage) {
            setStatusMessage(data.statusMessage);
          }

          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        } catch (err) {
          console.error('Polling netværksfejl:', err);
          // On network error, wait longer and retry
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 2));
        }
      }

      clearInterval(ticker);
    };

    poll();

    return () => {
      isActive = false;
      clearInterval(ticker);
    };
  }, [designId, reset]);

  return { status, resultUrl, versions, error, statusMessage, elapsed, reset };
}
