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

export const route = { path: '/documents', layout: 'owner', access: 'authenticated' };
export const nav = {
  icon: 'BookOpen',
  label: 'RAG Books',
  order: 30,
  profiles: null,
  count: { table: 'documents_c', where: null }
};

const { eq, contains, and } = window.ApperSDK.CoreSDK;

const DOC_TYPES = ['PDF', 'EPUB', 'Markdown', 'TXT'];
const DOC_STATUSES = ['Indexed', 'Pending', 'Chunking', 'Failed'];

const STATUS_BADGES = {
  Indexed: 'bg-success-muted text-success border-success-border',
  Pending: 'bg-secondary text-secondary-foreground border-border',
  Chunking: 'bg-warning-muted text-warning-foreground border-warning-border',
  Failed: 'bg-destructive/15 text-destructive border-destructive/30'
};

const FIELDS = [
  'Id',
  'Name',
  'file_path_c',
  'doc_type_c',
  'status_c',
  'chunk_count_c',
  'summary_c',
  'CreatedOn',
  'ModifiedOn'
];

const INITIAL_FORM = {
  Name: '',
  file_path_c: './knowledge_base/',
  doc_type_c: 'PDF',
  status_c: 'Indexed',
  chunk_count_c: 250,
  summary_c: ''
};

export default function DocumentsList() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { canCreate } = getTableAccess(profile, 'documents_c');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter]);

  const { data, loading, error, run } = useFetch(() => {
    const f = [];
    if (search.trim()) f.push(contains('Name', search.trim()));
    if (typeFilter !== 'all') f.push(eq('doc_type_c', typeFilter));
    if (statusFilter !== 'all') f.push(eq('status_c', statusFilter));

    let q = sdk.table('documents_c').select(FIELDS);
    if (f.length) q = q.where(and(...f));
    return q
      .orderByDesc('CreatedOn')
      .page(page, 10)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return { rows: r.data, total: r.total, hasMore: r.hasMore };
      });
  }, [search, typeFilter, statusFilter, page]);

  const rows = data?.rows ?? [];
  const firstLoad = loading && data === undefined;

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.Name.trim()) {
      toast.error('Document Title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await sdk.table('documents_c').create({
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
      toast.success('Book indexed in ChromaDB Knowledge Vault');
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
                ChromaDB Knowledge Vault (Books & PDFs)
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Local books in <code className="bg-primary-foreground/15 px-1.5 py-0.5 rounded text-xs">./knowledge_base/</code> ingested via LangChain Document Loaders and <code className="bg-primary-foreground/15 px-1.5 py-0.5 rounded text-xs">all-MiniLM-L6-v2</code> embeddings.
              </p>
            </div>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold"
              >
                <ApperIcon name="Plus" size={16} />
                Ingest New Book / PDF
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
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
                placeholder="Search book title (e.g. Kleppmann, Fluent Python)..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Formats</SelectItem>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
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
                  {DOC_STATUSES.map((s) => (
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
        ) : !rows.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <ApperIcon name="BookOpen" size={32} className="text-muted-foreground" />
              <p className="text-base font-medium">No books found in ChromaDB vault</p>
              {canCreate && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <ApperIcon name="Plus" size={15} />
                  Ingest First Book
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
            {rows.map((doc) => (
              <Card
                key={doc.Id}
                onClick={() => navigate(`/documents/${doc.Id}`)}
                className="cursor-pointer shadow-md hover:border-primary/50 transition-all"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/documents/${doc.Id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-heading text-base font-bold text-foreground hover:text-primary line-clamp-1"
                      >
                        {doc.Name}
                      </Link>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                        {doc.file_path_c}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {doc.doc_type_c}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', STATUS_BADGES[doc.status_c])}
                      >
                        {doc.status_c}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">{doc.summary_c}</p>

                  <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
                    <span className="font-mono font-medium text-foreground">
                      {doc.chunk_count_c ?? 0} ChromaDB chunks
                    </span>
                    <span>Ingested {formatLocalDate(doc.CreatedOn, DATE_FORMATS.SHORT)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Ingest Local Book into ChromaDB</DialogTitle>
            <DialogDescription>
              Register a PDF, EPUB, or Markdown book from <code className="text-xs">./knowledge_base/</code>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Document Title *</Label>
              <Input
                id="doc-title"
                value={form.Name}
                onChange={(e) => setForm({ ...form, Name: e.target.value })}
                placeholder="e.g. Deep Learning with PyTorch — Eli Stevens"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-path">Local File Path</Label>
              <Input
                id="doc-path"
                value={form.file_path_c}
                onChange={(e) => setForm({ ...form, file_path_c: e.target.value })}
                placeholder="./knowledge_base/pytorch_dl.pdf"
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
                <Label>Index Status</Label>
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
                <Label htmlFor="doc-chunks">Vector Chunks</Label>
                <Input
                  id="doc-chunks"
                  type="number"
                  value={form.chunk_count_c}
                  onChange={(e) => setForm({ ...form, chunk_count_c: e.target.value })}
                  placeholder="450"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-summary">Analytical Summary & Key Topics</Label>
              <Textarea
                id="doc-summary"
                rows={3}
                value={form.summary_c}
                onChange={(e) => setForm({ ...form, summary_c: e.target.value })}
                placeholder="Core chapters and concepts Jarvis can retrieve from this book..."
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
                    Ingesting…
                  </>
                ) : (
                  'Save & Index Book'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
