import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
import ApperIcon from '@/components/ApperIcon';
import LookupPicker from '@/components/LookupPicker';
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

export const route = { path: '/executions/:id', layout: 'owner', access: 'authenticated' };

const TOOL_OPTIONS = ['OS_Control', 'Skill_Runner', 'RAG_Search', 'Memory'];
const STATUS_OPTIONS = ['Success', 'Auto_Fixed', 'Failed', 'Running'];

const FIELDS = [
  'Id',
  'Name',
  'tool_used_c',
  'status_c',
  'skill_c',
  'latency_ms_c',
  'spoken_reply_c',
  'Owner',
  'CreatedOn',
  'ModifiedOn'
];

export default function ExecutionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { canUpdate, canDelete } = getTableAccess(profile, 'executions_c');

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    Name: '',
    tool_used_c: 'OS_Control',
    status_c: 'Success',
    skill_c: null,
    latency_ms_c: 600,
    spoken_reply_c: ''
  });

  const { data: record, loading, error, run } = useFetch(async () => {
    const res = await sdk.table('executions_c').select(FIELDS).get(id);
    return res.data;
  }, [id]);

  function openEditDialog() {
    if (!record) return;
    setForm({
      Name: record.Name ?? '',
      tool_used_c: record.tool_used_c ?? 'OS_Control',
      status_c: record.status_c ?? 'Success',
      skill_c: record.skill_c?.Id ?? record.skill_c ?? null,
      latency_ms_c: record.latency_ms_c ?? 600,
      spoken_reply_c: record.spoken_reply_c ?? ''
    });
    setEditOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Voice Command is required');
      return;
    }
    setSaving(true);
    try {
      const res = await sdk.table('executions_c').update({
        Id: record.Id,
        Name: form.Name.trim(),
        tool_used_c: form.tool_used_c,
        status_c: form.status_c,
        skill_c: form.skill_c?.Id ?? form.skill_c ?? null,
        latency_ms_c: Number(form.latency_ms_c) || 600,
        spoken_reply_c: form.spoken_reply_c.trim()
      });
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('Execution log updated');
      setEditOpen(false);
      run();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!record) return;
    setDeleting(true);
    try {
      const res = await sdk.table('executions_c').remove(record.Id);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      toast.success('Execution log deleted');
      navigate('/executions');
    } finally {
      setDeleting(false);
    }
  }

  const firstLoad = loading && record === undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/executions">
            <ApperIcon name="ArrowLeft" size={16} />
            Back to OS Execution Logs
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
      ) : !record ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-base font-medium">Execution log not found</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/executions">Back to OS Execution Logs</Link>
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
                    <Badge variant="outline">{record.tool_used_c}</Badge>
                    <Badge variant="outline">{record.status_c}</Badge>
                    <Badge variant="secondary" className="font-mono">
                      {record.latency_ms_c ?? 600} ms
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 font-heading text-2xl font-bold">
                    “{record.Name}”
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Executed on {formatLocalDate(record.CreatedOn, DATE_FORMATS.SHORT)} by {record.Owner?.Name || 'Akash Sharma'}
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
                          <AlertDialogTitle>Delete this OS Execution Log?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove the telemetry record for “{record.Name}”.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>
                            {deleting ? 'Deleting…' : 'Delete Log'}
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
                  <span className="text-xs text-muted-foreground">Agent Tool Used</span>
                  <p className="mt-1 font-heading text-lg font-bold">{record.tool_used_c}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Voice Pipeline Latency</span>
                  <p className="mt-1 font-heading text-lg font-bold">{record.latency_ms_c ?? 600} ms</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Linked Python Skill</span>
                  <p className="mt-1 font-medium text-sm">
                    {record.skill_c?.Id ? (
                      <Link to={`/skills/${record.skill_c.Id}`} className="text-primary hover:underline font-mono">
                        {record.skill_c.Name}.py
                      </Link>
                    ) : (
                      'Direct Agent Execution'
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-heading text-base font-semibold">
                  Jarvis Spoken Hinglish Response (TTS Stream)
                </h3>
                <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
                  {record.spoken_reply_c || 'No spoken response recorded.'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">Edit Execution Log</DialogTitle>
                <DialogDescription>
                  Update the command, tool, status, linked skill, or spoken reply.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-exec-cmd">Voice Command *</Label>
                  <Input id="edit-exec-cmd" required value={form.Name} onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))} placeholder="Jarvis, mera downloads folder clean kar do" />
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
                    <Label htmlFor="edit-exec-lat">Latency (ms)</Label>
                    <Input id="edit-exec-lat" type="number" value={form.latency_ms_c} onChange={(e) => setForm((f) => ({ ...f, latency_ms_c: e.target.value }))} placeholder="600" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Linked Skill</Label>
                  <LookupPicker
                    table="skills_c"
                    searchField="Name"
                    value={form.skill_c?.Id ?? form.skill_c ?? null}
                    onChange={(idVal) => setForm((f) => ({ ...f, skill_c: idVal }))}
                    clearable
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-exec-reply">Jarvis Hinglish Reply & Output</Label>
                  <Textarea id="edit-exec-reply" rows={3} value={form.spoken_reply_c} onChange={(e) => setForm((f) => ({ ...f, spoken_reply_c: e.target.value }))} placeholder="On it, Akash..." />
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
