import { useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { clsx } from 'clsx';
import { useLibraryStore } from '../stores/libraryStore';
import { FolderIcon, TrashIcon, RefreshIcon, FolderPlusIcon } from '../components/icons';

export default function LibraryPage() {
  const { folders, isScanning, addFolder, removeFolder, scanLibrary, tracks } = useLibraryStore();
  const [scanResult, setScanResult] = useState<number | null>(null);

  const handleAddFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
      });

      if (selected && typeof selected === 'string') {
        await addFolder(selected);
      }
    } catch (error) {
      console.error('Failed to add folder:', error);
    }
  };

  const handleRemoveFolder = async (path: string) => {
    if (confirm(`Remove "${path}" from library? This will remove all tracks from this folder.`)) {
      await removeFolder(path);
    }
  };

  const handleScan = async () => {
    setScanResult(null);
    const added = await scanLibrary();
    setScanResult(added);
  };

  return (
    <div className="p-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Library</h1>
          <p className="text-text-secondary mt-1">
            {tracks.length} tracks in your library
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleScan}
            disabled={isScanning || folders.length === 0}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
              isScanning || folders.length === 0
                ? 'bg-amoled-card text-text-muted cursor-not-allowed'
                : 'bg-amoled-card text-text-primary hover:bg-amoled-hover'
            )}
          >
            <RefreshIcon className={clsx('w-4 h-4', isScanning && 'animate-spin')} />
            {isScanning ? 'Scanning...' : 'Scan Library'}
          </button>
          <button
            onClick={handleAddFolder}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-amoled-black rounded-lg font-medium hover:bg-accent-secondary transition-colors"
          >
            <FolderPlusIcon className="w-4 h-4" />
            Add Folder
          </button>
        </div>
      </div>

      {/* Scan Result */}
      {scanResult !== null && (
        <div className="mb-6 p-4 bg-amoled-card rounded-lg border border-amoled-border">
          <p className="text-text-primary">
            {scanResult === 0 
              ? 'No new tracks found.' 
              : `Added ${scanResult} new track${scanResult !== 1 ? 's' : ''} to your library.`}
          </p>
        </div>
      )}

      {/* Folders List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Music Folders</h2>
        
        {folders.length > 0 ? (
          <div className="space-y-2">
            {folders.map((folder) => (
              <div
                key={folder.path}
                className="flex items-center gap-4 p-4 bg-amoled-card rounded-lg border border-amoled-border hover:border-amoled-hover transition-colors"
              >
                <FolderIcon className="w-5 h-5 text-accent-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium truncate">{folder.path}</p>
                  {folder.last_scanned && (
                    <p className="text-xs text-text-muted">
                      Last scanned: {new Date(parseInt(folder.last_scanned) * 1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'px-2 py-1 text-xs rounded',
                    folder.enabled 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  )}>
                    {folder.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <button
                    onClick={() => handleRemoveFolder(folder.path)}
                    className="p-2 text-text-muted hover:text-red-400 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-amoled-card rounded-lg border border-dashed border-amoled-border">
            <FolderIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              No folders added yet
            </h3>
            <p className="text-text-secondary mb-4">
              Add folders containing your FLAC, WAV, or ALAC files
            </p>
            <button
              onClick={handleAddFolder}
              className="px-4 py-2 bg-accent-primary text-amoled-black rounded-lg font-medium hover:bg-accent-secondary transition-colors"
            >
              Add Music Folder
            </button>
          </div>
        )}
      </div>

      {/* Supported Formats */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Supported Formats</h2>
        <div className="flex flex-wrap gap-2">
          {['FLAC', 'WAV', 'ALAC', 'AIFF', 'MP3', 'OGG', 'OPUS'].map((format) => (
            <span
              key={format}
              className="px-3 py-1 bg-amoled-card rounded-full text-sm text-text-secondary border border-amoled-border"
            >
              {format}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
