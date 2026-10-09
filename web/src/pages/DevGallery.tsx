import React, { useState } from 'react';
import {
  Button,
  Badge,
  Chip,
  TyreBadge,
  FlagPill,
  DriverChip,
  Card,
  PanelHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Segmented,
  Toggle,
  Slider,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Gauge,
  StatBar,
  Sparkline,
  Skeleton,
  EmptyState,
  ErrorState,
  Kbd,
  ProgressBar,
  Wordmark,
} from '@/components';
import { Play, Pause, Settings, Info, Bell, Download } from 'lucide-react';
import { mockTeamColors } from '@/design/tokens';
import { PageNav, BigTitle } from '@/motion/PageKit';
import './gallery.css';

export const DevGallery: React.FC = () => {
  const [segmentedVal, setSegmentedVal] = useState('leaderboard');
  const [toggleVal, setToggleVal] = useState(true);
  const [sliderVal, setSliderVal] = useState([45]);
  const [gaugeSpeed, setGaugeSpeed] = useState(285);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const toggleDensity = () => {
    const next = density === 'comfortable' ? 'compact' : 'comfortable';
    setDensity(next);
    document.documentElement.setAttribute('data-density', next);
  };

  return (
    <TooltipProvider>
      <div className="pg gal min-h-screen overflow-y-auto">
        <PageNav section="DESIGN SYSTEM">
          <button className="gal-density" onClick={toggleDensity}>DENSITY · {density.toUpperCase()}</button>
        </PageNav>
        <BigTitle text="Parts" sub="Every primitive in the system, live. Tokens, controls, gauges and states: the pieces the race is built from." />
        <div className="gal-body space-y-10 pb-16">
          {/* Section: Wordmark */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              1. Brand Wordmark (No Official F1 Logo)
            </h2>
            <Card className="p-6 flex items-center gap-8">
              <Wordmark size="sm" />
              <Wordmark size="md" />
              <Wordmark size="lg" />
            </Card>
          </section>

          {/* Section: v1.1 Surface Ladder & Canvas Tokens */}
          <section className="space-y-4 gal-sec">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
                1b. Surface Luminance Ladder & Canvas Tokens (v1.1)
              </h2>
              <Badge variant="accent">CONTRAST CERTIFIED</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-[var(--r-md)] bg-[var(--surface-0)] border border-[var(--border)] space-y-1">
                <span className="font-mono text-[10px] text-[var(--text-3)]">--surface-0</span>
                <div className="font-bold text-xs text-[var(--text-1)]">Backdrop (3.5%)</div>
              </div>
              <div className="p-3.5 rounded-[var(--r-md)] bg-[var(--surface-1)] border border-[var(--border)] space-y-1">
                <span className="font-mono text-[10px] text-[var(--text-3)]">--surface-1</span>
                <div className="font-bold text-xs text-[var(--text-1)]">Workspace (8%)</div>
              </div>
              <div className="p-3.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border-hi)] space-y-1">
                <span className="font-mono text-[10px] text-[var(--text-3)]">--surface-2</span>
                <div className="font-bold text-xs text-[var(--text-1)]">Panels & Tower (12%)</div>
              </div>
              <div className="p-3.5 rounded-[var(--r-md)] bg-[var(--surface-3)] border border-[var(--border-hi)] space-y-1">
                <span className="font-mono text-[10px] text-[var(--text-3)]">--surface-3</span>
                <div className="font-bold text-xs text-[var(--text-1)]">Elevated (18%)</div>
              </div>
              <div className="p-3.5 rounded-[var(--r-md)] bg-[var(--surface-4)] border border-[var(--border-strong)] space-y-1">
                <span className="font-mono text-[10px] text-[var(--text-3)]">--surface-4</span>
                <div className="font-bold text-xs text-[var(--text-1)]">Active / Modals (23%)</div>
              </div>
            </div>

            {/* Canvas Tokens Preview */}
            <Card className="p-4 flex flex-wrap items-center gap-4 bg-[var(--surface-1)]">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs border border-[var(--border-hi)] bg-[var(--track-asphalt)]" />
                <span className="font-mono text-xs text-[var(--text-2)]">Asphalt (≥1.3:1)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs border border-[var(--border)] bg-[var(--track-edge)]" />
                <span className="font-mono text-xs text-[var(--text-2)]">Edge Line (≥3:1)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs border border-[var(--border)] bg-[var(--track-centerline)]" />
                <span className="font-mono text-xs text-[var(--text-2)]">Centerline</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-xs border border-[var(--border)] bg-[var(--drs-band-active)]" />
                <span className="font-mono text-xs text-[var(--text-2)]">DRS Active</span>
              </div>
            </Card>
          </section>

          {/* Section: Buttons */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              2. Buttons & States
            </h2>
            <Card className="p-6 space-y-6">
              {/* Variants */}
              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Variants</span>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="icon" aria-label="Play">
                    <Play className="w-4 h-4 fill-current" />
                  </Button>
                  <Button variant="icon" aria-label="Pause">
                    <Pause className="w-4 h-4 fill-current" />
                  </Button>
                </div>
              </div>

              {/* Sizes */}
              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Sizes</span>
                <div className="flex items-center gap-3">
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                  <Button variant="icon" size="sm" aria-label="Settings"><Settings className="w-3.5 h-3.5" /></Button>
                  <Button variant="icon" size="md" aria-label="Settings"><Settings className="w-4 h-4" /></Button>
                  <Button variant="icon" size="lg" aria-label="Settings"><Settings className="w-5 h-5" /></Button>
                </div>
              </div>

              {/* States: Disabled & Loading */}
              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">States (Disabled & Loading)</span>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" disabled>Disabled Primary</Button>
                  <Button variant="secondary" disabled>Disabled Secondary</Button>
                  <Button variant="primary" loading>Processing</Button>
                  <Button variant="secondary" loading>Loading</Button>
                </div>
              </div>
            </Card>
          </section>

          {/* Section: Badges & Chips */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              3. Panel Headers
            </h2>
            <Card className="divide-y divide-[var(--border)] overflow-hidden">
              <PanelHeader
                title="Timing Tower"
                badge={<Badge variant="accent">LIVE</Badge>}
                onCollapse={() => alert('Collapse clicked')}
                onClose={() => alert('Close clicked')}
              />
              <PanelHeader
                title="Telemetry Inspector"
                badge={<Badge variant="insight">P1 FOCUS</Badge>}
                actions={
                  <Button variant="ghost" size="sm" className="text-xs">
                    Export
                  </Button>
                }
              />
            </Card>
          </section>

          {/* Section: Badges & Chips */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              4. Badges, Chips & Keyboard Caps
            </h2>
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Badges (Semantic)</span>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="default">DEFAULT</Badge>
                  <Badge variant="accent" dot>LIVE</Badge>
                  <Badge variant="success" dot>PERSONAL BEST</Badge>
                  <Badge variant="warning" dot>CAUTION</Badge>
                  <Badge variant="danger" dot>DEFECT</Badge>
                  <Badge variant="best" dot>OVERALL BEST</Badge>
                  <Badge variant="insight" dot>ML ESTIMATE</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Chips</span>
                <div className="flex flex-wrap items-center gap-3">
                  <Chip clickable>All Drivers</Chip>
                  <Chip active clickable>Selected (Active)</Chip>
                  <Chip variant="accent" clickable>P1 Focus</Chip>
                  <Chip variant="insight" clickable>AI Overtake Prob 82%</Chip>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Keyboard Caps (Kbd)</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-2)] flex items-center gap-1.5">
                    <Kbd>SPACE</Kbd> Play/Pause
                  </span>
                  <span className="text-xs text-[var(--text-2)] flex items-center gap-1.5">
                    <Kbd>←</Kbd> <Kbd>→</Kbd> Seek 5s
                  </span>
                  <span className="text-xs text-[var(--text-2)] flex items-center gap-1.5">
                    <Kbd>R</Kbd> Restart
                  </span>
                  <span className="text-xs text-[var(--text-2)] flex items-center gap-1.5">
                    <Kbd>D</Kbd> DRS Zones
                  </span>
                </div>
              </div>
            </Card>
          </section>

          {/* Section: F1 Domain Components (Tyres, Flags, Drivers) */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              4. F1 Domain Primitives (Tyres, Flags, Driver Chips)
            </h2>
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Tyre Badges (S/M/H/I/W with Life)</span>
                <div className="flex items-center gap-5">
                  <TyreBadge compound="S" tyreLife={12} size="md" />
                  <TyreBadge compound="M" tyreLife={24} size="md" />
                  <TyreBadge compound="H" tyreLife={35} size="md" />
                  <TyreBadge compound="I" tyreLife={6} size="md" />
                  <TyreBadge compound="W" tyreLife={2} size="md" />
                  <TyreBadge compound="S" size="sm" />
                  <TyreBadge compound="M" size="lg" tyreLife={18} />
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Flag Status Pills</span>
                <div className="flex flex-wrap items-center gap-3">
                  <FlagPill status="green" />
                  <FlagPill status="yellow" />
                  <FlagPill status="sc" />
                  <FlagPill status="vsc" />
                  <FlagPill status="red" />
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[var(--text-3)]">Driver Chips (Team Color & Code)</span>
                <div className="flex flex-wrap items-center gap-3">
                  <DriverChip code="VER" number={1} position={1} teamColor={mockTeamColors.VER} active />
                  <DriverChip code="NOR" number={4} position={2} teamColor={mockTeamColors.NOR} />
                  <DriverChip code="LEC" number={16} position={3} teamColor={mockTeamColors.LEC} />
                  <DriverChip code="RUS" number={63} position={4} teamColor={mockTeamColors.RUS} />
                  <DriverChip code="ALO" number={14} position={5} teamColor={mockTeamColors.ALO} />
                </div>
              </div>
            </Card>
          </section>

          {/* Section: Telemetry, Gauges & Sparklines */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              5. Telemetry Gauges, StatBars & Sparklines
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-4 flex flex-col items-center">
                <Gauge value={gaugeSpeed} max={350} label="SPEED" unit="km/h" variant="accent" />
                <div className="w-full mt-4 flex items-center justify-between">
                  <Button size="sm" onClick={() => setGaugeSpeed(Math.max(0, gaugeSpeed - 30))}>-30</Button>
                  <Button size="sm" onClick={() => setGaugeSpeed(Math.min(350, gaugeSpeed + 30))}>+30</Button>
                </div>
              </Card>

              <Card className="p-4 flex flex-col justify-between space-y-4">
                <StatBar label="Throttle" value={88} variant="throttle" />
                <StatBar label="Brake" value={42} variant="brake" />
                <StatBar label="Tyre Wear (FL)" value={65} variant="default" />
                <StatBar label="ERS Energy" value={92} variant="insight" />
              </Card>

              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-display font-bold text-[var(--text-3)] uppercase">
                    Speed Delta Trend
                  </span>
                  <div className="mt-3 flex justify-center">
                    <Sparkline
                      data={[240, 245, 252, 270, 285, 290, 280, 210, 160, 180, 240, 280, 310]}
                      width={220}
                      height={50}
                      color="var(--insight)"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-[var(--text-2)] font-mono border-t border-[var(--border)] pt-2 mt-2">
                  <span>Delta vs Leader</span>
                  <span className="text-[var(--success)] font-bold">-0.342s</span>
                </div>
              </Card>
            </div>
          </section>

          {/* Section: Panels, Tabs & Controls */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              6. Interactive Controls (Tabs, Segmented, Toggle, Slider, Popover, Dialog)
            </h2>
            <Card className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <span className="text-xs font-mono text-[var(--text-3)]">Segmented Control</span>
                  <div>
                    <Segmented
                      value={segmentedVal}
                      onChange={setSegmentedVal}
                      options={[
                        { value: 'leaderboard', label: 'Leaderboard' },
                        { value: 'intervals', label: 'Intervals' },
                        { value: 'sectors', label: 'Sectors' },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-xs font-mono text-[var(--text-3)]">Toggle & Slider</span>
                  <div className="space-y-4">
                    <Toggle
                      label="Driver Map Labels"
                      checked={toggleVal}
                      onCheckedChange={setToggleVal}
                    />
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-[var(--text-3)]">
                        <span>Playback Speed</span>
                        <span className="font-mono text-[var(--text-1)]">{sliderVal[0]}%</span>
                      </div>
                      <Slider
                        value={sliderVal}
                        onValueChange={setSliderVal}
                        max={100}
                        step={1}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-t border-[var(--border)] pt-4">
                <Tabs defaultValue="telemetry">
                  <TabsList>
                    <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
                    <TabsTrigger value="stints">Stints & Tyres</TabsTrigger>
                    <TabsTrigger value="weather">Weather</TabsTrigger>
                  </TabsList>
                  <TabsContent value="telemetry" className="p-3 bg-[var(--surface-1)] rounded-[var(--r-md)] border border-[var(--border)] text-xs text-[var(--text-2)]">
                    Live channel telemetry stream active (speed, throttle, brake, gear, DRS).
                  </TabsContent>
                  <TabsContent value="stints" className="p-3 bg-[var(--surface-1)] rounded-[var(--r-md)] border border-[var(--border)] text-xs text-[var(--text-2)]">
                    Driver stint histories and pit stop strategies.
                  </TabsContent>
                  <TabsContent value="weather" className="p-3 bg-[var(--surface-1)] rounded-[var(--r-md)] border border-[var(--border)] text-xs text-[var(--text-2)]">
                    Track temp 32°C, Air temp 24°C, Wind 12 km/h SW, Rainfall: 0%.
                  </TabsContent>
                </Tabs>
              </div>

              {/* Overlays: Tooltip, Popover, Dialog, Dropdown Menu */}
              <div className="border-t border-[var(--border)] pt-4 flex flex-wrap items-center gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="sm">Hover for Tooltip</Button>
                  </TooltipTrigger>
                  <TooltipContent>Broadcast-accurate GPS position</TooltipContent>
                </Tooltip>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" size="sm">Open Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <h5 className="font-bold text-xs uppercase text-[var(--insight)] mb-1">
                      Predictive Model Insight
                    </h5>
                    <p className="text-xs text-[var(--text-2)]">
                      Predicted undercut window opens on Lap 18 (+2.4s advantage).
                    </p>
                  </PopoverContent>
                </Popover>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary" size="sm">Open Modal Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Session Settings</DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-[var(--text-2)]">
                      Configure replay resolution, hardware acceleration, and audio feeds.
                    </p>
                  </DialogContent>
                </Dialog>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">Dropdown Menu</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem className="gap-2">
                      <Download className="w-3.5 h-3.5" /> Export Telemetry (.csv)
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2">
                      <Bell className="w-3.5 h-3.5" /> Race Control Alerts
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2">
                      <Info className="w-3.5 h-3.5" /> Keyboard Shortcuts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          </section>

          {/* Section: Loading, Empty & Error States */}
          <section className="space-y-4 gal-sec">
            <h2 className="text-sm font-display font-bold uppercase tracking-wider text-[var(--text-3)]">
              7. Loading, Skeleton, Empty & Error States
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-4 space-y-3">
                <span className="text-xs font-mono text-[var(--text-3)]">Skeleton Loader</span>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <ProgressBar value={68} className="mt-4" />
              </Card>

              <EmptyState
                title="No Driver Selected"
                description="Click any driver in the timing tower to inspect real-time telemetry."
              />

              <ErrorState
                title="Telemetry Feed Disconnected"
                message="WebSocket connection timed out (port 8000)."
                onRetry={() => alert('Retrying connection...')}
              />
            </div>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
};
