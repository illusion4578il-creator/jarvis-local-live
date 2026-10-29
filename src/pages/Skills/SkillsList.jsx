import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
import ApperIcon from '@/components/ApperIcon';
import { ListSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';

export const route = { path: '/skills', layout: 'owner', access: 'authenticated' };
export const nav = {
  icon: 'Code2',
  label: 'Learned Skills',
  order: 20,
  profiles: null,
  count: { table: 'skills_c', where: null }
};

const { eq, contains, and } = window.ApperSDK.CoreSDK;

const SKILL_CATEGORIES = ['OS Control', 'File Ops', 'Browser', 'Media', 'DevOps'];
const SKILL_STATUSES = ['Verified', 'Draft', 'Debugging', 'Deprecated'];

const STATUS_STYLES = {
  Verified: 'bg-success-muted text-success border-success-border',
  Draft: 'bg-muted text-muted-foreground border-border',
  Debugging: 'bg-warning-muted text-warning-foreground border-warning-border',
  Deprecated: 'bg-destructive/15 text-destructive border-destructive/30'
};

const FIELDS = [
  'Id',
  'Name',
  'trigger_phrase_c',
  'category_c',
  'status_c',
  'run_count_c',
  'script_code_c',
  'description_c',
  'Owner',
  'CreatedOn',
  'ModifiedOn'
];

const INITIAL_FORM = {
  Name: '',
  trigger_phrase_c: '',
  category_c: 'OS Control',
  status_c: 'Verified',
  run_count_c: 0,
  script_code_c: 'import os, subprocess\n\ndef run():\n    return "Executed custom Jarvis skill"\n\nif __name__ == "__main__":\n    print(run())',
  description_c: ''
};

export default function SkillsList() {
  const { profile } = useProfile();
  const { canCreate } = getTableAccess(profile, 'skills_c');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('run_count_c');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter, sortBy]);

  const { data, loading, error, run } = useFetch(() => {
    const filters = [];
    if (search.trim()) filters.push(contains('Name', search.trim()));
    if (categoryFilter !== 'all') filters.push(eq('category_c', categoryFilter));
    if (statusFilter !== 'all') filters.push(eq('status_c', statusFilter));

    let q = sdk.table('skills_c').select(FIELDS);
    if (filters.length) q = q.where(and(...filters));

    if (sortBy === 'Name') {
      q = q.orderBy('Name');
    } else {
      q = q.orderByDesc(sortBy);
    }

    return q
      .page(page, 12)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return { rows: r.data, total: r.total, hasMore: r.hasMore };
      });
  }, [search, categoryFilter, statusFilter, sortBy, page]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const firstLoad = loading && data === undefined;

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Skill Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        Name: form.Name.trim(),
        trigger_phrase_c: form.trigger_phrase_c.trim(),
        category_c: form.category_c,
        status_c: form.status_c,
        run_count_c: Number(form.run_count_c) || 0,
        script_code_c: form.script_code_c,
        description_c: form.description_c.trim()
      };
      const res = await sdk.table('skills_c').create(payload);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('New Python skill saved to ./skills/ library');
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
                  ./skills/ Dynamic Library
                </Badge>
                <span className="text-xs text-primary-foreground/80">
                  Autonomous Python Skill Acquisition
                </span>
              </div>
              <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-bold">
                Learned Python Skills Library
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Every workflow Akash teaches Jarvis is compiled into a standalone Python module and registered for voice execution.
              </p>
            </div>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold"
              >
                <ApperIcon name="Plus" size={16} />
                Teach New Python Skill
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search skill name (e.g. organize_downloads)..."
                />
              </div>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {SKILL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {SKILL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="run_count_c">Most Executed</SelectItem>
                  <SelectItem value="CreatedOn">Recently Learned</SelectItem>
                  <SelectItem value="Name">Alphabetical (A–Z)</SelectItem>
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
                <ApperIcon name="Code2" size={24} />
              </div>
              <h2 className="font-heading text-lg font-semibold">No matching Python skills</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Teach Jarvis a step-by-step OS or developer automation task to save it as a reusable Python module.
              </p>
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <ApperIcon name="Plus" size={16} />
                  Teach New Python Skill
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            aria-busy={loading}
            className={cn(
              'grid grid-cols-1 gap-4 md:grid-cols-2 transition-opacity',
              loading && 'pointer-events-none opacity-60'
            )}
          >
            {rows.map((skill) => (
              <Card key={skill.Id} className="shadow-md hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        to={`/skills/${skill.Id}`}
                        className="font-mono text-base font-bold text-primary hover:underline"
                      >
                        {skill.Name}.py
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Trigger: <span className="text-foreground font-medium">“{skill.trigger_phrase_c || '—'}”</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        {skill.category_c}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', STATUS_STYLES[skill.status_c] || '')}
                      >
                        {skill.status_c}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                    {skill.description_c || 'No step-by-step description provided.'}
                  </p>
                  <pre className="rounded-md border border-border bg-muted/40 p-2.5 text-xs font-mono text-foreground overflow-x-auto max-h-28">
                    {skill.script_code_c}
                  </pre>
                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <span>
                      Executed <strong className="text-foreground">{skill.run_count_c ?? 0}</strong> times · Updated {formatLocalDate(skill.ModifiedOn || skill.CreatedOn, DATE_FORMATS.SHORT)}
                    </span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/skills/${skill.Id}`}>
                        Inspect & Run
                        <ApperIcon name="ArrowRight" size={14} />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {total > 12 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Page {page} · {total} total skills
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Teach Jarvis a New Python Skill</DialogTitle>
            <DialogDescription>
              Saves a standalone Python module in ./skills/ and registers its Hinglish voice trigger.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="skill-name">Skill Name (snake_case) *</Label>
                <Input
                  id="skill-name"
                  required
                  value={form.Name}
                  onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))}
                  placeholder="backup_coding_projects"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-runs">Execution Count</Label>
                <Input
                  id="skill-runs"
                  type="number"
                  value={form.run_count_c}
                  onChange={(e) => setForm((f) => ({ ...f, run_count_c: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-trigger">Hinglish Voice Trigger</Label>
              <Input
                id="skill-trigger"
                value={form.trigger_phrase_c}
                onChange={(e) => setForm((f) => ({ ...f, trigger_phrase_c: e.target.value }))}
                placeholder="Jarvis, mere saare active coding projects zip karke backup folder mein daalo"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category_c}
                  onValueChange={(v) => setForm((f) => ({ ...f, category_c: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status_c}
                  onValueChange={(v) => setForm((f) => ({ ...f, status_c: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-desc">Step-by-Step Instructions</Label>
              <Textarea
                id="skill-desc"
                rows={2}
                value={form.description_c}
                onChange={(e) => setForm((f) => ({ ...f, description_c: e.target.value }))}
                placeholder="Describe the steps Jarvis performs when this skill is triggered..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-code">Python Script Code</Label>
              <Textarea
                id="skill-code"
                rows={5}
                className="font-mono text-xs"
                value={form.script_code_c}
                onChange={(e) => setForm((f) => ({ ...f, script_code_c: e.target.value }))}
                placeholder="def run(): ..."
              />
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
                  'Save Skill'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
