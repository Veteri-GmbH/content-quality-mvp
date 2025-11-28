import { useAuth } from '@/lib/auth-context';
import { api, Audit } from '@/lib/serverComm';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Plus, 
  List, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileText,
  ArrowRight
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function Home() {
  const { user } = useAuth();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const { audits } = await api.getAudits();
        // Sort by date descending just in case the API doesn't
        const sorted = audits.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setAudits(sorted);
      } catch (err) {
        console.error('Failed to fetch audits:', err);
        setError('Konnte Audits nicht laden.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Calculate stats
  const totalAudits = audits.length;
  const completedAudits = audits.filter(a => a.status === 'completed').length;
  const inProgressAudits = audits.filter(a => ['crawling', 'analyzing'].includes(a.status)).length;
  
  const recentAudits = audits.slice(0, 5);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400';
      case 'failed': return 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400';
      case 'crawling':
      case 'analyzing': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'crawling': return 'Crawling';
      case 'analyzing': return 'Analyse';
      case 'completed': return 'Fertig';
      case 'failed': return 'Fehler';
      default: return status;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Willkommen zurück, {user?.displayName || user?.email?.split('@')[0] || 'Nutzer'}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Hier ist ein Überblick über deine Content-Qualitäts-Audits.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/audits">
              <List className="mr-2 h-4 w-4" />
              Alle Audits
            </Link>
          </Button>
          <Button asChild>
            <Link to="/audits/new">
              <Plus className="mr-2 h-4 w-4" />
              Neues Audit
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Audits</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{totalAudits}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Erstellte Reports
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abgeschlossen</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{completedAudits}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Erfolgreich analysiert
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Bearbeitung</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{inProgressAudits}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Aktuell laufende Jobs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="col-span-1">
        <CardHeader>
          <CardTitle>Letzte Aktivitäten</CardTitle>
          <CardDescription>
            Die 5 aktuellsten Audits und deren Status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-red-500 p-4 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/10">
              {error}
            </div>
          ) : recentAudits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Noch keine Audits vorhanden. Starte jetzt dein erstes Audit!
              <div className="mt-4">
                <Button asChild>
                  <Link to="/audits/new">Jetzt starten</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {recentAudits.map((audit) => (
                <Link 
                  key={audit.id} 
                  to={`/audits/${audit.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className={`p-2 rounded-full ${
                      audit.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                      audit.status === 'failed' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                      'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                      {audit.status === 'completed' ? <CheckCircle className="h-5 w-5" /> :
                       audit.status === 'failed' ? <AlertCircle className="h-5 w-5" /> :
                       <Activity className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {audit.sitemap_url}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(new Date(audit.created_at), "d. MMMM yyyy, HH:mm", { locale: de })} Uhr
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(audit.status)}`}>
                      {getStatusLabel(audit.status)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
              
              <div className="pt-4 text-center">
                <Button variant="ghost" asChild size="sm">
                  <Link to="/audits" className="text-muted-foreground">
                    Alle anzeigen <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
