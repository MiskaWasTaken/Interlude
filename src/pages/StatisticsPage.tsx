import { useLibraryStore } from '../stores/libraryStore';
import { formatDuration, formatFileSize } from '../utils/format';
import { ChartIcon, ClockIcon, AlbumIcon, ArtistIcon, AudioWaveIcon } from '../components/icons';

export default function StatisticsPage() {
  const { statistics, tracks } = useLibraryStore();

  // Calculate additional stats
  const hiResCount = tracks.filter(t => t.bit_depth >= 24 || t.sample_rate > 48000).length;
  const formatDistribution = tracks.reduce((acc, track) => {
    acc[track.format] = (acc[track.format] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bitDepthDistribution = tracks.reduce((acc, track) => {
    const key = `${track.bit_depth}-bit`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sampleRateDistribution = tracks.reduce((acc, track) => {
    const key = `${(track.sample_rate / 1000).toFixed(1)}kHz`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 pb-28">
      <h1 className="text-2xl font-bold text-text-primary mb-8">Statistics</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<span className="text-2xl">♪</span>}
          label="Total Tracks"
          value={statistics?.total_tracks || 0}
        />
        <StatCard
          icon={<AlbumIcon className="w-6 h-6" />}
          label="Albums"
          value={statistics?.total_albums || 0}
        />
        <StatCard
          icon={<ArtistIcon className="w-6 h-6" />}
          label="Artists"
          value={statistics?.total_artists || 0}
        />
        <StatCard
          icon={<ClockIcon className="w-6 h-6" />}
          label="Total Duration"
          value={formatDuration(statistics?.total_duration || 0)}
          isString
        />
      </div>

      {/* Storage & Quality */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Storage */}
        <div className="bg-amoled-card rounded-xl p-6 border border-amoled-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Storage</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Total Size</span>
              <span className="text-text-primary font-medium">
                {formatFileSize(statistics?.total_size || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Average Track Size</span>
              <span className="text-text-primary font-medium">
                {formatFileSize(
                  statistics?.total_tracks 
                    ? (statistics.total_size / statistics.total_tracks) 
                    : 0
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Quality */}
        <div className="bg-amoled-card rounded-xl p-6 border border-amoled-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Quality</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Hi-Res Tracks</span>
              <span className="text-accent-primary font-medium">
                {hiResCount} ({((hiResCount / (tracks.length || 1)) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Standard Quality</span>
              <span className="text-text-primary font-medium">
                {tracks.length - hiResCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Distributions */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Format Distribution */}
        <div className="bg-amoled-card rounded-xl p-6 border border-amoled-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Formats</h2>
          <div className="space-y-3">
            {Object.entries(formatDistribution)
              .sort(([, a], [, b]) => b - a)
              .map(([format, count]) => (
                <div key={format}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{format}</span>
                    <span className="text-text-primary">{count}</span>
                  </div>
                  <div className="h-2 bg-amoled-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-primary rounded-full"
                      style={{ width: `${(count / tracks.length) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Bit Depth Distribution */}
        <div className="bg-amoled-card rounded-xl p-6 border border-amoled-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Bit Depth</h2>
          <div className="space-y-3">
            {Object.entries(bitDepthDistribution)
              .sort(([a], [b]) => parseInt(b) - parseInt(a))
              .map(([depth, count]) => (
                <div key={depth}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{depth}</span>
                    <span className="text-text-primary">{count}</span>
                  </div>
                  <div className="h-2 bg-amoled-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-primary rounded-full"
                      style={{ width: `${(count / tracks.length) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Sample Rate Distribution */}
        <div className="bg-amoled-card rounded-xl p-6 border border-amoled-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Sample Rate</h2>
          <div className="space-y-3">
            {Object.entries(sampleRateDistribution)
              .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
              .map(([rate, count]) => (
                <div key={rate}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{rate}</span>
                    <span className="text-text-primary">{count}</span>
                  </div>
                  <div className="h-2 bg-amoled-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-primary rounded-full"
                      style={{ width: `${(count / tracks.length) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  isString?: boolean;
}

function StatCard({ icon, label, value, isString }: StatCardProps) {
  return (
    <div className="bg-amoled-card rounded-xl p-5 border border-amoled-border">
      <div className="flex items-center gap-3 mb-3 text-text-muted">
        {icon}
      </div>
      <p className="text-3xl font-bold text-text-primary mb-1">
        {isString ? value : value.toLocaleString()}
      </p>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}
