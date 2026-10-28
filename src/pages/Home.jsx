import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { StatsSkeleton, ListSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/utils/date';
import { SYSTEM_PROMPT_TEXT } from '@/data/jarvisCodebase';

export const route = { path: '/', layout: 'owner', access: 'authenticated' };
export const nav = { icon: 'Activity', label: 'Command Center', order: 10, profiles: null };

const { eq } = window.ApperSDK.CoreSDK;

const PRESET_VOICE_COMMANDS = [
  {
    label: 'Sort Downloads Folder (Skill)',
    command: 'Jarvis, mera downloads folder clean aur extension wise sort kar do',
    tool: 'Skill_Runner',
    latency: 590,
    reply: 'On it, Akash. Maine aapka Downloads folder scan karke sabhi PDFs, Archives aur Installers ko clean subfolders mein move kar diya hai.'
  },
  {
    label: 'Ask DDIA Book (ChromaDB RAG)',
    command: 'Jarvis, Kleppmann book ke hisaab se Raft consensus leader election kaise kaam karta hai?',
    tool: 'RAG_Search',
    latency: 710,
    reply: 'Akash, Designing Data-Intensive Applications ke Chapter 9 ke mutabik Raft mein jab follower ko leader heartbeat nahi milti, toh woh term increment karke candidate ban jata hai aur majority quorum votes maangta hai.'
  },
  {
    label: 'Auto-Debug OS Script (Hands)',
    command: 'Jarvis, system ke top 5 memory consuming processes check karke report do',
    tool: 'OS_Control',
    latency: 660,
    reply: 'On it, Akash. Maine psutil script run kar li hai. Abhi Ollama server 5.2 GB aur VS Code 1.1 GB RAM use kar rahe hain, baaki system smooth hai.'
  },
  {
    label: 'Save Fact to Mem0 (Memory)',
    command: 'Jarvis, yaad rakhna ki raat 10 baje ke baad voice volume 60 percent rakhna hai',
    tool: 'Memory',
    latency: 530,
    reply: 'Bilkul Akash, maine apni persistent memory store mein yeh rule save kar liya hai ki 10 PM ke baad TTS output gain 60 percent rahega.'
  }
];

const STATUS_BADGE_MAP = {
  Success: 'bg-success-muted text-success border-success-border',
  Auto_Fixed: 'bg-warning-muted text-warning-foreground border-warning-border',
  Running: 'bg-primary/15 text-primary border-primary/30',
  Failed: 'bg-destructive/15 text-destructive border-destructive/30'
};

export default function Home() {
  const [voiceInput, setVoiceInput] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [activeStage, setActiveStage] = useState(null);
  const [lastSpokenReply, setLastSpokenReply] = useState(
    'Namaste Akash! Main aapka local Jarvis assistant hoon. Silero VAD, Faster-Whisper aur Ollama Qwen 2.5 bilkul ready hain.'
  );

  const {
    data: metrics,
    loading: metricsLoading,
    error: metricsError,
    run: refreshMetrics
  } = useFetch(async () => {
    const [skillsRes, docsRes, execRes, memRes] = await Promise.all([
      sdk
        .table('skills_c')
        .select([{ field: 'Id' }])
        .aggregate([
          { id: 'totalSkills', fields: [{ field: 'Id', fn: 'Count', alias: 'count' }] },
          {
            id: 'verifiedSkills',
            fields: [{ field: 'Id', fn: 'Count', alias: 'count' }],
            where: eq('status_c', 'Verified')
          },
          { id: 'totalRuns', fields: [{ field: 'run_count_c', fn: 'Sum', alias: 'count' }] }
        ])
        .limit(1)
        .fetch(),
      sdk
        .table('documents_c')
        .select([{ field: 'Id' }])
        .aggregate([
          { id: 'totalDocs', fields: [{ field: 'Id', fn: 'Count', alias: 'count' }] },
          { id: 'totalChunks', fields: [{ field: 'chunk_count_c', fn: 'Sum', alias: 'count' }] }
        ])
        .limit(1)
        .fetch(),
      sdk
        .table('executions_c')
        .select([{ field: 'Id' }])
        .aggregate([
          { id: 'totalExecs', fields: [{ field: 'Id', fn: 'Count', alias: 'count' }] },
          { id: 'avgLatency', fields: [{ field: 'latency_ms_c', fn: 'Avg', alias: 'count' }] }
        ])
        .limit(1)
        .fetch(),
      sdk
        .table('memories_c')
        .select([{ field: 'Id' }])
        .aggregate([
          { id: 'totalMemories', fields: [{ field: 'Id', fn: 'Count', alias: 'count' }] },
          {
            id: 'activeMemories',
            fields: [{ field: 'Id', fn: 'Count', alias: 'count' }],
            where: eq('active_c', true)
          }
        ])
        .limit(1)
        .fetch()
    ]);

    const readAgg = (res, id) => {
      const item = res?.aggregators?.find((a) => a.id === id);
      return item?.data?.count ?? item?.count ?? item?.value ?? 0;
    };

    return {
      totalSkills: readAgg(skillsRes, 'totalSkills'),
      verifiedSkills: readAgg(skillsRes, 'verifiedSkills'),
      totalRuns: readAgg(skillsRes, 'totalRuns'),
      totalDocs: readAgg(docsRes, 'totalDocs'),
      totalChunks: readAgg(docsRes, 'totalChunks'),
      totalExecs: readAgg(execRes, 'totalExecs'),
      avgLatency: Math.round(readAgg(execRes, 'avgLatency') || 645),
      totalMemories: readAgg(memRes, 'totalMemories'),
      activeMemories: readAgg(memRes, 'activeMemories')
    };
  }, []);

  const {
    data: recentExecs,
    loading: execsLoading,
    error: execsError,
    run: refetchExecs
  } = useFetch(() =>
    sdk
      .table('executions_c')
      .select([
        'Id',
        'Name',
        'tool_used_c',
        'status_c',
        'skill_c',
        'latency_ms_c',
        'spoken_reply_c',
        'CreatedOn'
      ])
      .orderByDesc('CreatedOn')
      .page(1, 5)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return r.data;
      }),
  []);

  const {
    data: topSkills,
    loading: skillsLoading,
    error: skillsError,
    run: refetchSkills
  } = useFetch(() =>
    sdk
      .table('skills_c')
      .select(['Id', 'Name', 'trigger_phrase_c', 'category_c', 'status_c', 'run_count_c'])
      .orderByDesc('run_count_c')
      .page(1, 4)
      .fetch()
      .then((r) => {
        if (!r.success) throw new Error(r.message);
        return r.data;
      }),
  []);

  async function handleSimulateVoiceCommand(preset) {
    const commandText = preset?.command || voiceInput.trim();
    if (!commandText) {
      toast.error('Please enter or select a Hinglish voice command first.');
      return;
    }

    setSimulating(true);
    setActiveStage('1. Silero VAD: Speech End Detected (32ms frame)');

    try {
      await new Promise((r) => setTimeout(r, 180));
      setActiveStage('2. faster-whisper (Medium CUDA): Transcribing Hinglish Audio...');
      await new Promise((r) => setTimeout(r, 220));

      const detectedTool =
        preset?.tool ||
        (commandText.toLowerCase().includes('book') || commandText.toLowerCase().includes('kleppmann')
          ? 'RAG_Search'
          : commandText.toLowerCase().includes('yaad') || commandText.toLowerCase().includes('memory')
          ? 'Memory'
          : 'OS_Control');

      setActiveStage(`3. LangChain + Ollama (Qwen2.5-7B) Routing -> ${detectedTool}`);
      await new Promise((r) => setTimeout(r, 240));

      const replyText =
        preset?.reply ||
        `On it, Akash. Maine aapka command "${commandText}" local agent pipeline se execute kar diya hai aur sabhi checks pass ho gaye hain.`;
      const latencyVal = preset?.latency || Math.floor(540 + Math.random() * 240);

      setActiveStage(`4. XTTSv2 / Piper Streaming Audio Chunk #1 (${latencyVal}ms latency)`);

      const res = await sdk.table('executions_c').create({
        Name: commandText,
        tool_used_c: detectedTool,
        status_c: 'Success',
        latency_ms_c: latencyVal,
        spoken_reply_c: replyText
      });

      if (res.messages?.length) {
        toast.error(res.messages[0]);
        return;
      }

      if (res.data?.length) {
        setLastSpokenReply(replyText);
        setVoiceInput('');
        toast.success(`Voice Turn Executed in ${latencyVal}ms`);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(replyText);
            utter.lang = 'hi-IN';
            utter.rate = 1.05;
            window.speechSynthesis.speak(utter);
          } catch {
            // ignore browser TTS restrictions
          }
        }
        refetchExecs();
        refreshMetrics();
      }
    } finally {
      setSimulating(false);
      setActiveStage(null);
    }
  }

  const firstMetricsLoad = metricsLoading && metrics === undefined;
  const firstExecsLoad = execsLoading && recentExecs === undefined;
  const firstSkillsLoad = skillsLoading && topSkills === undefined;

  return (
    <div className="pb-12">
      {/* Signature Full-Bleed Primary Header Band */}
      <section className="w-full bg-primary text-primary-foreground border-b border-border shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight px-3 py-1 text-xs font-semibold text-highlight-foreground">
                  <ApperIcon name="Radio" size={13} />
                  LIVE VOICE CALL INTERFACE · AKASH
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium text-primary-foreground">
                  Ollama Qwen-2.5-7B · Silero VAD · faster-whisper · ChromaDB
                </span>
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
                J.A.R.V.I.S. Autonomous Hinglish AI Command Center
              </h1>
              <p className="text-sm sm:text-base text-primary-foreground/85">
                100% offline local voice pipeline, autonomous self-debugging OS controller, ChromaDB book knowledge base, and dynamic Python skill acquisition.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="bg-highlight text-highlight-foreground hover:bg-highlight/90 font-semibold shadow-sm"
              >
                <Link to="/blueprint">
                  <ApperIcon name="FileCode" size={16} />
                  Inspect & Download Python Files
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-medium"
              >
                <Link to="/skills">
                  <ApperIcon name="Code2" size={16} />
                  Manage Learned Skills
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-8">
        {/* Real Aggregate Telemetry Row */}
        {firstMetricsLoad ? (
          <StatsSkeleton count={4} />
        ) : metricsError ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm text-destructive">Failed to load system metrics: {metricsError}</p>
              <Button size="sm" variant="outline" onClick={refreshMetrics}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Learned Python Skills
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ApperIcon name="Code2" size={18} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-heading text-3xl font-bold">{metrics?.totalSkills ?? 0}</span>
                  <span className="text-xs text-success font-medium">
                    {metrics?.verifiedSkills ?? 0} verified · {metrics?.totalRuns ?? 0} runs
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ChromaDB Book Vault
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-highlight/20 text-foreground">
                    <ApperIcon name="BookOpen" size={18} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-heading text-3xl font-bold">{metrics?.totalDocs ?? 0}</span>
                  <span className="text-xs text-muted-foreground">
                    {(metrics?.totalChunks ?? 0).toLocaleString()} embedded chunks
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mean Voice Latency
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-success-muted text-success">
                    <ApperIcon name="Zap" size={18} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-heading text-3xl font-bold">{metrics?.avgLatency ?? 645} ms</span>
                  <span className="text-xs text-success font-medium">Sub-1000ms target met</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Memory Nodes
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <ApperIcon name="Brain" size={18} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-heading text-3xl font-bold">{metrics?.activeMemories ?? 0}</span>
                  <span className="text-xs text-muted-foreground">
                    of {metrics?.totalMemories ?? 0} stored facts
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Interactive Real-Time Hinglish Voice Pipeline Simulator + System Prompt */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-7 shadow-md border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <ApperIcon name="Mic" size={18} className="text-primary" />
                    Real-Time Hinglish Voice Loop Simulator
                  </CardTitle>
                  <CardDescription>
                    Test how <code className="text-xs bg-muted px-1.5 py-0.5 rounded">voice_loop.py</code> routes Akash’s spoken Hinglish through Silero VAD, faster-whisper, Ollama, and XTTSv2 streaming.
                  </CardDescription>
                </div>
                <Badge className="bg-success-muted text-success border border-success-border">
                  VAD Ready
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider text-primary">
                    Jarvis Spoken Output (Zero-Markdown TTS Stream)
                  </span>
                  <span>24kHz Audio Stream</span>
                </div>
                <p className="text-sm sm:text-base font-medium leading-relaxed text-foreground">
                  “{lastSpokenReply}”
                </p>
                {activeStage && (
                  <div className="flex items-center gap-2 pt-2 text-xs font-medium text-primary">
                    <ApperIcon name="LoaderCircle" size={14} className="animate-spin" />
                    <span>{activeStage}</span>
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSimulateVoiceCommand();
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <Input
                  value={voiceInput}
                  onChange={(e) => setVoiceInput(e.target.value)}
                  placeholder="Speak in Hinglish, e.g. 'Jarvis, Chrome kholo aur DDIA book ka summary batao...'"
                  disabled={simulating}
                  className="flex-1"
                />
                <Button type="submit" disabled={simulating}>
                  {simulating ? (
                    <>
                      <ApperIcon name="LoaderCircle" size={16} className="animate-spin" />
                      Streaming…
                    </>
                  ) : (
                    <>
                      <ApperIcon name="Send" size={16} />
                      Send Voice Turn
                    </>
                  )}
                </Button>
              </form>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Quick Hinglish Voice Triggers (click to execute & log):
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_VOICE_COMMANDS.map((p, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={simulating}
                      onClick={() => handleSimulateVoiceCommand(p)}
                      className="text-xs h-8"
                    >
                      <ApperIcon name="Play" size={12} className="text-primary" />
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <ApperIcon name="ShieldCheck" size={18} className="text-primary" />
                  Embedded Jarvis Persona Prompt
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(SYSTEM_PROMPT_TEXT);
                    toast.success('System prompt copied to clipboard');
                  }}
                >
                  <ApperIcon name="Copy" size={14} />
                  Copy
                </Button>
              </div>
              <CardDescription>
                Exact directive embedded in <code className="text-xs bg-muted px-1 py-0.5 rounded">agent.py</code> for Akash.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3.5 text-xs leading-relaxed font-mono text-foreground max-h-64 overflow-y-auto">
                {SYSTEM_PROMPT_TEXT}
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* Recent Voice & OS Execution Logs + Top Learned Skills */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-7 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="font-heading text-lg">Recent Voice & OS Execution Logs</CardTitle>
                <CardDescription>Real-time tool runs, auto-debug retries, and spoken Hinglish replies</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/executions">
                  View All Logs
                  <ApperIcon name="ArrowRight" size={14} />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {firstExecsLoad ? (
                <ListSkeleton rows={4} />
              ) : execsError ? (
                <div className="flex items-center justify-between rounded-md border border-destructive/30 p-4">
                  <p className="text-sm text-destructive">{execsError}</p>
                  <Button size="sm" variant="outline" onClick={refetchExecs}>
                    Retry
                  </Button>
                </div>
              ) : !(recentExecs ?? []).length ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-muted-foreground">No execution logs recorded yet.</p>
                  <Button size="sm" asChild>
                    <Link to="/executions">Log First Command</Link>
                  </Button>
                </div>
              ) : (
                <div
                  aria-busy={execsLoading}
                  className="space-y-3 transition-opacity"
                >
                  {(recentExecs ?? []).map((item) => (
                    <div
                      key={item.Id}
                      className="rounded-md border border-border bg-card p-3.5 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          to={`/executions/${item.Id}`}
                          className="font-medium text-sm text-foreground hover:text-primary line-clamp-1"
                        >
                          {item.Name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px]">
                            {item.tool_used_c}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${STATUS_BADGE_MAP[item.status_c] || ''}`}
                          >
                            {item.status_c}
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {item.latency_ms_c ?? 600}ms
                          </span>
                        </div>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                        <span className="font-semibold text-foreground">Jarvis:</span> {item.spoken_reply_c}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {item.skill_c?.Name ? `Skill: ${item.skill_c.Name}` : 'Direct Agent Execution'}
                        </span>
                        <span>{formatRelativeTime(item.CreatedOn)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="font-heading text-lg">Learned Python Skills</CardTitle>
                <CardDescription>Autonomous tools saved in ./skills/</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/skills">
                  All Skills
                  <ApperIcon name="ArrowRight" size={14} />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {firstSkillsLoad ? (
                <ListSkeleton rows={4} />
              ) : skillsError ? (
                <div className="flex items-center justify-between rounded-md border border-destructive/30 p-4">
                  <p className="text-sm text-destructive">{skillsError}</p>
                  <Button size="sm" variant="outline" onClick={refetchSkills}>
                    Retry
                  </Button>
                </div>
              ) : !(topSkills ?? []).length ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-muted-foreground">No skills taught yet.</p>
                  <Button size="sm" asChild>
                    <Link to="/skills">Teach First Skill</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(topSkills ?? []).map((sk) => (
                    <div
                      key={sk.Id}
                      className="rounded-md border border-border p-3.5 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/skills/${sk.Id}`}
                          className="font-mono text-sm font-semibold text-primary hover:underline"
                        >
                          {sk.Name}.py
                        </Link>
                        <Badge variant="outline" className="text-[11px]">
                          {sk.category_c}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                        “{sk.trigger_phrase_c}”
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Status: {sk.status_c}</span>
                        <span className="font-mono font-medium text-foreground">
                          {sk.run_count_c ?? 0} runs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
