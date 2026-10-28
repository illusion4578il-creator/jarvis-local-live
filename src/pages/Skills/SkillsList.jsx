import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
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
  Draft: 'bg-secondary text-secondary-foreground border-border',
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
  'CreatedOn',
  'ModifiedOn'
];

const INITIAL_FORM = {
  Name: '',
  trigger_phrase_c: '',
  category_c: 'OS Control',
  status_c: 'Verified',
  run_count_c: 1,
  script_code_c: '',
  description_c: ''
};

export default function SkillsList() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { canCreate } = getTableAccess(profile, 'skills_c');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter]);

  const { data, loading, error, run } = useFetch(() => {
    const filters = [];
    if (search.trim()) filters.push(contains('Name', search.trim()));
    if (categoryFilter !== 'all') filters.push(eq('category_c', categoryFilter));
    if (statusFilter !== 'all') filters.push(eq('status_c', statusFilter));

    let q = sdk.table('skills_c').select(FIELDS);
    if (filters.length) q = q.where(and(...filters));
    return q
      .orderByDesc('run_count_c')
      .page(page, 10)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return { rows: r.data, total: r.total, hasMore: r.hasMore };
      });
  }, [search, categoryFilter, statusFilter, page]);

  const rows = data?.rows ?? [];
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
        description_c: form.description_c
      };
      const res = await sdk.table('skills_c').create(payload);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('New Python Skill saved to library');
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
              <h1 className="font-heading text-2xl sm:text-3xl font-bold">
                Autonomous Python Skill Library
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Reusable Python scripts written and saved in <code className="bg-primary-foreground/15 px-1.5 py-0.5 rounded text-xs">./skills/</code> when Akash teaches Jarvis a new workflow.
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
        {/* Filters Toolbar */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <ApperIcon
                name="Search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skill name (e.g. organize_downloads_folder)..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {SKILL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {SKILL_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Data Region */}
        {firstLoad ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center justify-between p-6">
              <p className="text-sm text-destructive">Failed to load skills: {error}</p>
              <Button variant="outline" size="sm" onClick={run}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : !rows.length ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <ApperIcon name="Code2" size={32} className="text-muted-foreground" />
              <p className="text-base font-medium">No learned Python skills match your filters</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Teach Jarvis a step-by-step automation task and save the generated Python script into your local skill registry.
              </p>
              {canCreate && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <ApperIcon name="Plus" size={15} />
                  Teach New Skill
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
              <Card
                key={skill.Id}
                onClick={() => navigate(`/skills/${skill.Id}`)}
                className="cursor-pointer shadow-md hover:border-primary/50 transition-all"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/skills/${skill.Id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-base font-bold text-primary hover:underline truncate block"
                      >
                        {skill.Name}.py
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        Trigger: “{skill.trigger_phrase_c || 'No voice trigger set'}”
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {skill.category_c}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', STATUS_STYLES[skill.status_c])}
                      >
                        {skill.status_c}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-foreground line-clamp-2">{skill.description_c}</p>

                  <pre className="rounded bg-muted/60 p-2.5 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-24">
                    {skill.script_code_c}
                  </pre>

                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground border-t border-border">
                    <span className="font-mono font-medium text-foreground">
                      Executed {skill.run_count_c ?? 0} times
                    </span>
                    <span>Updated {formatLocalDate(skill.ModifiedOn, DATE_FORMATS.SHORT)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {(page > 1 || data?.hasMore) && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.hasMore || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Create Skill Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Teach Jarvis a New Python Skill</DialogTitle>
            <DialogDescription>
              Define the Hinglish voice trigger, instructions, and executable Python code for <code className="text-xs">./skills/</code>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="skill-name">Skill Name *</Label>
              <Input
                id="skill-name"
                value={form.Name}
                onChange={(e) => setForm({ ...form, Name: e.target.value })}
                placeholder="e.g. backup_obsidian_vault"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-trigger">Hinglish Voice Trigger</Label>
              <Input
                id="skill-trigger"
                value={form.trigger_phrase_c}
                onChange={(e) => setForm({ ...form, trigger_phrase_c: e.target.value })}
                placeholder="e.g. Jarvis, mere Obsidian notes ka zip backup bana do"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category_c}
                  onValueChange={(v) => setForm({ ...form, category_c: v })}
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
                  onValueChange={(v) => setForm({ ...form, status_c: v })}
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

              <div className="space-y-1.5">
                <Label htmlFor="skill-runs">Execution Count</Label>
                <Input
                  id="skill-runs"
                  type="number"
                  value={form.run_count_c}
                  onChange={(e) => setForm({ ...form, run_count_c: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-desc">Step-by-Step Instructions</Label>
              <Textarea
                id="skill-desc"
                rows={2}
                value={form.description_c}
                onChange={(e) => setForm({ ...form, description_c: e.target.value })}
                placeholder="Describe what this skill automates on Akash's PC..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-code">Python Script Code</Label>
              <Textarea
                id="skill-code"
                rows={5}
                className="font-mono text-xs"
                value={form.script_code_c}
                onChange={(e) => setForm({ ...form, script_code_c: e.target.value })}
                placeholder={"import os, subprocess\ndef run():\n    return 'Done'"}
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
