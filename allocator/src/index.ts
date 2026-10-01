import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthError,
  isName,
  isRole,
  signEdgeTicket,
  verifyAccessToken,
  type Role,
} from '../../shared/auth';
import { clusterSecret, int, optional, str } from '../../shared/env';
import { HttpError, jsonHandler, postJson, readJson, sendJson } from '../../shared/http';
import type { AllocateRequest, AllocateResponse } from '../../shared/internal';
import { createLogger } from '../../shared/logger';
import type { AllocateRequestBody, AllocateResponseBody, RenewResponseBody } from '../../protocol/index';
import { demoProject, getProject, startPlatformProjectStore, startProjectStore, type Project } from './projects';

/**
 * Allocator: the public access point. A client asks "where do I connect for this channel?";
 * we check the token, the project and its quota, then return ranked media nodes and an edge
 * ticket the chosen node will accept.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('allocator');

const config = {
  listenIp: str('ALLOCATOR_LISTEN_IP', '0.0.0.0'),
  port: int('ALLOCATOR_PORT', 4100),
  orchestratorUrl: str('ORCHESTRATOR_URL', 'http://127.0.0.1:4200'),
  projectsFile: str('PROJECTS_FILE', path.resolve(here, '../../config/projects.json')),
  /** The Laravel console. Set to source projects from it instead of the local JSON file. */
  platformUrl: optional('PLATFORM_URL'),
  secret: clusterSecret(),
};

if (config.platformUrl) {
  startPlatformProjectStore(config.platformUrl, config.secret);
  log.info('projects sourced from the platform', { url: config.platformUrl });
} else {
  startProjectStore(config.projectsFile);
}

const authStatus: Record<string, number> = {
  invalid_token: 401,
  token_expired: 401,
  wrong_app: 403,
  wrong_channel: 403,
  wrong_uid: 403,
};

type Grant = { uid: string; role: Role; sessionExp: number | null };

function activeProject(appId: unknown): Project {
  if (typeof appId !== 'string') throw new HttpError(400, 'invalid_request', 'appId is required');
  const project = getProject(appId);
  if (!project) throw new HttpError(404, 'project_not_found', 'No project with this App ID');
  if (project.status !== 'active') throw new HttpError(403, 'project_suspended', 'This project is suspended');
  return project;
}

/** Who is joining, with which role, until when. From the token, or from the request in testing mode. */
function grantFor(project: Project, body: AllocateRequestBody): Grant {
  if (!isName(body.channel)) {
    throw new HttpError(400, 'invalid_request', 'channel must be 1–64 characters: letters, digits, "_", "-" or "."');
  }
  if (project.authMode === 'appIdOnly' && !body.token) {
    if (!isName(body.uid)) throw new HttpError(400, 'invalid_request', 'uid is required (1–64 characters)');
    if (body.role !== undefined && !isRole(body.role)) {
      throw new HttpError(400, 'invalid_request', 'role must be host, speaker or audience');
    }
    // Testing mode has no token to limit anyone, so every role is allowed; the client picks its start role.
    return { uid: body.uid, role: 'host', sessionExp: null };
  }
  if (typeof body.token !== 'string' || body.token === '') {
    throw new HttpError(401, 'token_required', 'This project needs an access token');
  }
  try {
    const claims = verifyAccessToken(body.token, project.certificates, {
      appId: project.appId,
      channel: body.channel,
      uid: body.uid,
    });
    return { uid: claims.uid, role: claims.role, sessionExp: claims.exp };
  } catch (error) {
    if (error instanceof AuthError) throw new HttpError(authStatus[error.code] ?? 401, error.code, error.message);
    throw error;
  }
}

async function allocate(body: AllocateRequestBody): Promise<AllocateResponseBody> {
  const project = activeProject(body.appId);
  const grant = grantFor(project, body);
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((e) => typeof e === 'string').slice(0, 10) : [];

  const request: AllocateRequest = {
    appId: project.appId,
    channel: body.channel,
    uid: grant.uid,
    exclude,
    limits: project.limits,
  };
  const { edges } = await postJson<AllocateResponse>(`${config.orchestratorUrl}/internal/allocate`, request, config.secret);
  const ticket = signEdgeTicket(
    { appId: project.appId, channel: body.channel, uid: grant.uid, role: grant.role, sessionExp: grant.sessionExp },
    config.secret,
  );
  return { edges, ticket, uid: grant.uid, channel: body.channel, maxRole: grant.role, sessionExpiresAt: grant.sessionExp };
}

/** A fresh ticket for a session that is already connected, carrying the new token's expiry. */
function renew(body: AllocateRequestBody): RenewResponseBody {
  const project = activeProject(body.appId);
  if (!isName(body.uid)) throw new HttpError(400, 'invalid_request', 'uid is required');
  const grant = grantFor(project, body);
  const ticket = signEdgeTicket(
    { appId: project.appId, channel: body.channel, uid: grant.uid, role: grant.role, sessionExp: grant.sessionExp },
    config.secret,
  );
  return { ticket, sessionExpiresAt: grant.sessionExp };
}

const handler = jsonHandler(
  async (req, res, url) => {
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'GET /v1/health':
        sendJson(res, 200, { ok: true }, true);
        return;
      case 'POST /v1/allocate': {
        const body = await readJson<AllocateRequestBody>(req, 16 * 1024);
        const result = await allocate(body);
        log.info('allocated', { appId: body.appId, channel: body.channel, uid: result.uid, node: result.edges[0]?.nodeId });
        sendJson(res, 200, result, true);
        return;
      }
      case 'POST /v1/renew':
        sendJson(res, 200, renew(await readJson<AllocateRequestBody>(req, 16 * 1024)), true);
        return;
      case 'GET /v1/demo': {
        // The App ID of the public testing-mode project, for the website demo and test pages.
        const demo = demoProject();
        if (!demo) throw new HttpError(404, 'no_demo_project', 'No demo project is configured');
        sendJson(res, 200, { appId: demo.appId }, true);
        return;
      }
    }
    throw new HttpError(404, 'not_found', `No route ${route}`);
  },
  {
    cors: true,
    onError: (error) => log.error('request failed', { error: String(error), stack: (error as Error).stack }),
  },
);

const server = http.createServer(handler);
server.listen(config.port, config.listenIp, () => {
  log.info('allocator listening', { url: `http://${config.listenIp}:${config.port}`, orchestrator: config.orchestratorUrl });
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
