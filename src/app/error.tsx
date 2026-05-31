'use client';

import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
          <h2 className="text-xl font-semibold">Something went wrong!</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          {error.message && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
              {error.message}
            </p>
          )}
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
