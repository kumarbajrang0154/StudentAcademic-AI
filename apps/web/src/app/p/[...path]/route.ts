import { NextRequest } from "next/server";
import { handleFastifyRequest } from "@/lib/fastify-handler";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}

export async function PUT(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}

export async function OPTIONS(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}

export async function HEAD(request: NextRequest): Promise<Response> {
  return handleFastifyRequest(request);
}
