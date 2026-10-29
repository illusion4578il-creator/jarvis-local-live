import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
import ApperIcon from '@/components/ApperIcon';
import { ListSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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

export const route = { path: '/memories', layout: 'owner', access: 'authenticated' };
export const nav = {
  icon: 'Brain',
  label: 'Memory Store',
  order: 50,
  profiles: null,
  count: { table: 'memories_c', where: null }
};

const { eq, contains, and } = window.ApperSDK.CoreSDK;

const MEMORY_TYPES = ['Preference', 'Directive', 'Insight', 'Workflow'];
const IMPORTANCE_LEVELS = ['Critical', 'High', 'Normal', 'Low'];

const IMPORTANCE_STYLES = {
  Critical: 'bg-destructive/15 text-destructive border-destructive/30',
  High: 'bg-warning-muted text-warning-foreground border-warning-border',
  Normal: 'bg-primary/15 text-primary border-primary/30',
  Low: 'bg-muted text-muted-foreground border-border'
};

const FIELDS = [
  'Id',
  'Name',
  'memory_type_c',
  'importance_c',
  'active_c',
  'context_notes_c',
  'Owner',
  'CreatedOn'
];

const INITIAL_FORM = {
  Name: '',
  memory_type_c: 'Preference',
  importance_c: 'High',
  active_c: true,
  context_notes_c: ''
};

export default function MemoriesList() {
  const { profile } = useProfile();
  const { canCreate, canUpdate } = getTableAccess(profile, 'memories_c');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [importanceFilter, setImportanceFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, importanceFilter]);

  const { data, loading, error, run, setData } = useFetch(() => {
    const filters = [];
    if (search.trim()) filters.push(contains('Name', search.trim()));
    if (typeFilter !== 'all') filters.push(eq('memory_type_c', typeFilter));
    if (importanceFilter !== 'all') filters.push(eq('importance_c', importanceFilter));

    let q = sdk.table('memories_c').select(FIELDS);
    if (filters.length) q = q.where(and(...filters));

    return q
      .orderByDesc('CreatedOn')
      .page(page, 12)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return { rows: r.data, total: r.total, hasMore: r.hasMore };
      });
  }, [search, typeFilter, importanceFilter, page]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const firstLoad = loading && data === undefined;

  async function handleToggleActive(mem, nextVal) {
    const prevRows = rows;
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.Id === mem.Id ? { ...r, active_c: Boolean(nextVal) } : r))
          }
        : prev
    );

    const res = await sdk.table('memories_c').update({
      Id: mem.Id,
      active_c: Boolean(nextVal)
    });

    if (!res.data?.length) {
      setData((prev) => (prev ? { ...prev, rows: prevRows } : prev));
      toast.error(res.messages?.[0] || 'Failed to update memory state');
      return;
    }
    toast.success(nextVal ? 'Memory injected into active System Prompt' : 'Memory muted from System Prompt');
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Memory Fact is required');
      return;
    }
    setSaving(true);
    try {
      const res = await sdk.table('memories_c').create({
        Name: form.Name.trim(),
        memory_type_c: form.memory_type_c,
        importance_c: form.importance_c,
        active_c: Boolean(form.active_c),
        context_notes_c: form.context_notes_c.trim()
      });
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('Memory node saved to ./memory_store/akash_memory.json');
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
                  Mem0 + JSON Persistent Memory
                </Badge>
                <span className="text-xs text-primary-foreground/80">
                  ./memory_store/akash_memory.json
                </span>
              </div>
              <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-bold">
                Long-Term Memory & Persona Directives
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Manage Akash’s personal preferences, system directives, and book insights injected into Jarvis’s context window.
              </p>
            </div>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold"
              >
                <ApperIcon name="Plus" size={16} />
                Add Memory Node
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memory facts or directives..." />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Memory Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Memory Types</SelectItem>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={importanceFilter} onValueChange={setImportanceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {IMPORTANCE_LEVELS.map((lvl) => (
                    <SelectItem key={lvl} value={lvl}>
                      {lvl}
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
                <ApperIcon name="Brain" size={24} />
              </div>
              <h2 className="font-heading text-lg font-semibold">No memory nodes found</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Store long-term facts, environment paths, and persona directives for Jarvis.
              </p>
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <ApperIcon name="Plus" size={16} />
                  Add Memory Node
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            aria-busy={loading}
            className={cn('space-y-3 transition-opacity', loading && 'pointer-events-none opacity-60')}
          >
            {rows.map((mem) => (
              <Card key={mem.Id} className="shadow-sm hover:border-primary/40 transition-colors">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {mem.memory_type_c}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', IMPORTANCE_STYLES[mem.importance_c] || '')}
                        >
                          {mem.importance_c}
                        </Badge>
                      </div>
                      <Link
                        to={`/memories/${mem.Id}`}
                        className="font-heading text-base font-bold text-foreground hover:text-primary block pt-1"
                      >
                        {mem.Name}
                      </Link>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {mem.context_notes_c || 'No additional context notes.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {canUpdate && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={Boolean(mem.active_c)}
                            onCheckedChange={(checked) => handleToggleActive(mem, checked)}
                            aria-label="Toggle active prompt injection"
                          />
                          <span className="text-xs text-muted-foreground">
                            {mem.active_c ? 'Active' : 'Muted'}
                          </span>
                        </div>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/memories/${mem.Id}`}>
                          Inspect
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
              Page {page} · {total} total memory nodes
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
            <DialogTitle className="font-heading">Add Persistent Memory Node</DialogTitle>
            <DialogDescription>
              Stores a long-term preference, directive, or insight for Akash in ./memory_store/akash_memory.json.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mem-name">Memory Fact *</Label>
              <Input id="mem-name" required value={form.Name} onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))} placeholder="Always open projects in VS Code with dark profile" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Memory Type</Label>
                <Select value={form.memory_type_c} onValueChange={(v) => setForm((f) => ({ ...f, memory_type_c: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMORY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.importance_c} onValueChange={(v) => setForm((f) => ({ ...f, importance_c: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORTANCE_LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="mem-active">Inject in System Prompt</Label>
                <p className="text-xs text-muted-foreground">Include this fact in Jarvis’s active prompt context</p>
              </div>
              <Switch id="mem-active" checked={Boolean(form.active_c)} onCheckedChange={(v) => setForm((f) => ({ ...f, active_c: Boolean(v) }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mem-notes">Detailed Context & Source</Label>
              <Textarea id="mem-notes" rows={3} value={form.context_notes_c} onChange={(e) => setForm((f) => ({ ...f, context_notes_c: e.target.value }))} placeholder="Additional context or voice session notes..." />
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
                  'Save Memory'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
