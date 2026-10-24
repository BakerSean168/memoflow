/**
 * Specs for the OpenTelemetry trace Port (RefArch Phase 6).
 * OpenTelemetry trace Port 的规格（RefArch 阶段 6）。
 *
 * Uses a real W3C propagator and an in-memory span exporter to prove: one
 * SERVER span per request, status/end from the terminal observation, valid
 * incoming W3C parent continuation, `runWithContext` propagation, and the
 * default noop lane allocating no trace and exporting nothing.
 *
 * 使用真实 W3C propagator 与内存 span exporter 证明：每请求一个 SERVER span、
 * 由 terminal observation 设置状态/结束、有效 incoming W3C parent 续接、
 * `runWithContext` 传播，以及默认 noop lane 不分配 trace 且零导出。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { Request } from 'express';
import { OpenTelemetryHttpRequestTrace } from './opentelemetry-http-request-trace';
import { NOOP_HTTP_REQUEST_TRACE } from './noop-http-request-trace';
import type { HttpRequestObservation } from './http-request-observation';

const VALID_TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

const TRACE_ID_REGEX = /^[0-9a-f]{32}$/;

let provider: TracerProvider;
let exporter: InMemorySpanExporter;

function mockRequest(headers: Record<string, string> = {}): Request {
  return { method: 'GET', headers } as unknown as Request;
}

function observation(overrides: Partial<HttpRequestObservation> = {}): HttpRequestObservation {
  return {
    requestId: 'req-1',
    traceId: 'req-1',
    method: 'GET',
    routeTemplate: '/api/goals/:id',
    statusCode: 200,
    outcome: 'finished',
    durationMs: 10,
    ...overrides,
  };
}

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  exporter = new InMemorySpanExporter();
  provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  trace.setGlobalTracerProvider(provider);
});

beforeEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

/** Awaits pending span exports so assertions see finished spans.
 *  等待挂起的 span 导出，使断言能看到 finished spans。 */
async function flush(): Promise<void> {
  await provider.forceFlush();
}

describe('OpenTelemetryHttpRequestTrace (opt-in)', () => {
  it('creates exactly one SERVER span per request with HTTP semantic attributes', async () => {
    const span = new OpenTelemetryHttpRequestTrace().startSpan(mockRequest());
    span.complete(observation({ statusCode: 201 }));

    await flush();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const finished = spans[0]!;
    expect(finished.kind).toBe(SpanKind.SERVER);
    expect(finished.attributes[SemanticAttributes.HTTP_METHOD]).toBe('GET');
    expect(finished.attributes[SemanticAttributes.HTTP_ROUTE]).toBe('/api/goals/:id');
    expect(finished.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toBe(201);
    expect(finished.attributes['memoflow.request_id']).toBe('req-1');
    expect(finished.attributes['http.outcome']).toBe('finished');
    expect(finished.status.code).toBe(SpanStatusCode.OK);
  });

  it('never records identity/request headers or body in span attributes', async () => {
    const span = new OpenTelemetryHttpRequestTrace().startSpan(
      mockRequest({ authorization: 'Bearer secret', cookie: 'session=s' }),
    );
    span.complete(observation({ identityId: 'identity-secret' }));

    await flush();
    const attributes = exporter.getFinishedSpans()[0]!.attributes;
    expect(JSON.stringify(attributes)).not.toContain('secret');
    expect(JSON.stringify(attributes)).not.toContain('identity-secret');
  });

  it('never exports Provider onboarding apiKey or Authorization as span attributes', async () => {
    const request = {
      method: 'POST',
      headers: { authorization: 'Bearer provider-session-secret' },
      body: { catalogId: 'openrouter', apiKey: 'sk-provider-onboarding-secret' },
    } as unknown as Request;
    const span = new OpenTelemetryHttpRequestTrace().startSpan(request);
    span.complete(
      observation({
        method: 'POST',
        routeTemplate: '/api/v1/ai/provider-connections/probe',
      }),
    );

    await flush();
    const serialized = JSON.stringify(exporter.getFinishedSpans()[0]!.attributes);
    expect(serialized).not.toContain('provider-session-secret');
    expect(serialized).not.toContain('sk-provider-onboarding-secret');
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('authorization');
  });

  it('marks 401/500 and aborted outcomes as error spans', async () => {
    const serverError = new OpenTelemetryHttpRequestTrace().startSpan(mockRequest());
    serverError.complete(observation({ statusCode: 500 }));

    const unauthorized = new OpenTelemetryHttpRequestTrace().startSpan(mockRequest());
    unauthorized.complete(observation({ statusCode: 401 }));

    const aborted = new OpenTelemetryHttpRequestTrace().startSpan(mockRequest());
    aborted.complete(observation({ statusCode: 200, outcome: 'aborted' }));

    await flush();
    const spans = exporter.getFinishedSpans();
    expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[1]!.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[2]!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('continues a valid incoming W3C parent trace', async () => {
    const span = new OpenTelemetryHttpRequestTrace().startSpan(
      mockRequest({ traceparent: VALID_TRACEPARENT }),
    );
    span.complete(observation());

    await flush();
    const finished = exporter.getFinishedSpans()[0]!;
    expect(finished.spanContext().traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('exposes a real trace ID and runs the continuation inside the span context', () => {
    const span = new OpenTelemetryHttpRequestTrace().startSpan(mockRequest());
    expect(span.traceId).toMatch(TRACE_ID_REGEX);

    let observedTraceId: string | undefined;
    span.runWithContext(() => {
      observedTraceId = trace.getSpan(context.active())?.spanContext().traceId;
    });
    expect(observedTraceId).toBe(span.traceId);
  });

  it('injects W3C traceparent/tracestate from the active span', () => {
    const span = new OpenTelemetryHttpRequestTrace().startSpan(mockRequest());
    let carrier: Record<string, string> = {};
    span.runWithContext(() => {
      carrier = {};
      propagation.inject(context.active(), carrier);
    });

    expect(carrier.traceparent).toBeTruthy();
    expect(carrier.traceparent).toContain(span.traceId);
  });
});

describe('NoopHttpRequestTrace (default, OTel disabled)', () => {
  it('exposes no trace ID, runs in the ambient context and exports nothing', async () => {
    const span = NOOP_HTTP_REQUEST_TRACE.startSpan(mockRequest());
    expect(span.traceId).toBeUndefined();

    let ran = false;
    span.runWithContext(() => {
      ran = true;
    });
    expect(ran).toBe(true);

    span.complete(observation());
    await flush();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});
