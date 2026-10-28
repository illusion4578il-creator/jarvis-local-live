import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
import ApperIcon from '@/components/ApperIcon';
import { DetailSkeleton } from '@/components/PageSkeleton';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatLocalDate, DATE_FORMATS } from '@/utils/date';

export const route = { path: '/skills/:id', layout: 'owner', access: 'authenticated' };

const SKILL_CATEGORIES = ['OS Control', 'File Ops', 'Browser', 'Media', 'DevOps'];
const SKILL_STATUSES = ['Verified', 'Draft', 'Debugging', 'Deprecated'];

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

export default function SkillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { canUpdate, canDelete } = getTableAccess(profile, 'skills_c');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    Name: '',
    trigger_phrase_c: '',
    category_c: 'OS Control',
    status_c: 'Verified',
    run_count_c: 0,
    script_code_c: '',
    description_c: ''
  });

  const { data: skill, loading, error, run } = useFetch(async () => {
    const res = await sdk.table('skills_c').select(FIELDS).get(id);
    return res.data;
  }, [id]);

  function openEdit() {
    if (!skill) return;
    setForm({
      Name: skill.Name || '',
      trigger_phrase_c: skill.trigger_phrase_c || '',
      category_c: skill.category_c || 'OS Control',
      status_c: skill.status_c || 'Verified',
      run_count_c: skill.run_count_c ?? 0,
      script_code_c: skill.script_code_c || '',
      description_c: skill.description_c || ''
    });
    setEditOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await sdk.table('skills_c').update({
        Id: skill.Id,
        Name: form.Name.trim(),
        trigger_phrase_c: form.trigger_phrase_c.trim(),
        category_c: form.category_c,
        status_c: form.status_c,
        run_count_c: Number(form.run_count_c) || 0,
        script_code_c: form.script_code_c,
        description_c: form.description_c
      });
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('Skill updated');
      setEditOpen(false);
      run();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await sdk.table('skills_c').remove(skill.Id);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      toast.success('Skill deleted from library');
      navigate('/skills');
    } finally {
      setDeleting(false);
    }
  }

  const firstLoad = loading && skill === undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/skills">
            <ApperIcon name="ArrowLeft" size={16} />
            Back to Learned Skills
          </Link>
        </Button>
      </div>

      {firstLoad ? (
        <DetailSkeleton />
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between p-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={run}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !skill ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-base font-medium">Skill not found</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/skills">Back to Learned Skills</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-md">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{skill.category_c}</Badge>
                  <Badge variant="outline">{skill.status_c}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {skill.run_count_c ?? 0} executions
                  </span>
                </div>
                <CardTitle className="mt-2 font-mono text-2xl text-primary">
                  ./skills/{skill.Name}.py
                </CardTitle>
                <CardDescription className="mt-1">
                  Hinglish Voice Trigger: “{skill.trigger_phrase_c || 'None'}”
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(skill.script_code_c || '');
                    toast.success('Copied Python skill code');
                  }}
                >
                  <ApperIcon name="Copy" size={15} />
                  Copy Script
                </Button>
                {canUpdate && (
                  <Button variant="outline" size="sm" onClick={openEdit}>
                    <ApperIcon name="Pencil" size={15} />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <ApperIcon name="Trash2" size={15} />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Step-by-Step Instructions
              </h3>
              <p className="mt-1.5 text-sm text-foreground">{skill.description_c || '—'}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Executable Python Code
              </h3>
              <pre className="rounded-md border border-border bg-muted/50 p-4 text-xs sm:text-sm font-mono overflow-x-auto leading-relaxed">
                {skill.script_code_c || '# No code provided'}
              </pre>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-4 border-t border-border text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Owner:</span> {skill.Owner?.Name || 'Akash Sharma'}
              </div>
              <div>
                <span className="font-medium text-foreground">Created:</span>{' '}
                {formatLocalDate(skill.CreatedOn, DATE_FORMATS.SHORT)}
              </div>
              <div>
                <span className="font-medium text-foreground">Last Modified:</span>{' '}
                {formatLocalDate(skill.ModifiedOn, DATE_FORMATS.SHORT)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Learned Skill</DialogTitle>
            <DialogDescription>Modify trigger phrase, status, or Python implementation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-skill-name">Skill Name *</Label>
              <Input
                id="edit-skill-name"
                value={form.Name}
                onChange={(e) => setForm({ ...form, Name: e.target.value })}
                placeholder="organize_downloads_folder"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-skill-trigger">Hinglish Voice Trigger</Label>
              <Input
                id="edit-skill-trigger"
                value={form.trigger_phrase_c}
                onChange={(e) => setForm({ ...form, trigger_phrase_c: e.target.value })}
                placeholder="Jarvis, mera downloads folder clean kar do"
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
                <Label htmlFor="edit-skill-runs">Execution Count</Label>
                <Input
                  id="edit-skill-runs"
                  type="number"
                  value={form.run_count_c}
                  onChange={(e) => setForm({ ...form, run_count_c: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-skill-desc">Step-by-Step Instructions</Label>
              <Textarea
                id="edit-skill-desc"
                rows={2}
                value={form.description_c}
                onChange={(e) => setForm({ ...form, description_c: e.target.value })}
                placeholder="Describe what this skill does..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-skill-code">Python Script Code</Label>
              <Textarea
                id="edit-skill-code"
                rows={5}
                className="font-mono text-xs"
                value={form.script_code_c}
                onChange={(e) => setForm({ ...form, script_code_c: e.target.value })}
                placeholder="def run(): ..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <ApperIcon name="LoaderCircle" size={16} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill {skill?.Name}.py?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this Python skill from Jarvis’s skill registry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Skill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
