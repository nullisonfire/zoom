import { Database } from './db';
import { Env, MeetingFile } from './types';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_MEETING_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export class StorageService {
  constructor(private db: Database, private env: Env) {}

  /**
   * Upload user avatar to R2 storage.
   */
  async uploadAvatar(userId: string, fileData: ArrayBuffer, mimeType: string): Promise<string> {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType.toLowerCase())) {
      throw new Error('INVALID_MIME_TYPE: Avatar must be a JPEG, PNG, WebP, or GIF image');
    }

    if (fileData.byteLength > MAX_AVATAR_SIZE) {
      throw new Error('FILE_TOO_LARGE: Avatar image cannot exceed 5 MB');
    }

    const fileId = crypto.randomUUID();
    const r2Key = `users/${userId}/avatar/${fileId}`;

    if (this.env.STORAGE) {
      await this.env.STORAGE.put(r2Key, fileData, {
        httpMetadata: {
          contentType: mimeType,
          cacheControl: 'public, max-age=86400',
        },
      });
    }

    await this.db.updateUser(userId, { avatar_key: r2Key });
    return r2Key;
  }

  /**
   * Fetch user avatar from R2 storage.
   */
  async getAvatar(avatarKey: string): Promise<R2ObjectBody | null> {
    if (!this.env.STORAGE) return null;
    return this.env.STORAGE.get(avatarKey);
  }

  /**
   * Upload a shared file to a meeting in R2.
   */
  async uploadMeetingFile(params: {
    meetingPublicId: string;
    userId: string;
    fileName: string;
    fileData: ArrayBuffer;
    mimeType: string;
  }): Promise<MeetingFile> {
    const meeting = await this.db.getMeetingByPublicId(params.meetingPublicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }

    if (!meeting.settings.allowFileUploads) {
      throw new Error('FORBIDDEN: File sharing is disabled for this meeting');
    }

    if (params.fileData.byteLength > MAX_MEETING_FILE_SIZE) {
      throw new Error('FILE_TOO_LARGE: File size cannot exceed 50 MB');
    }

    // Sanitize file name: extract base name, remove path traversal, special characters
    const baseName = params.fileName.split(/[/\\]/).pop() || 'upload';
    const sanitizedFileName = baseName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '')
      .replace(/\.\.+/g, '.')
      .slice(0, 100) || 'uploaded-file';

    const fileId = crypto.randomUUID();
    const r2Key = `meetings/${meeting.id}/files/${fileId}-${sanitizedFileName}`;

    if (this.env.STORAGE) {
      await this.env.STORAGE.put(r2Key, params.fileData, {
        httpMetadata: {
          contentType: params.mimeType || 'application/octet-stream',
          contentDisposition: `attachment; filename="${sanitizedFileName}"`,
        },
      });
    }

    const meetingFile = await this.db.createMeetingFile({
      id: fileId,
      meeting_id: meeting.id,
      uploader_user_id: params.userId,
      file_name: sanitizedFileName,
      file_size: params.fileData.byteLength,
      mime_type: params.mimeType || 'application/octet-stream',
      r2_key: r2Key,
    });

    await this.db.logMeetingEvent(meeting.id, params.userId, 'file_uploaded', {
      fileId,
      fileName: sanitizedFileName,
      fileSize: params.fileData.byteLength,
    });

    return meetingFile;
  }

  /**
   * List files uploaded to a meeting.
   */
  async listMeetingFiles(meetingPublicId: string): Promise<MeetingFile[]> {
    const meeting = await this.db.getMeetingByPublicId(meetingPublicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }
    return this.db.listMeetingFiles(meeting.id);
  }

  /**
   * Fetch a meeting file from R2.
   */
  async getMeetingFile(meetingPublicId: string, fileId: string): Promise<{ file: MeetingFile; r2Object: R2ObjectBody | null }> {
    const meeting = await this.db.getMeetingByPublicId(meetingPublicId);
    if (!meeting) {
      throw new Error('MEETING_NOT_FOUND: Meeting not found');
    }

    const file = await this.db.getMeetingFileById(fileId);
    if (!file || file.meeting_id !== meeting.id) {
      throw new Error('FILE_NOT_FOUND: Requested file does not exist');
    }

    let r2Object: R2ObjectBody | null = null;
    if (this.env.STORAGE) {
      r2Object = await this.env.STORAGE.get(file.r2_key);
    }

    return { file, r2Object };
  }
}
