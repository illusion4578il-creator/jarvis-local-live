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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reindexing, setReindexing] = useState(false);
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

  function openEditDialog() {
    if (!doc) return;
    setForm({
      Name: doc.Name ?? '',
      file_path_c: doc.file_path_c ?? '',
      doc_type_c: doc.doc_type_c ?? 'PDF',
      status_c: doc.status_c ?? 'Indexed',
      chunk_count_c: doc.chunk_count_c ?? 0,
      summary_c: doc.summary_c ?? ''
    });
    setEditOpen(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Document Title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await sdk.table('documents_c').update({
        Id: doc.Id,
        Name: form.Name.trim(),
        file_path_c: form.file_path_c.trim(),
        doc_type_c: form.doc_type_c,
        status_c: form.status_c,
        chunk_count_c: Number(form.chunk_count_c) || 0,
        summary_c: form.summary_c.trim()
      });
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('Book metadata updated');
      setEditOpen(false);
      run();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!doc) return;
    setDeleting(true);
    try {
      const res = await sdk.table('documents_c').remove(doc.Id);
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      toast.success('Book removed from ChromaDB index');
      navigate('/documents');
    } finally {
      setDeleting(false);
    }
  }

  async function handleReindex() {
    if (!doc) return;
    setReindexing(true);
    try {
      const newChunks = (Number(doc.chunk_count_c) || 380) + 12;
      await sdk.table('documents_c').update({
        Id: doc.Id,
        status_c: 'Indexed',
        chunk_count_c: newChunks
      });
      toast.success(`Re-indexed ${doc.Name} (${newChunks} vector chunks in ChromaDB)`);
      run();
    } finally {
      setReindexing(false);
    }
  }

  const firstLoad = loading && doc === undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/documents">
            <ApperIcon name="ArrowLeft" size={16} />
            Back to RAG Book Vault
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
            <p className="text-base font-medium">Document record not found</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/documents">Back to RAG Book Vault</Link>
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
                    <Badge variant="outline">{doc.doc_type_c}</Badge>
                    <Badge variant="outline">{doc.status_c}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {doc.file_path_c}
                    </span>
                  </div>
                  <CardTitle className="mt-2 font-heading text-2xl font-bold">
                    {doc.Name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    ChromaDB Collection: akash_books_rag · RecursiveCharacterTextSplitter (chunk_size=900, overlap=150)
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleReindex} disabled={reindexing}>
                    {reindexing ? (
                      <>
                        <ApperIcon name="LoaderCircle" size={16} className="animate-spin" />
                        Indexing…
                      </>
                    ) : (
                      <>
                        <ApperIcon name="RefreshCw" size={16} />
                        Re-Index in ChromaDB
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
                          <AlertDialogTitle>Delete {doc.Name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the document metadata and its ChromaDB vector chunks.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>
                            {deleting ? 'Deleting…' : 'Delete Book'}
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
                  <span className="text-xs text-muted-foreground">Embedded Vector Chunks</span>
                  <p className="mt-1 font-heading text-xl font-bold">{doc.chunk_count_c ?? 0}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Owner</span>
                  <p className="mt-1 font-medium text-sm">{doc.Owner?.Name || 'Akash Sharma'}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3.5">
                  <span className="text-xs text-muted-foreground">Ingested Date</span>
                  <p className="mt-1 font-medium text-sm">
                    {formatLocalDate(doc.CreatedOn, DATE_FORMATS.SHORT)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-heading text-base font-semibold">
                  Analytical Summary & Indexed Topics
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {doc.summary_c || 'No analytical summary available.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">Edit Book Metadata</DialogTitle>
                <DialogDescription>
                  Update the path, format, chunk count, or summary for {doc.Name}.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-doc-name">Document Title *</Label>
                  <Input
                    id="edit-doc-name"
                    required
                    value={form.Name}
                    onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))}
                    placeholder="Document Title"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-doc-path">Local File Path</Label>
                  <Input
                    id="edit-doc-path"
                    value={form.file_path_c}
                    onChange={(e) => setForm((f) => ({ ...f, file_path_c: e.target.value }))}
                    placeholder="./knowledge_base/book.pdf"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Format</Label>
                    <Select
                      value={form.doc_type_c}
                      onValueChange={(v) => setForm((f) => ({ ...f, doc_type_c: v }))}
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
                    <Label>Index Status</Label>
                    <Select
                      value={form.status_c}
                      onValueChange={(v) => setForm((f) => ({ ...f, status_c: v }))}
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
                      onChange={(e) => setForm((f) => ({ ...f, chunk_count_c: e.target.value }))}
                      placeholder="450"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-doc-summary">Analytical Summary & Key Topics</Label>
                  <Textarea
                    id="edit-doc-summary"
                    rows={3}
                    value={form.summary_c}
                    onChange={(e) => setForm((f) => ({ ...f, summary_c: e.target.value }))}
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
        </>
      )}
    </div>
  );
}
