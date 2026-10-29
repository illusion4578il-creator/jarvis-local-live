import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const WAKE_WORD_PRESETS = ['Hello Jarvis', 'System Online', 'Jarvis', 'Oye Jarvis'];

export default function FloatingHudSimulator({
  jarvisEnabled,
  onToggleJarvis,
  wakeWord,
  onChangeWakeWord,
  enforceWakeWord,
  onToggleEnforceWakeWord
}) {
  return (
    <Card className="shadow-md border-primary/30 bg-card">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <ApperIcon name="Monitor" size={18} className="text-primary" />
                Floating Desktop GUI Controller (gui_app.py · PyQt5)
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[11px]">
                Always-On-Top HUD
              </Badge>
            </div>
            <CardDescription className="mt-1">
              Controls the hardware microphone stream and custom Wake-Word gate for <code className="text-xs bg-muted px-1 py-0.5 rounded">llama-3.1-8b-instruct-abliterated</code> (Odysseus Uncensored).
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
