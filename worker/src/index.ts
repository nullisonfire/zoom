import { Database } from './db';
import { AuthService, buildSessionCookie, buildClearSessionCookie } from './auth';
import { MeetingService } from './meetings';
import { RealtimeService } from './realtime';
import { StorageService } from './storage';
import { MeetingRoom } from './rooms';
import {
  jsonResponse,
  errorResponse,
  handleCors,
  addCorsHeaders,
  getOptionalUser,
  requireAuth,
  checkRateLimit,
} from './middleware';
import { Env } from './types';

// Re-export Durable Object class so Cloudflare Workers runtime can instantiate it
export { MeetingRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');

    // Handle CORS preflight
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;

    try {
      const response = await handleRequest(request, env, ctx);
      return addCorsHeaders(response, origin);
    } catch (err: any) {
      console.error('[Worker Unhandled Error]', {
        message: err.message,
        path: new URL(request.url).pathname,
      });

      let code = 'INTERNAL_ERROR';
      let message = 'An unexpected error occurred';
      let status = 500;

      if (err.message && err.message.includes(':')) {
        const [errCode, errMsg] = err.message.split(':');
        code = errCode.trim();
        message = errMsg.trim();

        if (code === 'UNAUTHORIZED') status = 401;
        else if (code === 'FORBIDDEN') status = 403;
        else if (code.includes('NOT_FOUND')) status = 404;
        else if (code.includes('INVALID') || code.includes('WEAK') || code.includes('REQUIRED')) status = 400;
        else if (code.includes('EXISTS')) status = 409;
      }

      return addCorsHeaders(errorResponse(code, message, status), origin);
    }
  },
};

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const db = new Database(env.DB);
  const authService = new AuthService(db, env);
  const meetingService = new MeetingService(db, env);
  const realtimeService = new RealtimeService(env);
  const storageService = new StorageService(db, env);

  const isProduction = env.ENVIRONMENT === 'production';
  const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

  // ================= 1. AUTHENTICATION API =================

  // POST /api/auth/register
  if (path === '/api/auth/register' && method === 'POST') {
    if (!checkRateLimit(`register:${clientIp}`, 10, 60000)) {
      return errorResponse('RATE_LIMIT_EXCEEDED', 'Too many registration attempts. Please wait a minute.', 429);
    }

    const body = await request.json<any>();
    const { user, session } = await authService.register({
      email: body.email,
      password: body.password,
      name: body.name,
    });

    const cookie = buildSessionCookie(session.id, session.expires_at, isProduction);
    return jsonResponse(
      { user, sessionId: session.id },
      201,
      { 'Set-Cookie': cookie }
    );
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && method === 'POST') {
    if (!checkRateLimit(`login:${clientIp}`, 15, 60000)) {
      return errorResponse('RATE_LIMIT_EXCEEDED', 'Too many login attempts. Please wait a minute.', 429);
    }

    const body = await request.json<any>();
    const { user, session } = await authService.login({
      email: body.email,
      password: body.password,
    });

    const cookie = buildSessionCookie(session.id, session.expires_at, isProduction);
    return jsonResponse(
      { user, sessionId: session.id },
      200,
      { 'Set-Cookie': cookie }
    );
  }

  // POST /api/auth/logout
  if (path === '/api/auth/logout' && method === 'POST') {
    const auth = await getOptionalUser(request, authService);
    if (auth) {
      await authService.logout(auth.session.id);
    }
    const clearCookie = buildClearSessionCookie(isProduction);
    return jsonResponse({ message: 'Logged out successfully' }, 200, { 'Set-Cookie': clearCookie });
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && method === 'GET') {
    const auth = await getOptionalUser(request, authService);
    if (!auth) {
      return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    }
    return jsonResponse({ user: auth.user });
  }

  // ================= 2. MEETINGS API =================

  // POST /api/meetings (Create meeting)
  if (path === '/api/meetings' && method === 'POST') {
    const auth = await requireAuth(request, authService);
    const body = await request.json<any>();

    const meeting = await meetingService.createMeeting({
      userId: auth.user.id,
      title: body.title || 'Instant Meeting',
      password: body.password,
      scheduledAt: body.scheduledAt ? Number(body.scheduledAt) : undefined,
      settings: body.settings,
    });

    // Initialize Durable Object room state
    try {
      const doId = env.MEETING_ROOMS.idFromName(meeting.public_id);
      const room = env.MEETING_ROOMS.get(doId);
      await room.fetch(
        new Request('https://room.internal/init', {
          method: 'POST',
          body: JSON.stringify({
            publicId: meeting.public_id,
            title: meeting.title,
            hostUserId: auth.user.id,
            settings: meeting.settings,
          }),
        })
      );
    } catch (_) {}

    return jsonResponse({ meeting }, 201);
  }

  // GET /api/meetings (List user's meetings)
  if (path === '/api/meetings' && method === 'GET') {
    const auth = await requireAuth(request, authService);
    const meetings = await meetingService.listUserMeetings(auth.user.id);
    return jsonResponse({ meetings });
  }

  // Parameterized meeting routes
  const meetingPublicIdMatch = path.match(/^\/api\/meetings\/([a-zA-Z0-9_-]+)(.*)$/);
  if (meetingPublicIdMatch) {
    const publicId = meetingPublicIdMatch[1];
    const subPath = meetingPublicIdMatch[2];

    // GET /api/meetings/:publicId (Meeting lookup)
    if (subPath === '' && method === 'GET') {
      const auth = await getOptionalUser(request, authService);
      const meeting = await meetingService.getMeeting(publicId, auth?.user.id);
      return jsonResponse({ meeting });
    }

    // PATCH /api/meetings/:publicId (Update settings)
    if (subPath === '' && method === 'PATCH') {
      const auth = await requireAuth(request, authService);
      const body = await request.json<any>();
      const meeting = await meetingService.updateMeeting({
        publicId,
        userId: auth.user.id,
        title: body.title,
        settings: body.settings,
      });

      // Update Durable Object room settings
      try {
        const doId = env.MEETING_ROOMS.idFromName(publicId);
        const room = env.MEETING_ROOMS.get(doId);
        await room.fetch(
          new Request('https://room.internal/init', {
            method: 'POST',
            body: JSON.stringify({
              publicId,
              title: meeting.title,
              settings: meeting.settings,
            }),
          })
        );
      } catch (_) {}

      return jsonResponse({ meeting });
    }

    // POST /api/meetings/:publicId/join (Join verification & record)
    if (subPath === '/join' && method === 'POST') {
      const auth = await requireAuth(request, authService);
      const body = await request.json<any>().catch(() => ({}));
      const result = await meetingService.joinMeeting({
        publicId,
        user: auth.user,
        password: body.password,
      });
      return jsonResponse(result);
    }

    // POST /api/meetings/:publicId/end (Host ends meeting for everyone)
    if (subPath === '/end' && method === 'POST') {
      const auth = await requireAuth(request, authService);
      await meetingService.endMeeting(publicId, auth.user.id);
      return jsonResponse({ message: 'Meeting concluded successfully' });
    }

    // GET /api/meetings/:publicId/participants
    if (subPath === '/participants' && method === 'GET') {
      const auth = await requireAuth(request, authService);
      const participants = await meetingService.getParticipants(publicId, auth.user.id);
      return jsonResponse({ participants });
    }

    // ================= 3. CLOUDFLARE CALLS SFU & TURN API =================

    // POST /api/meetings/:publicId/realtime/session (Create Calls SFU Session)
    if (subPath === '/realtime/session' && method === 'POST') {
      await requireAuth(request, authService);
      const sessionResult = await realtimeService.createSession();
      return jsonResponse(sessionResult);
    }

    // POST /api/meetings/:publicId/realtime/tracks/new (Publish/Subscribe Tracks)
    if (subPath === '/realtime/tracks/new' && method === 'POST') {
      await requireAuth(request, authService);
      const body = await request.json<any>();
      const sessionId = body.sessionId;
      if (!sessionId) {
        return errorResponse('INVALID_REQUEST', 'sessionId is required in request body');
      }

      const trackResult = await realtimeService.newTracks(sessionId, {
        sessionDescription: body.sessionDescription,
        tracks: body.tracks,
      });

      return jsonResponse(trackResult);
    }

    // POST /api/meetings/:publicId/realtime/tracks/close
    if (subPath === '/realtime/tracks/close' && method === 'POST') {
      await requireAuth(request, authService);
      const body = await request.json<any>();
      if (!body.sessionId || !Array.isArray(body.trackNames)) {
        return errorResponse('INVALID_REQUEST', 'sessionId and trackNames array are required');
      }

      await realtimeService.closeTracks(body.sessionId, body.trackNames);
      return jsonResponse({ success: true });
    }

    // GET /api/meetings/:publicId/realtime/turn (Get Short-Lived TURN Credentials)
    if (subPath === '/realtime/turn' && method === 'GET') {
      await requireAuth(request, authService);
      const turnResult = await realtimeService.getTurnCredentials();
      return jsonResponse(turnResult);
    }

    // ================= 4. FILE SHARING (R2) =================

    // GET /api/meetings/:publicId/files (List shared files)
    if (subPath === '/files' && method === 'GET') {
      await requireAuth(request, authService);
      const files = await storageService.listMeetingFiles(publicId);
      return jsonResponse({ files });
    }

    // POST /api/meetings/:publicId/files (Upload file to meeting)
    if (subPath === '/files' && method === 'POST') {
      const auth = await requireAuth(request, authService);
      const contentType = request.headers.get('Content-Type') || '';

      let fileName = 'upload.bin';
      let fileData: ArrayBuffer;
      let mimeType = 'application/octet-stream';

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
          return errorResponse('INVALID_REQUEST', 'No file provided in form data');
        }
        fileName = file.name;
        mimeType = file.type || 'application/octet-stream';
        fileData = await file.arrayBuffer();
      } else {
        fileName = request.headers.get('X-File-Name') || 'upload.bin';
        mimeType = request.headers.get('X-File-Type') || contentType || 'application/octet-stream';
        fileData = await request.arrayBuffer();
      }

      const uploadedFile = await storageService.uploadMeetingFile({
        meetingPublicId: publicId,
        userId: auth.user.id,
        fileName,
        fileData,
        mimeType,
      });

      return jsonResponse({ file: uploadedFile }, 201);
    }

    // GET /api/meetings/:publicId/files/:fileId (Download file)
    const fileDownloadMatch = subPath.match(/^\/files\/([a-zA-Z0-9_-]+)$/);
    if (fileDownloadMatch && method === 'GET') {
      await requireAuth(request, authService);
      const fileId = fileDownloadMatch[1];
      const { file, r2Object } = await storageService.getMeetingFile(publicId, fileId);

      if (!r2Object) {
        return errorResponse('FILE_NOT_FOUND', 'File data not found in storage', 404);
      }

      const headers = new Headers();
      r2Object.writeHttpMetadata(headers);
      headers.set('etag', r2Object.httpEtag);
      headers.set('Content-Disposition', `attachment; filename="${file.file_name}"`);

      return new Response(r2Object.body, { headers });
    }
  }

  // ================= 5. USER PROFILE & AVATAR API =================

  // PATCH /api/users/me (Update name)
  if (path === '/api/users/me' && method === 'PATCH') {
    const auth = await requireAuth(request, authService);
    const body = await request.json<any>();
    if (!body.name || body.name.trim().length < 2) {
      return errorResponse('INVALID_NAME', 'Name must be at least 2 characters');
    }

    await db.updateUser(auth.user.id, { name: body.name.trim() });
    const updated = await db.getUserById(auth.user.id);
    return jsonResponse({ user: updated });
  }

  // PUT /api/users/me/avatar (Upload avatar to R2)
  if (path === '/api/users/me/avatar' && method === 'PUT') {
    const auth = await requireAuth(request, authService);
    const contentType = request.headers.get('Content-Type') || '';
    const fileData = await request.arrayBuffer();

    const avatarKey = await storageService.uploadAvatar(auth.user.id, fileData, contentType);
    const updated = await db.getUserById(auth.user.id);
    return jsonResponse({ user: updated, avatarKey });
  }

  // GET /api/users/me/avatar
  if (path === '/api/users/me/avatar' && method === 'GET') {
    const auth = await requireAuth(request, authService);
    if (!auth.user.avatar_key) {
      return errorResponse('NOT_FOUND', 'No avatar configured', 404);
    }

    const r2Object = await storageService.getAvatar(auth.user.avatar_key);
    if (!r2Object) {
      return errorResponse('NOT_FOUND', 'Avatar file not found in storage', 404);
    }

    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set('etag', r2Object.httpEtag);
    return new Response(r2Object.body, { headers });
  }

  // ================= 6. DURABLE OBJECT WEBSOCKET ROUTE =================

  // GET /api/rooms/:publicId/websocket
  const wsMatch = path.match(/^\/api\/rooms\/([a-zA-Z0-9_-]+)\/websocket$/);
  if (wsMatch) {
    const publicId = wsMatch[1];
    const meeting = await meetingService.getMeeting(publicId);

    if (meeting.status === 'ended') {
      return errorResponse('MEETING_ENDED', 'This meeting has ended', 410);
    }

    // Get or create Durable Object for this meeting
    const doId = env.MEETING_ROOMS.idFromName(publicId);
    const room = env.MEETING_ROOMS.get(doId);

    // Ensure room metadata is initialized
    await room.fetch(
      new Request('https://room.internal/init', {
        method: 'POST',
        body: JSON.stringify({
          publicId,
          title: meeting.title,
          hostUserId: meeting.host_user_id,
          settings: meeting.settings,
        }),
      })
    );

    // Forward WebSocket upgrade request to the Durable Object
    const doRequestUrl = new URL(request.url);
    doRequestUrl.pathname = '/websocket';
    return room.fetch(new Request(doRequestUrl.toString(), request));
  }

  // Health check endpoint
  if (path === '/api/health' && method === 'GET') {
    return jsonResponse({
      status: 'healthy',
      time: new Date().toISOString(),
      environment: env.ENVIRONMENT || 'development',
    });
  }

  return errorResponse('NOT_FOUND', `Route ${method} ${path} not found`, 404);
}
