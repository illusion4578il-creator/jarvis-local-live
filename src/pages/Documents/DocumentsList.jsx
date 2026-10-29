import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
import ApperIcon from '@/components/ApperIcon';
import { ListSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export const route = { path: '/documents', layout: 'owner', access: 'authenticated' };
export const nav = {
  icon: 'BookOpen',
  label: 'RAG Book Vault',
  order: 30,
  profiles: null,
  count: { table: 'documents_c', where: null }
};

const { eq, contains, and } = window.ApperSDK.CoreSDK;

const DOC_TYPES = ['PDF', 'EPUB', 'Markdown', 'TXT'];
const DOC_STATUSES = ['Indexed', 'Pending', 'Chunking', 'Failed'];

const STATUS_BADGE = {
  Indexed: 'bg-success-muted text-success border-success-border',
  Pending: 'bg-muted text-muted-foreground border-border',
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
  'Owner',
  'CreatedOn',
  'ModifiedOn'
];

const INITIAL_FORM = {
  Name: '',
  file_path_c: './knowledge_base/',
  doc_type_c: 'PDF',
  status_c: 'Indexed',
  chunk_count_c: 420,
  summary_c: ''
};

export default function DocumentsList() {
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
    const filters = [];
    if (search.trim()) filters.push(contains('Name', search.trim()));
    if (typeFilter !== 'all') filters.push(eq('doc_type_c', typeFilter));
    if (statusFilter !== 'all') filters.push(eq('status_c', statusFilter));

    let q = sdk.table('documents_c').select(FIELDS);
    if (filters.length) q = q.where(and(...filters));

    return q
      .orderByDesc('CreatedOn')
      .page(page, 12)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return { rows: r.data, total: r.total, hasMore: r.hasMore };
      });
  }, [search, typeFilter, statusFilter, page]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
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
        summary_c: form.summary_c.trim()
      });
      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }
      if (!res.data?.length) return;
      toast.success('Book ingested into ChromaDB vault');
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
                  ChromaDB + all-MiniLM-L6-v2
                </Badge>
                <span className="text-xs text-primary-foreground/80">
                  ./knowledge_base/ Local Vector Store
                </span>
              </div>
              <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-bold">
                Knowledge Base & Books RAG Vault
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Drop PDFs, EPUBs, and notes into ./knowledge_base for silent retrieval during Hinglish voice calls.
              </p>
            </div>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold"
              >
                <ApperIcon name="FilePlus" size={16} />
                Ingest Book / Document
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search book title or author..."
              />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Formats" />
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
                <SelectTrigger>
                  <SelectValue placeholder="All Index Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Index Statuses</SelectItem>
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
        ) : rows.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ApperIcon name="BookOpen" size={24} />
              </div>
              <h2 className="font-heading text-lg font-semibold">No books indexed yet</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Add a PDF or EPUB from ./knowledge_base so Jarvis can answer deep analytical questions via ChromaDB.
              </p>
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <ApperIcon name="FilePlus" size={16} />
                  Ingest Book / Document
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
              <Card key={doc.Id} className="shadow-md hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/documents/${doc.Id}`}
                        className="font-heading text-base font-bold text-foreground hover:text-primary line-clamp-1"
                      >
                        {doc.Name}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-muted-foreground truncate">
                        {doc.file_path_c}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {doc.doc_type_c}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', STATUS_BADGE[doc.status_c] || '')}
                      >
                        {doc.status_c}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                    {doc.summary_c || 'No analytical summary recorded.'}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <span>
                      <strong className="text-foreground">{doc.chunk_count_c ?? 0}</strong> vector chunks · Added {formatLocalDate(doc.CreatedOn, DATE_FORMATS.SHORT)}
                    </span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/documents/${doc.Id}`}>
                        Open Book Record
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
              Page {page} · {total} total documents
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
            <DialogTitle className="font-heading">Ingest Local Book into ChromaDB</DialogTitle>
            <DialogDescription>
              Registers a PDF, EPUB, or Markdown book from ./knowledge_base into Jarvis’s local vector store.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-name">Document Title *</Label>
              <Input
                id="doc-name"
                required
                value={form.Name}
                onChange={(e) => setForm((f) => ({ ...f, Name: e.target.value }))}
                placeholder="Deep Learning — Ian Goodfellow"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-path">Local File Path</Label>
              <Input
                id="doc-path"
                value={form.file_path_c}
                onChange={(e) => setForm((f) => ({ ...f, file_path_c: e.target.value }))}
                placeholder="./knowledge_base/deep_learning_goodfellow.pdf"
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
                <Label htmlFor="doc-chunks">Vector Chunks</Label>
                <Input
                  id="doc-chunks"
                  type="number"
                  value={form.chunk_count_c}
                  onChange={(e) => setForm((f) => ({ ...f, chunk_count_c: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, summary_c: e.target.value }))}
                placeholder="Key chapters, concepts, and formulas indexed for RAG search..."
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
                  'Ingest Book'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
