import { useEffect, useState, useCallback } from 'react';

export function useTransformationJob(designId: number | null) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'failed'>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const reset = useCallback(() => {
    setStatus('idle');
    setResultUrl(null);
    setError(null);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!designId) {
      reset();
      return;
    }

    setStatus('pending');
    let isActive = true;
    let attempts = 0;
    const maxAttempts = 60;
    const pollInterval = 3000;

    const poll = async () => {
      while (isActive && attempts < maxAttempts) {
        attempts++;
        setProgress(Math.min((attempts / 20) * 100, 95));

        try {
          const response = await fetch(`/api/designs/${designId}/status`);
          const data = await response.json();

          if (!isActive) break;

          if (data.status === 'completed') {
            setStatus('completed');
            setResultUrl(data.resultUrl);
            setProgress(100);
            return;
          }

          if (data.status === 'failed' || data.status === 'error') {
            setStatus('failed');
            setError(data.error || 'Noget gik galt. Prøv igen.');
            console.error('[Polling fejl]', { designId, status: data.status, error: data.error, errorCode: data.errorCode });
            return;
          }

          setStatus('processing');
          await new Promise(resolve => setTimeout(resolve, pollInterval));

        } catch (err) {
          console.error('Polling fejl:', err);
          await new Promise(resolve => setTimeout(resolve, pollInterval * 2));
        }
      }

      if (isActive && attempts >= maxAttempts) {
        setStatus('failed');
        setError('Det tog for lang tid. Prøv igen eller kontakt support.');
      }
    };

    poll();

    return () => {
      isActive = false;
    };
  }, [designId, reset]);

  return { status, resultUrl, error, progress, reset };
}
