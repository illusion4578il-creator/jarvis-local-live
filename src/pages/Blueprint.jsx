import { useState } from 'react';
import { Link } from 'react-router-dom';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { CODEBASE_FILES } from '@/data/jarvisCodebase';

export const route = { path: '/blueprint', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'FileCode', label: 'Python Codebase', order: 15, profiles: null };

export default function Blueprint() {
  const [activeTab, setActiveTab] = useState(CODEBASE_FILES[0].id);

  function handleCopy(file) {
    navigator.clipboard.writeText(file.content);
    toast.success(`Copied ${file.filename} to clipboard`);
  }

  function handleDownload(file) {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${file.filename}`);
  }

  return (
    <div className="pb-12">
      <section className="w-full bg-primary text-primary-foreground border-b border-border shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-highlight text-highlight-foreground">
                  {CODEBASE_FILES.length} Sequential Deliverables
                </Badge>
                <span className="text-xs text-primary-foreground/80">
                  Python 3.11 · LangChain · Ollama · Silero VAD · faster-whisper · XTTSv2 · ChromaDB
                </span>
              </div>
              <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-bold">
                Complete Local Python Codebase & Setup Blueprint
              </h1>
              <p className="mt-1 text-sm text-primary-foreground/85">
                Inspect, copy, or download each production Python module to run Jarvis 100% locally on Akash’s PC.
              </p>
            </div>
            <Button
              asChild
              variant="secondary"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            >
              <Link to="/">
                <ApperIcon name="Activity" size={16} />
                Back to Command Center
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1.5 bg-muted p-1.5">
            {CODEBASE_FILES.map((file) => (
              <TabsTrigger
                key={file.id}
                value={file.id}
                className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:font-semibold"
              >
                {file.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {CODEBASE_FILES.map((file) => (
            <TabsContent key={file.id} value={file.id}>
              <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="font-heading text-xl">{file.title}</CardTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        {file.filename}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">{file.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleCopy(file)}>
                      <ApperIcon name="Copy" size={15} />
                      Copy Code
                    </Button>
                    <Button size="sm" onClick={() => handleDownload(file)}>
                      <ApperIcon name="Download" size={15} />
                      Download {file.filename}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <pre className="overflow-x-auto p-5 text-xs sm:text-sm font-mono leading-relaxed bg-muted/40 text-foreground max-h-[640px]">
                    {file.content}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
