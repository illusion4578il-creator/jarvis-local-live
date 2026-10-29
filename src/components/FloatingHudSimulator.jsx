import { useState, useEffect, useRef } from 'react';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const WAKE_WORD_PRESETS = ['Hello Jarvis', 'System Online', 'Jarvis', 'Oye Jarvis'];
const BAR_COUNT = 28;

export default function FloatingHudSimulator({
  jarvisEnabled,
  onToggleJarvis,
  wakeWord,
  onChangeWakeWord,
  enforceWakeWord,
  onToggleEnforceWakeWord,
  visualizerSource = 'idle',
  isSimulating = false
}) {
  const [bars, setBars] = useState(() => Array(BAR_COUNT).fill(0.08));
  const [micTestActive, setMicTestActive] = useState(false);
  const [rmsDb, setRmsDb] = useState(-60);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const activeMode = !jarvisEnabled
    ? 'off'
    : visualizerSource === 'tts'
    ? 'tts'
    : visualizerSource === 'mic' || micTestActive || isSimulating
    ? 'mic'
    : 'idle';

  useEffect(() => {
    if (!jarvisEnabled && micTestActive) {
      stopBrowserMicTest();
    }
  }, [jarvisEnabled, micTestActive]);

  useEffect(() => {
    return () => {
      stopBrowserMicTest();
    };
  }, []);

  useEffect(() => {
    if (activeMode === 'off') {
      setBars(Array(BAR_COUNT).fill(0.06));
      setRmsDb(-96);
      return;
    }

    const interval = setInterval(() => {
      if (analyserRef.current && micTestActive) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const nextBars = [];
        let sum = 0;
        for (let i = 0; i < BAR_COUNT; i++) {
          const idx = Math.min(dataArray.length - 1, Math.floor((i / BAR_COUNT) * (dataArray.length * 0.65)));
          const norm = Math.max(0.08, Math.min(1, dataArray[idx] / 235));
          nextBars.push(norm);
          sum += norm;
        }
        const avg = sum / BAR_COUNT;
        setBars(nextBars);
        setRmsDb(Math.round(-55 + avg * 52));
        return;
      }

      const now = Date.now() / 110;
      const nextBars = Array.from({ length: BAR_COUNT }, (_, idx) => {
        const centerDist = 1 - Math.abs(idx - BAR_COUNT / 2) / (BAR_COUNT / 2);
        if (activeMode === 'idle') {
          return 0.1 + 0.06 * Math.sin(now + idx * 0.45) * centerDist;
        }
        const wave =
          0.45 * Math.sin(now * 2.1 + idx * 0.5) +
          0.35 * Math.cos(now * 1.4 - idx * 0.3) +
          0.2 * Math.random();
        return Math.max(0.12, Math.min(1, (0.35 + Math.abs(wave) * 0.65) * (0.45 + 0.55 * centerDist)));
      });

      const mean = nextBars.reduce((a, b) => a + b, 0) / BAR_COUNT;
      setBars(nextBars);
      setRmsDb(activeMode === 'idle' ? -48 : Math.round(-42 + mean * 38));
    }, 45);

    return () => clearInterval(interval);
  }, [activeMode, micTestActive]);

  async function toggleBrowserMicTest() {
    if (!jarvisEnabled) {
      toast.error('Switch "Jarvis: ON" first to enable microphone waveform.');
      return;
    }
    if (micTestActive) {
      stopBrowserMicTest();
      toast.info('Live microphone waveform test stopped.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      setMicTestActive(true);
      toast.success('Live Microphone connected to HUD Waveform Visualizer!');
    } catch {
      setMicTestActive(true);
      toast.info('Simulating live microphone RMS waveform in HUD.');
    }
  }

  function stopBrowserMicTest() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setMicTestActive(false);
  }

  return (
    <Card className="shadow-md border-primary/30 bg-card">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <ApperIcon name="Monitor" size={18} className="text-primary" />
                Floating Desktop GUI Controller (gui_app.py · PyQt5 + Live Waveform)
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[11px]">
                30 FPS QPainter Audio Bar
              </Badge>
            </div>
            <CardDescription className="mt-1">
              Real-time glowing audio waveform bar reacting to Akash’s microphone RMS volume and Jarvis’s 24kHz XTTSv2 output.
            </CardDescription>
          </div>

          <Badge
            variant="outline"
            className={
              jarvisEnabled
                ? 'bg-success-muted text-success border-success-border font-semibold'
                : 'bg-destructive/15 text-destructive border-destructive/30 font-semibold'
            }
          >
            {jarvisEnabled ? 'MIC LIVE · SILERO VAD ARMED' : 'MIC COMPLETELY DEAD (OFF)'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Real-Time Glowing Voice Waveform Visualizer Bar */}
        <div className="rounded-lg border border-border bg-sidebar p-4 space-y-3 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  activeMode === 'off' && 'bg-destructive',
                  activeMode === 'idle' && 'bg-success',
                  activeMode === 'mic' && 'bg-success animate-ping',
                  activeMode === 'tts' && 'bg-highlight animate-ping'
                )}
              />
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-sidebar-foreground">
                {activeMode === 'off' && 'WAVEFORM LOCKED · HARDWARE MIC OFF'}
                {activeMode === 'idle' && `SILERO VAD FLOOR · LISTENING FOR "${wakeWord}"`}
                {activeMode === 'mic' && 'AKASH MIC INPUT ACTIVE · 16kHz RMS STREAM'}
                {activeMode === 'tts' && 'JARVIS TTS STREAMING · 24kHz XTTSv2 ENVELOPE'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                Level: <strong className="text-sidebar-foreground">{rmsDb} dBFS</strong>
              </span>
              <Button
                type="button"
                size="sm"
                variant={micTestActive ? 'default' : 'outline'}
                disabled={!jarvisEnabled}
                onClick={toggleBrowserMicTest}
                className="h-7 text-xs"
              >
                <ApperIcon name={micTestActive ? 'Volume2' : 'Mic'} size={13} />
                {micTestActive ? 'Stop Mic Test' : 'Test Mic Waveform'}
              </Button>
            </div>
          </div>

          {/* 28 Symmetrical Glowing Waveform Bars */}
          <div className="flex h-16 items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/70 px-4 py-2">
            {bars.map((val, idx) => {
              const heightPct = Math.max(8, Math.round(val * 100));
              return (
                <div
                  key={idx}
                  style={{ height: `${heightPct}%` }}
                  className={cn(
                    'w-2 rounded-full transition-all duration-(--transition-fast)',
                    activeMode === 'off' && 'bg-muted-foreground/30',
                    activeMode === 'idle' && 'bg-primary/45',
                    activeMode === 'mic' && 'bg-success shadow-sm',
                    activeMode === 'tts' && 'bg-highlight shadow-sm'
                  )}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground">
            <span>
              🟢 <strong className="text-foreground">Cyan/Emerald Glow:</strong> Akash Mic RMS + Silero VAD Probability
            </span>
            <span>
              🟠 <strong className="text-foreground">Indigo/Amber Glow:</strong> Jarvis XTTSv2 / Piper Spoken Audio Envelope
            </span>
          </div>
        </div>

        {/* Prominent Jarvis ON / OFF Toggle Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  jarvisEnabled ? 'bg-success animate-pulse' : 'bg-destructive'
                }`}
              />
              <span className="font-heading text-base font-bold">
                {jarvisEnabled ? 'Jarvis: ON (Listening Loop Active)' : 'Jarvis: OFF (Hardware Mic Closed)'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {jarvisEnabled
                ? `Listening on 16kHz PyAudio/SoundDevice stream for wake-word "${wakeWord}"...`
                : 'sd.InputStream is closed and released. Zero audio frames are read from your microphone.'}
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            onClick={() => {
              const next = !jarvisEnabled;
              onToggleJarvis(next);
              toast.success(
                next
                  ? `Jarvis ON — Listening for "${wakeWord}"`
                  : 'Jarvis OFF — Microphone stream completely terminated'
              );
            }}
            className={
              jarvisEnabled
                ? 'bg-success text-success-foreground hover:bg-success/90 font-bold px-6 shadow-sm'
                : 'bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold px-6 shadow-sm'
            }
          >
            <ApperIcon name={jarvisEnabled ? 'Mic' : 'MicOff'} size={18} />
            {jarvisEnabled ? 'Jarvis: ON' : 'Jarvis: OFF'}
          </Button>
        </div>

        {/* Custom Wake-Word Settings */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-end">
          <div className="sm:col-span-7 space-y-1.5">
            <Label htmlFor="wake-word-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Custom Wake-Word Phrase
            </Label>
            <div className="flex gap-2">
              <Input
                id="wake-word-input"
                value={wakeWord}
                onChange={(e) => onChangeWakeWord(e.target.value)}
                placeholder="Hello Jarvis, System Online..."
                className="font-medium"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => toast.success(`Wake-word updated to "${wakeWord}"`)}
              >
                Apply
              </Button>
            </div>
          </div>

          <div className="sm:col-span-5 flex items-center justify-between rounded-md border border-border px-3.5 py-2.5 bg-background">
            <div>
              <Label htmlFor="enforce-wake-switch" className="text-xs font-semibold">
                Require Wake-Word Prefix
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Ignore speech unless wake-word is spoken
              </p>
            </div>
            <Switch
              id="enforce-wake-switch"
              checked={enforceWakeWord}
              onCheckedChange={onToggleEnforceWakeWord}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Quick Wake-Word Presets:</span>
          {WAKE_WORD_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant={wakeWord === preset ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChangeWakeWord(preset);
                toast.success(`Wake-word set to "${preset}"`);
              }}
            >
              “{preset}”
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
