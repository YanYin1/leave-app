import { handleApiRequest, type WorkerEnv } from '../../worker-api.ts';

interface PagesContext {
  request: Request;
  env: WorkerEnv;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleApiRequest(context.request, context.env);
}
