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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [executing, setExecuting] = useState(false);
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

  function openEditDialog() {
    if (!skill) return;
    setForm({
      Name: skill.Name ?? '',
      trigger_phrase_c: skill.trigger_phrase_c ?? '',
      category_c: skill.category_c ?? 'OS Control',
      status_c: skill.status_c ?? 'Verified',
      run_count_c: skill.run_count_c ?? 0,
      script_code_c: skill.script_code_c ?? '',
      description_c: skill.description_c ?? ''
    });
    setEditOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Skill Name is required');
      return;
    }
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
        description_c: form.description_c.trim()
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
    if (!skill) return;
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

  async function handleExecuteSkill() {
    if (!skill) return;
    setExecuting(true);
    try {
      const nextCount = (Number(skill.run_count_c) || 0) + 1;
      await sdk.table('skills_c').update({
        Id: skill.Id,
        run_count_c: nextCount,
        status_c: 'Verified'
      });
      await sdk.table('executions_c').create({
        Name: skill.trigger_phrase_c || `Run skill ${skill.Name}`,
        tool_used_c: 'Skill_Runner',
        status_c: 'Success',
        skill_c: skill.Id,
        latency_ms_c: 585,
        spoken_reply_c: `On it, Akash. Maine saved Python skill ${skill.Name} run kar di hai aur task bina kisi error ke complete ho gaya hai.`
      });
      toast.success(`Executed ${skill.Name}.py and logged to OS Execution Logs`);
      run();
    } finally {
      setExecuting(false);
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
            <p className="text-base font-medium">Skill record not found</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/skills">Back to Learned Skills</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-md">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{skill.category_c}</Badge>
                    <Badge variant="outline">{skill.status_c}</Badge>
                    <span className="text-xs text-muted-foreground">
                      ./skills/{skill.Name}.py
                    </span>
                  </div>
                  <CardTitle className="mt-2 font-mono text-2xl font-bold text-primary">
                    {skill.Name}.py
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Hinglish Voice Trigger: “{skill.trigger_phrase_c || 'Not set'}”
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleExecuteSkill} disabled={executing}>
                    {executing ? (
                      <>
                        <ApperIcon name="LoaderCircle" size={16} className="animate-spin" />
                        Running…
                      </>
                    ) : (
                      <>
                        <ApperIcon name="Play" size={16} />
                        Test Execute Skill
                      </>
                    )}
                  </Button>
                  {canUpdate && (
                    <Button variant="outline" onClick={openEditDialog}>
                      <ApperIcon name="Edit" size={16} />
                      Edit
                    </Button>
                  )}
                  {canDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={deleting}>
                          <ApperIcon name="Trash2" size={16} />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete skill {skill.Name}.py?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove the learned Python skill from Jarvis’s skill registry.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>
                            {deleting ? 'Deleting…' : 'Delete Skill'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Total Executions</span>
                  <p className="mt-1 font-heading text-xl font-bold">{skill.run_count_c ?? 0}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Author / Owner</span>
                  <p className="mt-1 font-medium text-sm">{skill.Owner?.Name || 'Akash Sharma'}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Last Updated</span>
                  <p className="mt-1 font-medium text-sm">
                    {formatLocalDate(skill.ModifiedOn || skill.CreatedOn, DATE_FORMATS.SHORT)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-heading text-base font-semibold">Step-by-Step Instructions</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {skill.description_c || 'No instructions documented.'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-base font-semibold">
                    Autonomous Python Module Source (./skills/{skill.Name}.py)
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(skill.script_code_c || '');
                      toast.success('Copied Python skill source');
                    }}
                  >
                    <ApperIcon name="Copy" size={14} />
                    Copy Python Code
                  </Button>
                </div>
                <pre className="rounded-md border border-border bg-muted/50 p-4 text-xs sm:text-sm font-mono overflow-x-auto leading-relaxed">
                  {skill.script_code_c}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
              <DialogHeader>
                <DialogTitle className="font-heading">Edit Learned Skill</DialogTitle>
                <DialogDescription>
                  Update the voice trigger, status, or Python code for {skill.Name}.py.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-skill-name">Skill Name *</Label>
                    <Input
                      id="edit-skill-name"
                      required
                      value={form.Name}
                      onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))}
                      placeholder="organize_downloads_folder"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-skill-runs">Execution Count</Label>
                    <Input
                      id="edit-skill-runs"
                      type="number"
                      value={form.run_count_c}
                      onChange={(e) => setForm((f) => ({ ...f, run_count_c: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-skill-trigger">Hinglish Voice Trigger</Label>
                  <Input
                    id="edit-skill-trigger"
                    value={form.trigger_phrase_c}
                    onChange={(e) => setForm((f) => ({ ...f, trigger_phrase_c: e.target.value }))}
                    placeholder="Jarvis, mera downloads folder clean kar do"
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
                  <Label htmlFor="edit-skill-desc">Step-by-Step Instructions</Label>
                  <Textarea
                    id="edit-skill-desc"
                    rows={2}
                    value={form.description_c}
                    onChange={(e) => setForm((f) => ({ ...f, description_c: e.target.value }))}
                    placeholder="Step-by-step instructions..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-skill-code">Python Script Code</Label>
                  <Textarea
                    id="edit-skill-code"
                    rows={6}
                    className="font-mono text-xs"
                    value={form.script_code_c}
                    onChange={(e) => setForm((f) => ({ ...f, script_code_c: e.target.value }))}
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
        </>
      )}
    </div>
  );
}
