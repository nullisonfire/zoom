import React, { useState, useEffect, useRef } from 'react';
import { MeetingFile } from '../lib/types';
import { api } from '../lib/api';

interface FilesPanelProps {
  meetingPublicId: string;
  onClose: () => void;
}

export const FilesPanel: React.FC<FilesPanelProps> = ({ meetingPublicId, onClose }) => {
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const res = await api.listFiles(meetingPublicId);
      setFiles(res.files);
    } catch (err: any) {
      setError(err.message || 'Failed to load files');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [meetingPublicId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size exceeds the 50 MB limit');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const res = await api.uploadFile(meetingPublicId, selectedFile);
      setFiles((prev) => [res.file, ...prev]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-10 shadow-2xl">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <h3 className="font-bold text-white text-base">Shared Files ({files.length})</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Upload Button Section */}
      <div className="p-4 border-b border-slate-800">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
          disabled={uploading}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-xl p-4 text-center cursor-pointer transition-colors disabled:opacity-50"
        >
          <svg className="w-6 h-6 text-orange-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span className="text-sm font-semibold text-slate-200 block">
            {uploading ? 'Uploading to R2 Storage...' : 'Upload File to Meeting'}
          </span>
          <span className="text-xs text-slate-500">Cloudflare R2 Object Storage (up to 50 MB)</span>
        </button>
        {error && <p className="text-rose-400 text-xs mt-2 text-center">{error}</p>}
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {files.length === 0 ? (
          <div className="text-center text-slate-500 text-sm mt-12 px-4">
            No files have been shared in this meeting yet.
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 transition-colors"
            >
              <div className="truncate mr-3">
                <span className="text-sm font-medium text-slate-200 block truncate" title={file.file_name}>
                  {file.file_name}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {formatFileSize(file.file_size)} • by {file.uploader_name || 'Participant'}
                </span>
              </div>
              <a
                href={api.getFileDownloadUrl(meetingPublicId, file.id)}
                download={file.file_name}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg bg-slate-800 hover:bg-orange-500 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                title="Download file"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
