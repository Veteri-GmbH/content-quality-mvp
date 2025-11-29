import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/serverComm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, CheckCircle2, FileSearch, Rocket, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'input' | 'parsing' | 'starting' | 'success';

interface StepInfo {
  id: Step;
  label: string;
  description: string;
}

const steps: StepInfo[] = [
  { id: 'input', label: 'URL eingeben', description: 'Sitemap-URL angeben' },
  { id: 'parsing', label: 'Sitemap laden', description: 'URLs werden extrahiert' },
  { id: 'starting', label: 'Audit starten', description: 'Analyse wird vorbereitet' },
  { id: 'success', label: 'Fertig', description: 'Weiterleitung zum Audit' },
];

export function NewAudit() {
  const navigate = useNavigate();
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [rateLimit, setRateLimit] = useState(1000);
  const [urlLimit, setUrlLimit] = useState<number | undefined>(undefined);
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [error, setError] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'http:' ||
        parsed.protocol === 'https:'
      );
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sitemapUrl.trim()) {
      setError('Bitte geben Sie eine Sitemap-URL ein');
      return;
    }

    if (!validateUrl(sitemapUrl)) {
      setError('Bitte geben Sie eine gültige URL ein');
      return;
    }

    // Check if URL looks like a sitemap
    if (
      !sitemapUrl.toLowerCase().includes('sitemap') &&
      !sitemapUrl.toLowerCase().endsWith('.xml')
    ) {
      if (
        !confirm(
          'Die URL scheint keine Sitemap zu sein. Möchten Sie trotzdem fortfahren?'
        )
      ) {
        return;
      }
    }

    try {
      // Step 1: Parsing sitemap
      setCurrentStep('parsing');
      
      // Small delay to show the step transition
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 2: Starting audit
      setCurrentStep('starting');
      const result = await api.createAudit({
        sitemap_url: sitemapUrl.trim(),
        rate_limit_ms: rateLimit,
        url_limit: urlLimit,
      });
      
      setAuditId(result.id);
      
      // Step 3: Success
      setCurrentStep('success');
      
      // Auto-redirect after 2 seconds
      setTimeout(() => {
        navigate(`/audits/${result.id}`);
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fehler beim Erstellen des Audits'
      );
      setCurrentStep('input');
      console.error('Error creating audit:', err);
    }
  };

  const isProcessing = currentStep !== 'input';
  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Button
        variant="ghost"
        onClick={() => navigate('/audits')}
        className="mb-4"
        disabled={isProcessing && currentStep !== 'success'}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Zurück
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Neuen Audit erstellen</CardTitle>
          <CardDescription>
            Geben Sie die URL einer Sitemap.xml ein, um einen neuen Content-Quality-Audit zu starten
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Progress Stepper */}
          {isProcessing && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                {steps.map((step, index) => {
                  const isActive = index === currentStepIndex;
                  const isCompleted = index < currentStepIndex;
                  const isPending = index > currentStepIndex;
                  
                  return (
                    <div key={step.id} className="flex-1 relative">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                            isCompleted && 'bg-green-600 border-green-600 text-white',
                            isActive && 'bg-primary border-primary text-primary-foreground animate-pulse',
                            isPending && 'bg-muted border-muted-foreground/30 text-muted-foreground'
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : isActive ? (
                            step.id === 'parsing' ? (
                              <FileSearch className="h-5 w-5" />
                            ) : step.id === 'starting' ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : step.id === 'success' ? (
                              <Rocket className="h-5 w-5" />
                            ) : (
                              <span className="text-sm font-medium">{index + 1}</span>
                            )
                          ) : (
                            <span className="text-sm font-medium">{index + 1}</span>
                          )}
                        </div>
                        <div className="mt-2 text-center">
                          <div className={cn(
                            'text-xs font-medium',
                            isActive && 'text-primary',
                            isCompleted && 'text-green-600 dark:text-green-400',
                            isPending && 'text-muted-foreground'
                          )}>
                            {step.label}
                          </div>
                        </div>
                      </div>
                      {/* Connection line */}
                      {index < steps.length - 1 && (
                        <div 
                          className={cn(
                            'absolute top-5 left-1/2 w-full h-0.5 transition-all duration-500',
                            isCompleted ? 'bg-green-600' : 'bg-muted'
                          )}
                          style={{ transform: 'translateX(50%)' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Current step message */}
              <div className="text-center mt-6 p-4 bg-muted/50 rounded-lg">
                {currentStep === 'parsing' && (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm">Sitemap wird geladen und URLs werden extrahiert...</span>
                  </div>
                )}
                {currentStep === 'starting' && (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm">Audit wird gestartet, bitte warten...</span>
                  </div>
                )}
                {currentStep === 'success' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Audit erfolgreich gestartet!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sie werden automatisch weitergeleitet...
                    </p>
                    {auditId && (
                      <Button
                        variant="link"
                        onClick={() => navigate(`/audits/${auditId}`)}
                        className="text-primary"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Jetzt zum Audit wechseln
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className={cn('space-y-6', isProcessing && 'opacity-50 pointer-events-none')}>
            <div className="space-y-2">
              <Label htmlFor="sitemap-url">Sitemap URL</Label>
              <Input
                id="sitemap-url"
                type="url"
                placeholder="https://example.com/sitemap.xml"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                disabled={isProcessing}
                required
              />
              <p className="text-xs text-muted-foreground">
                Die URL sollte auf eine XML-Sitemap oder einen Sitemap-Index zeigen
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url-limit">
                URL-Limit (optional)
              </Label>
              <Select
                value={urlLimit?.toString() || 'all'}
                onValueChange={(value) => setUrlLimit(value === 'all' ? undefined : parseInt(value))}
                disabled={isProcessing}
              >
                <SelectTrigger id="url-limit">
                  <SelectValue placeholder="Alle URLs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle URLs</SelectItem>
                  <SelectItem value="10">10 URLs</SelectItem>
                  <SelectItem value="25">25 URLs</SelectItem>
                  <SelectItem value="50">50 URLs</SelectItem>
                  <SelectItem value="100">100 URLs</SelectItem>
                  <SelectItem value="250">250 URLs</SelectItem>
                  <SelectItem value="500">500 URLs</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Limitiere die Anzahl der zu crawlenden URLs aus der Sitemap (nützlich zum Testen)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-limit">
                Rate Limit: {rateLimit}ms
              </Label>
              <Input
                id="rate-limit"
                type="range"
                min="500"
                max="5000"
                step="100"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value))}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                Verzögerung zwischen Crawling-Anfragen (empfohlen: 1000ms)
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Wird verarbeitet...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Audit starten
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/audits')}
                disabled={isProcessing}
              >
                Abbrechen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
