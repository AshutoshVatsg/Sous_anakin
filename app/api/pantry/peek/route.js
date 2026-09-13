import { peek } from '../../../../src/cloudcart.js';

export const runtime = 'nodejs';

/** Diagnostic only: what the held cloud browser is showing right now. */
export async function GET() {
  return Response.json(await peek());
}
