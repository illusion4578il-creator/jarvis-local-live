import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
import ApperIcon from '@/components/ApperIcon';
import LookupPicker from '@/components/LookupPicker';
import { ListSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/utils/date';

export const route = { path: '/executions', layout: 'owner', access: 'authenticated' };
export const nav = {
  icon: 'Terminal',
  label: 'OS Execution Logs',
  order: 40,
  profiles: null,
  count: { table: 'executions_c', where: null }
};

const { eq, contains, and } = window.ApperSDK.CoreSDK;

const TOOL_OPTIONS = ['OS_Control', 'Skill_Runner', 'RAG_Search', 'Memory'];
const STATUS_OPTIONS = ['Success', 'Auto_Fixed', 'Failed', 'Running'];

const STATUS_BADGE = {
  Success: 'bg-success-muted text-success border-success-border',
  Auto_Fixed: 'bg-warning-muted text-warning-foreground border-warning-border',
  Running: 'bg-primary/15 text-primary border-primary/30',
  Failed: 'bg-destructive/15 text-destructive border-destructive/30'
};

const FIELDS = [
  'Id',
  'Name',
  'tool_used_c',
  'status_c',
  'skill_c',
  'latency_ms_c',
  'spoken_reply_c',
  'Owner',
  'CreatedOn'
];

const INITIAL_FORM = {
  Name: '',
  tool_used_c: 'OS_Control',
  status_c: 'Success',
  skill_c: null,
  latency_ms_c: 620,
  spoken_reply_c: ''
};

export default function ExecutionsList() {
  const { profile } = useProfile();
  const { canCreate } = getTableAccess(profile, 'executions_c');

  const [search, setSearch] = useState('');
  const [toolFilter, setToolFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    setPage(1);
  }, [search, toolFilter, statusFilter]);

  const { data, loading, error, run } = useFetch(() => {
    const filters = [];
    if (search.trim()) filters.push(contains('Name', search.trim()));
    if (toolFilter !== 'all') filters.push(eq('tool_used_c', toolFilter));
    if (statusFilter !== 'all') filters.push(eq('status_c', statusFilter));

    let q = sdk.table('executions_c').select(FIELDS);
    if (filters.length) q = q.where(and(...filters));

    return q
      .orderByDesc('CreatedOn')
      .page(page, 12)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return { rows: r.data, total: r.total, hasMore: r.hasMore };
      });
  }, [search, toolFilter, statusFilter, page]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const firstLoad = loading && data === undefined;

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Voice Command is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        Name: form.Name.trim(),
        tool_used_c: form.tool_used_c,
        status_c: form.status_c,
        skill_c: form.skill_c?.Id ?? form.skill_c ?? null,
        latency_ms_c: Number(form.latency_ms_c) || 600,
        spoken_reply_c: form.spoken_reply_c.trim()
      };
      const res = await sdk.table('executions_c').create(payload);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('OS execution logged');
      setCreateOpen(false);
      setForm(INITIAL_FORM);
      run();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-12">
      <section className="w-full bg-primary text-primary-foreground border-b border-border shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-highlight text-highlight-foreground">
                  Open Interpreter + PyAutoGUI
                </Badge>
                <span className="text-xs text-primary-foreground/80">
                  Self-Debugging OS & Voice Telemetry
                </span>
              </div>
              <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-bold">
                OS Execution & Voice Telemetry Logs
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Audit every voice command, autonomous traceback retry, skill run, and spoken Hinglish response.
              </p>
            </div>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold"
              >
                <ApperIcon name="Plus" size={16} />
                Log Voice / OS Execution
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Hinglish voice command..." />
              <Select value={toolFilter} onValueChange={setToolFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Agent Tools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agent Tools</SelectItem>
                  {TOOL_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Run Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Run Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {firstLoad ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center justify-between p-6">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={run}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ApperIcon name="Terminal" size={24} />
              </div>
              <h2 className="font-heading text-lg font-semibold">No OS execution logs found</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Run a Hinglish voice command from the Command Center or log a manual tool execution here.
              </p>
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <ApperIcon name="Plus" size={16} />
                  Log Voice / OS Execution
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            aria-busy={loading}
            className={cn('space-y-3 transition-opacity', loading && 'pointer-events-none opacity-60')}
          >
            {rows.map((item) => (
              <Card key={item.Id} className="shadow-sm hover:border-primary/40 transition-colors">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5 min-w-0">
                      <Link
                        to={`/executions/${item.Id}`}
                        className="font-heading text-base font-bold text-foreground hover:text-primary block"
                      >
                        “{item.Name}”
                      </Link>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        <strong className="text-foreground">Jarvis Reply:</strong> {item.spoken_reply_c || '—'}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                        <span>
                          Linked Skill: <strong className="text-foreground">{item.skill_c?.Name || 'None'}</strong>
                        </span>
                        <span>·</span>
                        <span>{formatRelativeTime(item.CreatedOn)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {item.tool_used_c}
                      </Badge>
                      <Badge variant="outline" className={cn('text-xs', STATUS_BADGE[item.status_c] || '')}>
                        {item.status_c}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {item.latency_ms_c ?? 600} ms
                      </Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/executions/${item.Id}`}>
                          Details
                          <ApperIcon name="ArrowRight" size={14} />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {total > 12 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Page {page} · {total} total logs
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data?.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Log Voice & OS Execution</DialogTitle>
            <DialogDescription>
              Record a Hinglish voice command, the tool invoked, latency, and spoken reply.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exec-cmd">Voice Command *</Label>
              <Input id="exec-cmd" required value={form.Name} onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))} placeholder="Jarvis, mera downloads folder clean kar do" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Agent Tool</Label>
                <Select value={form.tool_used_c} onValueChange={(v) => setForm((f) => ({ ...f, tool_used_c: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOL_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Run Status</Label>
                <Select value={form.status_c} onValueChange={(v) => setForm((f) => ({ ...f, status_c: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exec-lat">Voice Latency (ms)</Label>
                <Input id="exec-lat" type="number" value={form.latency_ms_c} onChange={(e) => setForm((f) => ({ ...f, latency_ms_c: e.target.value }))} placeholder="620" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Linked Skill (Optional)</Label>
              <LookupPicker
                table="skills_c"
                searchField="Name"
                value={form.skill_c?.Id ?? form.skill_c ?? null}
                onChange={(id) => setForm((f) => ({ ...f, skill_c: id }))}
                clearable
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exec-reply">Jarvis Hinglish Reply & Output</Label>
              <Textarea id="exec-reply" rows={3} value={form.spoken_reply_c} onChange={(e) => setForm((f) => ({ ...f, spoken_reply_c: e.target.value }))} placeholder="On it, Akash. Task complete ho gaya hai." />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <ApperIcon name="LoaderCircle" size={16} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Execution Log'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
