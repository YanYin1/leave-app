import { handleApiRequest, type WorkerEnv } from './worker-api.ts';

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

interface FullWorkerEnv extends WorkerEnv {
  ASSETS: AssetsFetcher;
}

export default {
  async fetch(request: Request, env: FullWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
