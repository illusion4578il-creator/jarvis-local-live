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

export const route = { path: '/memories/:id', layout: 'owner', access: 'authenticated' };

const MEMORY_TYPES = ['Preference', 'Directive', 'Insight', 'Workflow'];
const IMPORTANCE_LEVELS = ['Critical', 'High', 'Normal', 'Low'];

const FIELDS = [
  'Id',
  'Name',
  'memory_type_c',
  'importance_c',
  'active_c',
  'context_notes_c',
  'Owner',
  'CreatedOn',
  'ModifiedOn'
];

export default function MemoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { canUpdate, canDelete } = getTableAccess(profile, 'memories_c');

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    Name: '',
    memory_type_c: 'Preference',
    importance_c: 'High',
    active_c: true,
    context_notes_c: ''
  });

  const { data: mem, loading, error, run } = useFetch(async () => {
    const res = await sdk.table('memories_c').select(FIELDS).get(id);
    return res.data;
  }, [id]);

  function openEditDialog() {
    if (!mem) return;
    setForm({
      Name: mem.Name ?? '',
      memory_type_c: mem.memory_type_c ?? 'Preference',
      importance_c: mem.importance_c ?? 'High',
      active_c: Boolean(mem.active_c),
      context_notes_c: mem.context_notes_c ?? ''
    });
    setEditOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Memory Fact is required');
      return;
    }
    setSaving(true);
    try {
      const res = await sdk.table('memories_c').update({
        Id: mem.Id,
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
      toast.success('Memory node updated');
      setEditOpen(false);
      run();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!mem) return;
    setDeleting(true);
    try {
      const res = await sdk.table('memories_c').remove(mem.Id);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      toast.success('Memory node deleted');
      navigate('/memories');
    } finally {
      setDeleting(false);
    }
  }

  const firstLoad = loading && mem === undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/memories">
            <ApperIcon name="ArrowLeft" size={16} />
            Back to Memory Store
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
      ) : !mem ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-base font-medium">Memory record not found</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/memories">Back to Memory Store</Link>
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
                    <Badge variant="outline">{mem.memory_type_c}</Badge>
                    <Badge variant="outline">{mem.importance_c}</Badge>
                    <Badge variant={mem.active_c ? 'default' : 'secondary'}>
                      {mem.active_c ? 'Injected in System Prompt' : 'Muted'}
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 font-heading text-2xl font-bold">
                    {mem.Name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Stored on {formatLocalDate(mem.CreatedOn, DATE_FORMATS.SHORT)} · Owner: {mem.Owner?.Name || 'Akash Sharma'}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                          <AlertDialogTitle>Delete Memory Node?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove “{mem.Name}” from Jarvis’s persistent memory store.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>
                            {deleting ? 'Deleting…' : 'Delete Memory'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <h3 className="font-heading text-base font-semibold">Detailed Context & Source</h3>
                <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
                  {mem.context_notes_c || 'No additional context notes recorded.'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">Edit Memory Node</DialogTitle>
                <DialogDescription>
                  Update the fact, memory type, priority, or active prompt status.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-mem-name">Memory Fact *</Label>
                  <Input id="edit-mem-name" required value={form.Name} onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))} placeholder="Memory fact..." />
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
                    <Label htmlFor="edit-mem-active">Inject in System Prompt</Label>
                    <p className="text-xs text-muted-foreground">Include in Jarvis’s active prompt</p>
                  </div>
                  <Switch id="edit-mem-active" checked={Boolean(form.active_c)} onCheckedChange={(v) => setForm((f) => ({ ...f, active_c: Boolean(v) }))} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-mem-notes">Detailed Context & Source</Label>
                  <Textarea id="edit-mem-notes" rows={3} value={form.context_notes_c} onChange={(e) => setForm((f) => ({ ...f, context_notes_c: e.target.value }))} placeholder="Context notes..." />
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
