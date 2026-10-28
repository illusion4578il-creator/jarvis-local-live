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

export const route = { path: '/documents/:id', layout: 'owner', access: 'authenticated' };

const DOC_TYPES = ['PDF', 'EPUB', 'Markdown', 'TXT'];
const DOC_STATUSES = ['Indexed', 'Pending', 'Chunking', 'Failed'];

const FIELDS = [
  'Id',
  'Name',
  'file_path_c',
  'doc_type_c',
  'status_c',
  'chunk_count_c',
  'summary_c',
  'Owner',
  'CreatedOn',
  'ModifiedOn'
];

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { canUpdate, canDelete } = getTableAccess(profile, 'documents_c');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    Name: '',
    file_path_c: '',
    doc_type_c: 'PDF',
    status_c: 'Indexed',
    chunk_count_c: 0,
    summary_c: ''
  });

  const { data: doc, loading, error, run } = useFetch(async () => {
    const res = await sdk.table('documents_c').select(FIELDS).get(id);
    return res.data;
  }, [id]);

  function openEdit() {
    if (!doc) return;
    setForm({
      Name: doc.Name || '',
      file_path_c: doc.file_path_c || '',
      doc_type_c: doc.doc_type_c || 'PDF',
      status_c: doc.status_c || 'Indexed',
      chunk_count_c: doc.chunk_count_c ?? 0,
      summary_c: doc.summary_c || ''
    });
    setEditOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await sdk.table('documents_c').update({
        Id: doc.Id,
        Name: form.Name.trim(),
        file_path_c: form.file_path_c.trim(),
        doc_type_c: form.doc_type_c,
        status_c: form.status_c,
        chunk_count_c: Number(form.chunk_count_c) || 0,
        summary_c: form.summary_c
      });
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('Document metadata updated');
      setEditOpen(false);
      run();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await sdk.table('documents_c').remove(doc.Id);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      toast.success('Document removed from ChromaDB index');
      navigate('/documents');
    } finally {
      setDeleting(false);
    }
  }

  const firstLoad = loading && doc === undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/documents">
            <ApperIcon name="ArrowLeft" size={16} />
            Back to RAG Books
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
      ) : !doc ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-base font-medium">Document not found</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/documents">Back to RAG Books</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-md">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{doc.doc_type_c}</Badge>
                  <Badge variant="outline">{doc.status_c}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    {doc.chunk_count_c ?? 0} vector chunks
                  </span>
                </div>
                <CardTitle className="mt-2 font-heading text-2xl">{doc.Name}</CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">
                  {doc.file_path_c}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {canUpdate && (
                  <Button variant="outline" size="sm" onClick={openEdit}>
                    <ApperIcon name="Pencil" size={15} />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
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
                Analytical Summary & Indexed Topics
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {doc.summary_c || 'No summary recorded.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-4 border-t border-border text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Owner:</span> {doc.Owner?.Name || 'Akash Sharma'}
              </div>
              <div>
                <span className="font-medium text-foreground">Ingested:</span>{' '}
                {formatLocalDate(doc.CreatedOn, DATE_FORMATS.SHORT)}
              </div>
              <div>
                <span className="font-medium text-foreground">Updated:</span>{' '}
                {formatLocalDate(doc.ModifiedOn, DATE_FORMATS.SHORT)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit RAG Book Entry</DialogTitle>
            <DialogDescription>Update local path, chunk count, or analytical summary.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-doc-title">Document Title *</Label>
              <Input
                id="edit-doc-title"
                value={form.Name}
                onChange={(e) => setForm({ ...form, Name: e.target.value })}
                placeholder="Document title"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-doc-path">Local File Path</Label>
              <Input
                id="edit-doc-path"
                value={form.file_path_c}
                onChange={(e) => setForm({ ...form, file_path_c: e.target.value })}
                placeholder="./knowledge_base/book.pdf"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Format</Label>
                <Select
                  value={form.doc_type_c}
                  onValueChange={(v) => setForm({ ...form, doc_type_c: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
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
                    {DOC_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-doc-chunks">Vector Chunks</Label>
                <Input
                  id="edit-doc-chunks"
                  type="number"
                  value={form.chunk_count_c}
                  onChange={(e) => setForm({ ...form, chunk_count_c: e.target.value })}
                  placeholder="500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-doc-summary">Analytical Summary & Key Topics</Label>
              <Textarea
                id="edit-doc-summary"
                rows={3}
                value={form.summary_c}
                onChange={(e) => setForm({ ...form, summary_c: e.target.value })}
                placeholder="Summary..."
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {doc?.Name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this book record from the ChromaDB Knowledge Vault registry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Book'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
